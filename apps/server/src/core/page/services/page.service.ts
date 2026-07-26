import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { InsertablePage, Page, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  executeWithPagination,
  PaginationResult,
} from '@docmost/db/pagination/pagination';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { MovePageDto } from '../dto/move-page.dto';
import { generateSlugId } from '../../../common/helpers';
import { executeTx } from '@docmost/db/utils';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { v7 as uuid7 } from 'uuid';
import {
  createYdocFromJson,
  getAttachmentIds,
  getProsemirrorContent,
  isAttachmentNode,
  removeMarkTypeFromDoc,
} from '../../../common/helpers/prosemirror/utils';
import { jsonToNode, jsonToText } from 'src/collaboration/collaboration.util';
import {
  CopyPageMapEntry,
  ICopyPageAttachment,
} from '../dto/duplicate-page.dto';
import { Node as PMNode } from '@tiptap/pm/model';
import { StorageService } from '../../../integrations/storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EventName } from '../../../common/events/event.contants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PageManageListDto, PagePropertiesBatchUpdateDto } from '../dto/page-properties.dto';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { sql } from 'kysely';
import {
  DEFAULT_ENABLED_PAGE_PROPERTIES,
  DEFAULT_PAGE_STATUS_OPTIONS,
  PAGE_PROPERTY_FIELD_TO_KEY,
  PagePropertyKey,
} from '../constants/page-properties.constants';

@Injectable()
export class PageService {
  private readonly logger = new Logger(PageService.name);
  private readonly defaultStatusOptions = [...DEFAULT_PAGE_STATUS_OPTIONS];

  constructor(
    private pageRepo: PageRepo,
    private spaceRepo: SpaceRepo,
    private spaceMemberRepo: SpaceMemberRepo,
    private attachmentRepo: AttachmentRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    private eventEmitter: EventEmitter2,
  ) {}

  normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const raw of tags) {
      const value = raw?.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(value);
      }
    }
    return normalized;
  }

  async getSpacePropertyConfig(spaceId: string, workspaceId: string) {
    const config = await this.spaceRepo.findPagePropertyStatusConfig(
      spaceId,
      workspaceId,
    );

    return {
      statusOptions:
        config?.statusOptions && Array.isArray(config.statusOptions)
          ? (config.statusOptions as string[])
          : this.defaultStatusOptions,
      enabledProperties:
        config?.enabledProperties && Array.isArray(config.enabledProperties)
          ? (config.enabledProperties as PagePropertyKey[])
          : DEFAULT_ENABLED_PAGE_PROPERTIES,
    };
  }

  async getSpaceStatusOptions(spaceId: string, workspaceId: string) {
    return (await this.getSpacePropertyConfig(spaceId, workspaceId))
      .statusOptions;
  }

  async assertValidOwner(
    ownerId: string | null | undefined,
    spaceId: string,
    workspaceId: string,
  ) {
    if (!ownerId) return;

    const owner = await this.db
      .selectFrom('users')
      .select(['id'])
      .where('id', '=', ownerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!owner) {
      throw new BadRequestException('Owner must belong to current workspace');
    }

    const ownerSpaces = await this.spaceMemberRepo.getUserSpaceIds(ownerId);
    if (!ownerSpaces.includes(spaceId)) {
      throw new BadRequestException('Owner must have access to this space');
    }
  }

  async buildPropertyUpdateData(
    spaceId: string,
    workspaceId: string,
    dto: {
      ownerId?: string | null;
      status?: string | null;
      priority?: string | null;
      dueAt?: string | Date | null;
      tags?: string[];
    },
    opts?: {
      allowNull?: boolean;
      enabledProperties?: PagePropertyKey[];
    },
  ) {
    const updateData: Record<string, any> = {};
    const allowNull = Boolean(opts?.allowNull);
    const enabledProperties =
      opts?.enabledProperties ??
      (await this.getSpacePropertyConfig(spaceId, workspaceId))
        .enabledProperties;

    for (const [field, propertyKey] of Object.entries(
      PAGE_PROPERTY_FIELD_TO_KEY,
    )) {
      if (
        dto[field as keyof typeof dto] !== undefined &&
        !enabledProperties.includes(propertyKey)
      ) {
        throw new BadRequestException({
          code: 'PROPERTY_DISABLED',
          message: `Page property is disabled: ${propertyKey}`,
          property: propertyKey,
        });
      }
    }

    if (dto.ownerId !== undefined) {
      if (dto.ownerId === null && allowNull) {
        updateData.propertyOwnerId = null;
      } else {
        await this.assertValidOwner(dto.ownerId as string, spaceId, workspaceId);
        updateData.propertyOwnerId = dto.ownerId;
      }
    }

    if (dto.status !== undefined) {
      if (dto.status === null && allowNull) {
        updateData.propertyStatus = null;
      } else {
        const statusOptions = await this.getSpaceStatusOptions(spaceId, workspaceId);
        if (!statusOptions.includes(dto.status as string)) {
          throw new BadRequestException('Status is not in space status options');
        }
        updateData.propertyStatus = dto.status;
      }
    }

    if (dto.priority !== undefined) {
      // Priority values are validated at the DTO level (P0-P3); a null clears it.
      updateData.propertyPriority = dto.priority;
    }

    if (dto.dueAt !== undefined) {
      if (dto.dueAt === null && allowNull) {
        updateData.propertyDueAt = null;
      } else {
        const parsed = new Date(dto.dueAt as string | Date);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('Invalid dueAt');
        }
        updateData.propertyDueAt = parsed;
      }
    }

    if (dto.tags !== undefined) {
      const tags = this.normalizeTags(dto.tags);
      if (tags.length > 50) {
        throw new BadRequestException('A page can have at most 50 tags');
      }
      if (tags.some((tag) => tag.length > 64)) {
        throw new BadRequestException(
          'Each page property tag must be at most 64 characters',
        );
      }
      updateData.propertyTags = tags;
    }

    return updateData;
  }

  async findById(
    pageId: string,
    includeContent?: boolean,
    includeYdoc?: boolean,
    includeSpace?: boolean,
  ): Promise<Page> {
    return this.pageRepo.findById(pageId, {
      includeContent,
      includeYdoc,
      includeSpace,
    });
  }

  async create(
    userId: string,
    workspaceId: string,
    createPageDto: CreatePageDto,
  ): Promise<Page> {
    let parentPageId = undefined;

    // check if parent page exists
    if (createPageDto.parentPageId) {
      const parentPage = await this.pageRepo.findById(
        createPageDto.parentPageId,
      );

      if (!parentPage || parentPage.spaceId !== createPageDto.spaceId) {
        throw new NotFoundException('Parent page not found');
      }

      parentPageId = parentPage.id;
    }

    const propertyConfig = await this.getSpacePropertyConfig(
      createPageDto.spaceId,
      workspaceId,
    );
    const propertyUpdateData = await this.buildPropertyUpdateData(
      createPageDto.spaceId,
      workspaceId,
      {
        ownerId: propertyConfig.enabledProperties.includes('owner')
          ? (createPageDto.ownerId ?? userId)
          : createPageDto.ownerId,
        status: createPageDto.status,
        priority: createPageDto.priority,
        dueAt: createPageDto.dueAt,
        tags: createPageDto.tags,
      },
      { enabledProperties: propertyConfig.enabledProperties },
    );

    const createdPage = await this.pageRepo.insertPage({
      slugId: generateSlugId(),
      title: createPageDto.title,
      position: await this.nextPagePosition(
        createPageDto.spaceId,
        parentPageId,
      ),
      icon: createPageDto.icon,
      parentPageId: parentPageId,
      spaceId: createPageDto.spaceId,
      creatorId: userId,
      workspaceId: workspaceId,
      lastUpdatedById: userId,
      ...propertyUpdateData,
    });

    return createdPage;
  }

  async nextPagePosition(spaceId: string, parentPageId?: string) {
    let pagePosition: string;

    const lastPageQuery = this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);

    if (parentPageId) {
      // check for children of this page
      const lastPage = await lastPageQuery
        .where('parentPageId', '=', parentPageId)
        .executeTakeFirst();

      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null);
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    } else {
      // for root page
      const lastPage = await lastPageQuery
        .where('parentPageId', 'is', null)
        .executeTakeFirst();

      // if no existing page, make this the first
      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null); // we expect "a0"
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    }

    return pagePosition;
  }

  async update(
    page: Page,
    updatePageDto: UpdatePageDto,
    userId: string,
  ): Promise<Page> {
    const contributors = new Set<string>(page.contributorIds || []);
    contributors.add(userId);
    const contributorIds = Array.from(contributors);

    const propertyUpdateData = await this.buildPropertyUpdateData(
      page.spaceId,
      page.workspaceId,
      {
        ownerId: updatePageDto.ownerId,
        status: updatePageDto.status,
        priority: updatePageDto.priority,
        dueAt: updatePageDto.dueAt,
        tags: updatePageDto.tags,
      },
      { allowNull: true },
    );

    await this.pageRepo.updatePage(
      {
        title: updatePageDto.title,
        icon: updatePageDto.icon,
        lastUpdatedById: userId,
        updatedAt: new Date(),
        contributorIds: contributorIds,
        ...propertyUpdateData,
      },
      page.id,
    );

    return await this.pageRepo.findById(page.id, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includePropertyOwner: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
    });
  }

  async getPageManageList(
    dto: PageManageListDto,
    pagination: PaginationOptions,
  ) {
    let query = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'spaceId',
        'updatedAt',
        'propertyOwnerId',
        'propertyStatus',
        'propertyPriority',
        'propertyDueAt',
        'propertyTags',
      ])
      .select((eb) => [this.pageRepo.withSpace(eb), this.pageRepo.withCreator(eb)])
      .leftJoin('users as owner', 'owner.id', 'pages.propertyOwnerId')
      .select(['owner.id as ownerId', 'owner.name as ownerName', 'owner.avatarUrl as ownerAvatarUrl'])
      .where('pages.deletedAt', 'is', null)
      .where('pages.spaceId', '=', dto.spaceId);

    if (dto.keyword?.trim()) {
      query = query.where((eb) =>
        eb('pages.title', 'ilike', `%${dto.keyword.trim()}%`),
      );
    }

    if (dto.status?.length) {
      query = query.where('pages.propertyStatus', 'in', dto.status);
    }

    if (dto.priority?.length) {
      query = query.where('pages.propertyPriority', 'in', dto.priority);
    }

    if (dto.ownerIds?.length) {
      query = query.where('pages.propertyOwnerId', 'in', dto.ownerIds);
    }

    if (dto.tags?.length) {
      const tags = this.normalizeTags(dto.tags).map((v) => v.toLowerCase());
      if (tags.length > 0) {
        query = query.where(
          sql<boolean>`exists (select 1 from unnest(pages.property_tags) as tag where lower(tag) in (${sql.join(
            tags.map((tag) => sql`${tag}`),
          )}))`,
        );
      }
    }

    if (dto.dueRange?.from) {
      query = query.where('pages.propertyDueAt', '>=', new Date(dto.dueRange.from));
    }
    if (dto.dueRange?.to) {
      query = query.where('pages.propertyDueAt', '<=', new Date(dto.dueRange.to));
    }

    const sortBy = dto.sortBy || 'updatedAt';
    const sortOrder = dto.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortColumn =
      sortBy === 'dueAt'
        ? 'pages.propertyDueAt'
        : sortBy === 'priority'
          ? 'pages.propertyPriority'
          : 'pages.updatedAt';
    query = query.orderBy(sortColumn as any, sortOrder);

    const result = executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit || 50,
    });

    return result;
  }

  async getSpacePropertyTags(spaceId: string) {
    const result = await sql<{ tag: string; usageCount: number }>`
      select min(tag) as tag, count(*)::int as "usageCount"
      from pages
      cross join lateral unnest(property_tags) as tag
      where space_id = ${spaceId}
        and deleted_at is null
      group by lower(tag)
      order by count(*) desc, lower(min(tag)) asc
    `.execute(this.db);

    return result.rows.map((row) => row.tag);
  }

  async batchUpdatePageProperties(
    dto: PagePropertiesBatchUpdateDto,
    userId: string,
    workspaceId: string,
  ) {
    const pageIds = Array.from(new Set(dto.pageIds));
    const pageRows = await this.db
      .selectFrom('pages')
      .select(['id', 'spaceId', 'workspaceId'])
      .where('id', 'in', pageIds)
      .where('deletedAt', 'is', null)
      .execute();

    const pageMap = new Map(pageRows.map((p) => [p.id, p]));
    const failed: Array<{ pageId: string; code: string; message: string }> = [];
    let successCount = 0;

    let patchData: Record<string, any> = {};
    try {
      patchData = await this.buildPropertyUpdateData(
        dto.spaceId,
        workspaceId,
        dto.patch,
        { allowNull: true },
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Invalid patch payload';
      throw new BadRequestException(message);
    }

    const userSpaces = await this.spaceMemberRepo.getUserSpaceIds(userId);

    for (const pageId of pageIds) {
      const page = pageMap.get(pageId);
      if (!page) {
        failed.push({
          pageId,
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
        continue;
      }
      if (page.spaceId !== dto.spaceId || page.workspaceId !== workspaceId) {
        failed.push({
          pageId,
          code: 'SPACE_MISMATCH',
          message: 'Page does not belong to target space',
        });
        continue;
      }

      if (!userSpaces.includes(dto.spaceId)) {
        failed.push({
          pageId,
          code: 'FORBIDDEN',
          message: 'No permission to edit this page',
        });
        continue;
      }

      try {
        await this.pageRepo.updatePage(
          {
            ...patchData,
            lastUpdatedById: userId,
          },
          pageId,
        );
        successCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to update page properties for ${pageId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        failed.push({
          pageId,
          code: 'UPDATE_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update page properties',
        });
      }
    }

    return { successCount, failed };
  }

  async getSidebarPages(
    spaceId: string,
    pagination: PaginationOptions,
    pageId?: string,
  ): Promise<any> {
    let query = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'position',
        'parentPageId',
        'spaceId',
        'creatorId',
        'deletedAt',
      ])
      .select((eb) => this.pageRepo.withHasChildren(eb))
      .orderBy('position', (ob) => ob.collate('C').asc())
      .where('deletedAt', 'is', null)
      .where('spaceId', '=', spaceId);

    if (pageId) {
      query = query.where('parentPageId', '=', pageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    const result = executeWithPagination(query, {
      page: pagination.page,
      perPage: 250,
    });

    return result;
  }

  async movePageToSpace(rootPage: Page, spaceId: string) {
    await executeTx(this.db, async (trx) => {
      // Update root page
      const nextPosition = await this.nextPagePosition(spaceId);
      await this.pageRepo.updatePage(
        { spaceId, parentPageId: null, position: nextPosition },
        rootPage.id,
        trx,
      );
      const pageIds = await this.pageRepo
        .getPageAndDescendants(rootPage.id, { includeContent: false })
        .then((pages) => pages.map((page) => page.id));
      // The first id is the root page id
      if (pageIds.length > 1) {
        // Update sub pages
        await this.pageRepo.updatePages(
          { spaceId },
          pageIds.filter((id) => id !== rootPage.id),
          trx,
        );
      }

      if (pageIds.length > 0) {
        const targetPropertyConfig = await this.getSpacePropertyConfig(
          spaceId,
          rootPage.workspaceId,
        );

        await trx
          .updateTable('pages')
          .set({ propertyOwnerId: null })
          .where('id', 'in', pageIds)
          .where('propertyOwnerId', 'is not', null)
          .where(
            sql<boolean>`not exists (
              select 1
              from space_members sm
              left join group_users gu on gu.group_id = sm.group_id
              where sm.space_id = ${spaceId}
                and (
                  sm.user_id = pages.property_owner_id
                  or gu.user_id = pages.property_owner_id
                )
            )`,
          )
          .execute();

        await trx
          .updateTable('pages')
          .set({ propertyStatus: null })
          .where('id', 'in', pageIds)
          .where('propertyStatus', 'is not', null)
          .where(
            'propertyStatus',
            'not in',
            targetPropertyConfig.statusOptions,
          )
          .execute();

        // update spaceId in shares
        await trx
          .updateTable('shares')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIds)
          .execute();

        // Update comments
        await trx
          .updateTable('comments')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIds)
          .execute();

        // Update attachments
        await this.attachmentRepo.updateAttachmentsByPageId(
          { spaceId },
          pageIds,
          trx,
        );

        await this.aiQueue.add(QueueJob.PAGE_MOVED_TO_SPACE, {
          pageId: pageIds,
          workspaceId: rootPage.workspaceId
        });
      }
    });
  }

  async duplicatePage(
    rootPage: Page,
    targetSpaceId: string | undefined,
    authUser: User,
  ) {
    const spaceId = targetSpaceId || rootPage.spaceId;
    const isDuplicateInSameSpace =
      !targetSpaceId || targetSpaceId === rootPage.spaceId;

    let nextPosition: string;

    if (isDuplicateInSameSpace) {
      // For duplicate in same space, position right after the original page
      nextPosition = generateJitteredKeyBetween(rootPage.position, null);
    } else {
      // For copy to different space, position at the end
      nextPosition = await this.nextPagePosition(spaceId);
    }

    const pages = await this.pageRepo.getPageAndDescendants(rootPage.id, {
      includeContent: true,
    });

    const pageMap = new Map<string, CopyPageMapEntry>();
    pages.forEach((page) => {
      pageMap.set(page.id, {
        newPageId: uuid7(),
        newSlugId: generateSlugId(),
        oldSlugId: page.slugId,
      });
    });

    const attachmentMap = new Map<string, ICopyPageAttachment>();

    const insertablePages: InsertablePage[] = await Promise.all(
      pages.map(async (page) => {
        const pageContent = getProsemirrorContent(page.content);
        const pageFromMap = pageMap.get(page.id);

        const doc = jsonToNode(pageContent);
        const prosemirrorDoc = removeMarkTypeFromDoc(doc, 'comment');

        const attachmentIds = getAttachmentIds(prosemirrorDoc.toJSON());

        if (attachmentIds.length > 0) {
          attachmentIds.forEach((attachmentId: string) => {
            const newPageId = pageFromMap.newPageId;
            const newAttachmentId = uuid7();
            attachmentMap.set(attachmentId, {
              newPageId: newPageId,
              oldPageId: page.id,
              oldAttachmentId: attachmentId,
              newAttachmentId: newAttachmentId,
            });

            prosemirrorDoc.descendants((node: PMNode) => {
              if (isAttachmentNode(node.type.name)) {
                if (node.attrs.attachmentId === attachmentId) {
                  //@ts-ignore
                  node.attrs.attachmentId = newAttachmentId;

                  if (node.attrs.src) {
                    //@ts-ignore
                    node.attrs.src = node.attrs.src.replace(
                      attachmentId,
                      newAttachmentId,
                    );
                  }
                  if (node.attrs.src) {
                    //@ts-ignore
                    node.attrs.src = node.attrs.src.replace(
                      attachmentId,
                      newAttachmentId,
                    );
                  }
                }
              }
            });
          });
        }

        // Update internal page links in mention nodes
        prosemirrorDoc.descendants((node: PMNode) => {
          if (
            node.type.name === 'mention' &&
            node.attrs.entityType === 'page'
          ) {
            const referencedPageId = node.attrs.entityId;

            // Check if the referenced page is within the pages being copied
            if (referencedPageId && pageMap.has(referencedPageId)) {
              const mappedPage = pageMap.get(referencedPageId);
              //@ts-ignore
              node.attrs.entityId = mappedPage.newPageId;
              //@ts-ignore
              node.attrs.slugId = mappedPage.newSlugId;
            }
          }
        });

        const prosemirrorJson = prosemirrorDoc.toJSON();

        // Add "Copy of " prefix to the root page title only for duplicates in same space
        let title = page.title;
        if (isDuplicateInSameSpace && page.id === rootPage.id) {
          const originalTitle = page.title || 'Untitled';
          title = `Copy of ${originalTitle}`;
        }

        return {
          id: pageFromMap.newPageId,
          slugId: pageFromMap.newSlugId,
          title: title,
          icon: page.icon,
          content: prosemirrorJson,
          textContent: jsonToText(prosemirrorJson),
          ydoc: createYdocFromJson(prosemirrorJson),
          position: page.id === rootPage.id ? nextPosition : page.position,
          spaceId: spaceId,
          workspaceId: page.workspaceId,
          creatorId: authUser.id,
          lastUpdatedById: authUser.id,
          parentPageId: page.id === rootPage.id
            ? (isDuplicateInSameSpace ? rootPage.parentPageId : null)
            : (page.parentPageId ? pageMap.get(page.parentPageId)?.newPageId : null),
        };
      }),
    );

    await this.db.insertInto('pages').values(insertablePages).execute();

    const insertedPageIds = insertablePages.map((page) => page.id);
    this.eventEmitter.emit(EventName.PAGE_CREATED, {
      pageIds: insertedPageIds,
      workspaceId: authUser.workspaceId,
    });

    //TODO: best to handle this in a queue
    const attachmentsIds = Array.from(attachmentMap.keys());
    if (attachmentsIds.length > 0) {
      const attachments = await this.db
        .selectFrom('attachments')
        .selectAll()
        .where('id', 'in', attachmentsIds)
        .where('workspaceId', '=', rootPage.workspaceId)
        .execute();

      for (const attachment of attachments) {
        try {
          const pageAttachment = attachmentMap.get(attachment.id);

          // make sure the copied attachment belongs to the page it was copied from
          if (attachment.pageId !== pageAttachment.oldPageId) {
            continue;
          }

          const newAttachmentId = pageAttachment.newAttachmentId;

          const newPageId = pageAttachment.newPageId;

          const newPathFile = attachment.filePath.replace(
            attachment.id,
            newAttachmentId,
          );

          try {
            await this.storageService.copy(attachment.filePath, newPathFile);

            await this.db
              .insertInto('attachments')
              .values({
                id: newAttachmentId,
                type: attachment.type,
                filePath: newPathFile,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                fileExt: attachment.fileExt,
                creatorId: attachment.creatorId,
                workspaceId: attachment.workspaceId,
                pageId: newPageId,
                spaceId: spaceId,
              })
              .execute();
          } catch (err) {
            this.logger.error(
              `Duplicate page: failed to copy attachment ${attachment.id}`,
              err,
            );
            // Continue with other attachments even if one fails
          }
        } catch (err) {
          this.logger.error(err);
        }
      }
    }

    const newPageId = pageMap.get(rootPage.id).newPageId;
    const duplicatedPage = await this.pageRepo.findById(newPageId, {
      includeSpace: true,
    });

    const hasChildren = pages.length > 1;

    return {
      ...duplicatedPage,
      hasChildren,
    };
  }

  async movePage(dto: MovePageDto, movedPage: Page) {
    console.log('[MovePage] Starting move operation:', {
      pageId: dto.pageId,
      currentParentPageId: movedPage.parentPageId,
      newParentPageId: dto.parentPageId,
      position: dto.position,
    });

    // validate position value by attempting to generate a key
    try {
      generateJitteredKeyBetween(dto.position, null);
    } catch (err) {
      throw new BadRequestException('Invalid move position');
    }

    let parentPageId = null;
    if (movedPage.parentPageId === dto.parentPageId) {
      parentPageId = undefined;
      console.log('[MovePage] Parent page unchanged, parentPageId set to undefined');
    } else {
      // changing the page's parent
      if (dto.parentPageId) {
        const parentPage = await this.pageRepo.findById(dto.parentPageId);
        if (!parentPage || parentPage.spaceId !== movedPage.spaceId) {
          throw new NotFoundException('Parent page not found');
        }
        parentPageId = parentPage.id;
        console.log('[MovePage] Parent page changed, validated new parent:', parentPageId);
      } else {
        console.log('[MovePage] Moving to root (parentPageId will be null)');
      }
    }

    const updateData = {
      position: dto.position,
      parentPageId: parentPageId,
    };
    console.log('[MovePage] Calling pageRepo.updatePage with:', updateData);

    await this.pageRepo.updatePage(updateData, dto.pageId);
    
    console.log('[MovePage] Page moved successfully');
  }

  async getPageBreadCrumbs(childPageId: string) {
    const ancestors = await this.db
      .withRecursive('page_ancestors', (db) =>
        db
          .selectFrom('pages')
          .select([
            'id',
            'slugId',
            'title',
            'icon',
            'position',
            'parentPageId',
            'spaceId',
            'deletedAt',
          ])
          .select((eb) => this.pageRepo.withHasChildren(eb))
          .where('id', '=', childPageId)
          .where('deletedAt', 'is', null)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select([
                'p.id',
                'p.slugId',
                'p.title',
                'p.icon',
                'p.position',
                'p.parentPageId',
                'p.spaceId',
                'p.deletedAt',
              ])
              .select(
                exp
                  .selectFrom('pages as child')
                  .select((eb) =>
                    eb
                      .case()
                      .when(eb.fn.countAll(), '>', 0)
                      .then(true)
                      .else(false)
                      .end()
                      .as('count'),
                  )
                  .whereRef('child.parentPageId', '=', 'id')
                  .where('child.deletedAt', 'is', null)
                  .limit(1)
                  .as('hasChildren'),
              )
              //.select((eb) => this.withHasChildren(eb))
              .innerJoin('page_ancestors as pa', 'pa.parentPageId', 'p.id')
              .where('p.deletedAt', 'is', null),
          ),
      )
      .selectFrom('page_ancestors')
      .selectAll()
      .execute();

    return ancestors.reverse();
  }

  async getRecentSpacePages(
    spaceId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Page>> {
    return await this.pageRepo.getRecentPagesInSpace(spaceId, pagination);
  }

  async getRecentPages(
    userId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Page>> {
    return await this.pageRepo.getRecentPages(userId, pagination);
  }

  async getDeletedSpacePages(
    spaceId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Page>> {
    return await this.pageRepo.getDeletedPagesInSpace(spaceId, pagination);
  }

  async forceDelete(pageId: string, workspaceId: string): Promise<void> {
    // Get all descendant IDs (including the page itself) using recursive CTE
    const descendants = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', pageId)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin('page_descendants as pd', 'pd.id', 'p.parentPageId'),
          ),
      )
      .selectFrom('page_descendants')
      .selectAll()
      .execute();

    const pageIds = descendants.map((d) => d.id);

    // Queue attachment deletion for all pages with unique job IDs to prevent duplicates
    for (const id of pageIds) {
      await this.attachmentQueue.add(
        QueueJob.DELETE_PAGE_ATTACHMENTS,
        {
          pageId: id,
        },
        {
          jobId: `delete-page-attachments-${id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    }

    if (pageIds.length > 0) {
      await this.db.deleteFrom('pages').where('id', 'in', pageIds).execute();
      this.eventEmitter.emit(EventName.PAGE_DELETED, {
        pageIds: pageIds,
        workspaceId,
      });
    }
  }

  async removePage(
    pageId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.pageRepo.removePage(pageId, userId, workspaceId);
  }
}

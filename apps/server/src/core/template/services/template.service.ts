import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { User } from '@docmost/db/types/entity.types';
import { CreateTemplateFromPageDto } from '../dto/template-create-from-page.dto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import {
  createYdocFromJson,
  getProsemirrorContent,
  isAttachmentNode,
  removeMarkTypeFromDoc,
} from '../../../common/helpers/prosemirror/utils';
import { jsonToNode, jsonToText } from '../../../collaboration/collaboration.util';
import { UpdateTemplateMetadataDto } from '../dto/template-update-metadata.dto';
import { OverwriteTemplateFromPageDto } from '../dto/template-overwrite-from-page.dto';
import { TemplateHomeDto } from '../dto/template-home.dto';
import {
  TemplateManageListDto,
  TemplateSearchDto,
} from '../dto/template-search.dto';
import { TemplateIdDto } from '../dto/template-id.dto';
import { ApplyTemplateDto } from '../dto/template-apply.dto';
import { PageService } from '../../page/services/page.service';
import {
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_SCENE_OPTIONS,
  TEMPLATE_STATUS,
} from '../template.constants';

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  normalizeScenes(input?: string[]) {
    if (!input) return [];
    const set = new Set<string>();
    for (const item of input) {
      if (!item) continue;
      const value = item.trim();
      if (!value) continue;
      set.add(value);
    }
    return Array.from(set);
  }

  private normalizeCategory(value: string) {
    if (!TEMPLATE_CATEGORY_OPTIONS.includes(value as any)) {
      throw new BadRequestException('Invalid template category');
    }
    return value;
  }

  private validateScenes(scenes: string[]) {
    const normalized = this.normalizeScenes(scenes);
    if (normalized.length === 0) {
      throw new BadRequestException('At least one scene is required');
    }
    for (const item of normalized) {
      if (!TEMPLATE_SCENE_OPTIONS.includes(item as any)) {
        throw new BadRequestException('Invalid template scene');
      }
    }
    return normalized;
  }

  private canManageTemplate(
    template: any,
    user: User,
    isSpaceAdmin: boolean,
    opts?: { allowAdminOnly?: boolean },
  ) {
    if (isSpaceAdmin) return true;
    if (opts?.allowAdminOnly) return false;

    return (
      template.creatorId === user.id &&
      template.status === TEMPLATE_STATUS.DRAFT &&
      !template.deletedAt
    );
  }

  private canReadTemplate(template: any, user: User, isSpaceAdmin: boolean) {
    if (!template || template.deletedAt) return false;
    if (template.status === TEMPLATE_STATUS.PUBLISHED) return true;
    if (isSpaceAdmin) return true;
    return (
      template.creatorId === user.id && template.status === TEMPLATE_STATUS.DRAFT
    );
  }

  private ensureTemplateSameSpace(template: any, spaceId: string) {
    if (!template || template.spaceId !== spaceId || template.deletedAt) {
      throw new NotFoundException('Template not found');
    }
  }

  private async assertMaintainerInSpace(
    maintainerId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const userRow = await this.db
      .selectFrom('users')
      .select(['id'])
      .where('id', '=', maintainerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!userRow) {
      throw new BadRequestException('Maintainer must belong to current workspace');
    }

    const memberRow = await this.db
      .selectFrom('spaceMembers')
      .select(['id'])
      .where('spaceId', '=', spaceId)
      .where((eb) =>
        eb.or([
          eb('userId', '=', maintainerId),
          eb(
            'groupId',
            'in',
            eb
              .selectFrom('groupUsers')
              .select('groupId')
              .where('userId', '=', maintainerId),
          ),
        ]),
      )
      .executeTakeFirst();

    if (!memberRow) {
      throw new BadRequestException('Maintainer must be a member of this space');
    }
  }

  private sanitizeTemplateContent(input: any): any {
    const visit = (node: any): any => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      if (node.type && isAttachmentNode(node.type)) {
        return {
          type: 'paragraph',
          attrs: { textAlign: 'left' },
          content: [{ type: 'text', text: '[Attachment omitted in template]' }],
        };
      }

      if (node.type === 'mention' && node.attrs?.entityType === 'page') {
        const text = node.attrs?.label || 'Linked page';
        return { type: 'text', text };
      }

      const next: any = { ...node };
      if (Array.isArray(node.content)) {
        next.content = node.content.map((item: any) => visit(item)).filter(Boolean);
      }
      return next;
    };

    const normalized = visit(input);
    if (!normalized?.type) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { textAlign: 'left' } }],
      };
    }
    return normalized;
  }

  private buildTemplateSnapshot(page: any) {
    const content = getProsemirrorContent(page.content);
    const doc = removeMarkTypeFromDoc(jsonToNode(content), 'comment');
    const sanitized = this.sanitizeTemplateContent(doc.toJSON());

    return {
      content: sanitized,
      textContent: jsonToText(sanitized),
      icon: page.icon,
      propertyOwnerId: page.propertyOwnerId || null,
      propertyStatus: page.propertyStatus || null,
      propertyPriority: page.propertyPriority || null,
      propertyDueAt: page.propertyDueAt || null,
      propertyTags: this.pageService.normalizeTags(page.propertyTags || []),
    };
  }

  async createFromPage(
    user: User,
    workspaceId: string,
    dto: CreateTemplateFromPageDto,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });

    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Source page not found');
    }

    const maintainerId = dto.maintainerId || user.id;
    await this.assertMaintainerInSpace(maintainerId, page.spaceId, workspaceId);

    const snapshot = this.buildTemplateSnapshot(page);

    const created = await this.templateRepo.insertTemplate({
      name: dto.name.trim(),
      category: this.normalizeCategory(dto.category),
      scenes: this.validateScenes(dto.scenes),
      maintainerId,
      spaceId: page.spaceId,
      workspaceId,
      creatorId: user.id,
      updaterId: user.id,
      status: TEMPLATE_STATUS.DRAFT,
      ...snapshot,
    } as any);

    return this.templateRepo.findById(created.id, {
      includeCreator: true,
      includeMaintainer: true,
      includeContent: true,
    });
  }

  async updateMetadata(
    user: User,
    workspaceId: string,
    dto: UpdateTemplateMetadataDto,
    isSpaceAdmin: boolean,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, {
      includeContent: false,
    });

    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    if (!this.canManageTemplate(template, user, isSpaceAdmin)) {
      throw new ForbiddenException();
    }

    if ((dto.isRecommended !== undefined || dto.recommendedOrder !== undefined) && !isSpaceAdmin) {
      throw new ForbiddenException('Only space admins can change recommendation');
    }

    const updateData: any = {
      updaterId: user.id,
    };

    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }
    if (dto.category !== undefined) {
      updateData.category = this.normalizeCategory(dto.category);
    }
    if (dto.scenes !== undefined) {
      updateData.scenes = this.validateScenes(dto.scenes);
    }
    if (dto.maintainerId !== undefined) {
      await this.assertMaintainerInSpace(
        dto.maintainerId,
        template.spaceId,
        workspaceId,
      );
      updateData.maintainerId = dto.maintainerId;
    }
    if (dto.isRecommended !== undefined) {
      updateData.isRecommended = dto.isRecommended;
      if (!dto.isRecommended) {
        updateData.recommendedOrder = null;
      }
    }
    if (dto.recommendedOrder !== undefined) {
      updateData.recommendedOrder = dto.recommendedOrder;
    }

    await this.templateRepo.updateTemplate(template.id, updateData);

    return this.templateRepo.findById(template.id, {
      includeCreator: true,
      includeMaintainer: true,
      includeContent: true,
    });
  }

  async overwriteFromPage(
    user: User,
    workspaceId: string,
    dto: OverwriteTemplateFromPageDto,
    isSpaceAdmin: boolean,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, {
      includeContent: true,
    });
    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    if (!this.canManageTemplate(template, user, isSpaceAdmin)) {
      throw new ForbiddenException();
    }

    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });
    if (!page || page.workspaceId !== workspaceId || page.spaceId !== template.spaceId) {
      throw new NotFoundException('Source page not found');
    }

    const snapshot = this.buildTemplateSnapshot(page);

    await this.templateRepo.updateTemplate(template.id, {
      ...snapshot,
      updaterId: user.id,
    } as any);

    return this.templateRepo.findById(template.id, {
      includeCreator: true,
      includeMaintainer: true,
      includeContent: true,
    });
  }

  async publish(
    user: User,
    workspaceId: string,
    dto: TemplateIdDto,
    isSpaceAdmin: boolean,
  ) {
    if (!isSpaceAdmin) {
      throw new ForbiddenException();
    }

    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    await this.templateRepo.updateTemplate(template.id, {
      status: TEMPLATE_STATUS.PUBLISHED,
      publishedAt: new Date(),
      publishedById: user.id,
      updaterId: user.id,
    });

    return this.templateRepo.findById(template.id, {
      includeCreator: true,
      includeMaintainer: true,
      includeContent: true,
    });
  }

  async unpublish(
    user: User,
    workspaceId: string,
    dto: TemplateIdDto,
    isSpaceAdmin: boolean,
  ) {
    if (!isSpaceAdmin) {
      throw new ForbiddenException();
    }

    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    await this.templateRepo.updateTemplate(template.id, {
      status: TEMPLATE_STATUS.UNPUBLISHED,
      updaterId: user.id,
    });

    return this.templateRepo.findById(template.id, {
      includeCreator: true,
      includeMaintainer: true,
      includeContent: true,
    });
  }

  async softDelete(
    user: User,
    workspaceId: string,
    dto: TemplateIdDto,
    isSpaceAdmin: boolean,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    if (!this.canManageTemplate(template, user, isSpaceAdmin)) {
      throw new ForbiddenException();
    }

    await this.templateRepo.updateTemplate(template.id, {
      status: TEMPLATE_STATUS.DELETED,
      isRecommended: false,
      recommendedOrder: null,
      updaterId: user.id,
      deletedAt: new Date(),
    });

    return { success: true };
  }

  async getHome(
    user: User,
    dto: TemplateHomeDto,
    isSpaceAdmin: boolean,
  ) {
    const [teamCommon, officialRecommended, recentUsedRaw] = await Promise.all([
      this.templateRepo.getTeamCommonTemplates(dto.spaceId, 6, 30),
      this.templateRepo.getRecommendedTemplates(dto.spaceId, 6),
      this.templateRepo.getRecentUsedTemplates(user.id, dto.spaceId, 5),
    ]);

    const recentUsed = recentUsedRaw.filter((item) => {
      if (!item || item.deletedAt) return false;
      if (item.status === TEMPLATE_STATUS.PUBLISHED) return true;
      if (item.status === TEMPLATE_STATUS.UNPUBLISHED) return true;
      if (isSpaceAdmin) return true;
      return item.creatorId === user.id && item.status === TEMPLATE_STATUS.DRAFT;
    });

    return {
      teamCommon,
      officialRecommended,
      recentUsed,
    };
  }

  async search(dto: TemplateSearchDto) {
    return this.templateRepo.searchTemplates(
      {
        ...dto,
        statuses: [TEMPLATE_STATUS.PUBLISHED],
      },
      {
        page: dto.page,
        limit: dto.limit,
      },
    );
  }

  async getManageList(user: User, dto: TemplateManageListDto, isSpaceAdmin: boolean) {
    if (isSpaceAdmin) {
      return this.templateRepo.searchTemplates(
        {
          ...dto,
          statuses:
            dto.statuses && dto.statuses.length > 0
              ? dto.statuses
              : [
                  TEMPLATE_STATUS.DRAFT,
                  TEMPLATE_STATUS.PUBLISHED,
                  TEMPLATE_STATUS.UNPUBLISHED,
                ],
        },
        {
          page: dto.page,
          limit: dto.limit,
        },
      );
    }

    return this.templateRepo.searchTemplates(
      {
        ...dto,
        statuses: [TEMPLATE_STATUS.DRAFT],
        creatorId: user.id,
      },
      {
        page: dto.page,
        limit: dto.limit,
      },
    );
  }

  async getDetail(
    user: User,
    workspaceId: string,
    dto: TemplateIdDto,
    isSpaceAdmin: boolean,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, {
      includeContent: true,
      includeCreator: true,
      includeMaintainer: true,
    });

    if (!template || template.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found');
    }

    if (!this.canReadTemplate(template, user, isSpaceAdmin)) {
      throw new ForbiddenException();
    }

    return template;
  }

  async applyTemplate(
    user: User,
    workspaceId: string,
    dto: ApplyTemplateDto,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, {
      includeContent: true,
    });

    if (!template || template.workspaceId !== workspaceId || template.spaceId !== dto.spaceId) {
      throw new NotFoundException('Template not found');
    }

    if (template.deletedAt || template.status !== TEMPLATE_STATUS.PUBLISHED) {
      throw new ForbiddenException('Template is not available');
    }

    const warnings: string[] = [];

    let ownerId = template.propertyOwnerId;
    if (ownerId) {
      try {
        await this.pageService.assertValidOwner(ownerId, template.spaceId, workspaceId);
      } catch {
        warnings.push('owner was cleared because it is no longer valid in this space');
        ownerId = undefined;
      }
    }

    let status = template.propertyStatus;
    if (status) {
      const statusOptions = await this.pageService.getSpaceStatusOptions(
        template.spaceId,
        workspaceId,
      );
      if (!statusOptions.includes(status)) {
        warnings.push('status was cleared because it is no longer in space status options');
        status = undefined;
      }
    }

    const created = await this.pageService.create(user.id, workspaceId, {
      spaceId: template.spaceId,
      title: template.name,
      icon: template.icon,
      ownerId: ownerId || undefined,
      status: status || undefined,
      priority: template.propertyPriority || undefined,
      dueAt: template.propertyDueAt
        ? new Date(template.propertyDueAt).toISOString()
        : undefined,
      tags: template.propertyTags || [],
    } as any);

    const content = getProsemirrorContent(template.content);
    await this.pageRepo.updatePage(
      {
        content,
        textContent: jsonToText(content),
        ydoc: createYdocFromJson(content),
        lastUpdatedById: user.id,
      } as any,
      created.id,
    );

    await this.templateRepo.insertTemplateUsage({
      templateId: template.id,
      userId: user.id,
      spaceId: template.spaceId,
      workspaceId,
      createdPageId: created.id,
    } as any);

    const page = await this.pageRepo.findById(created.id, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
    });

    return { page, warnings };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSpaceDto } from '../dto/create-space.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { Space, User } from '@docmost/db/types/entity.types';
import {
  executeWithPagination,
  PaginationResult,
} from '@docmost/db/pagination/pagination';
import { UpdateSpaceDto } from '../dto/update-space.dto';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { SpaceMemberService } from './space-member.service';
import { SpaceRole } from '../../../common/helpers/types/permission';
import { QueueJob, QueueName } from 'src/integrations/queue/constants';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { sql } from 'kysely';
import {
  DEFAULT_ENABLED_PAGE_PROPERTIES,
  DEFAULT_PAGE_STATUS_OPTIONS,
  PAGE_PROPERTY_KEYS,
  PagePropertyKey,
} from '../../page/constants/page-properties.constants';

@Injectable()
export class SpaceService {
  private readonly defaultPageStatusOptions = [...DEFAULT_PAGE_STATUS_OPTIONS];

  constructor(
    private spaceRepo: SpaceRepo,
    private spaceMemberService: SpaceMemberService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
  ) {}

  async createSpace(
    authUser: User,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    let space = null;

    await executeTx(
      this.db,
      async (trx) => {
        space = await this.create(
          authUser.id,
          workspaceId,
          createSpaceDto,
          trx,
        );

        await this.spaceMemberService.addUserToSpace(
          authUser.id,
          space.id,
          SpaceRole.ADMIN,
          workspaceId,
          trx,
        );
      },
      trx,
    );

    return { ...space, memberCount: 1 };
  }

  async create(
    userId: string,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    const slugExists = await this.spaceRepo.slugExists(
      createSpaceDto.slug,
      workspaceId,
      trx,
    );
    if (slugExists) {
      throw new BadRequestException(
        'Space slug exists. Please use a unique space slug',
      );
    }

    return await this.spaceRepo.insertSpace(
      {
        name: createSpaceDto.name ?? 'untitled space',
        description: createSpaceDto.description ?? '',
        creatorId: userId,
        workspaceId: workspaceId,
        slug: createSpaceDto.slug,
      },
      trx,
    );
  }

  async updateSpace(
    updateSpaceDto: UpdateSpaceDto,
    workspaceId: string,
  ): Promise<Space> {
    if (updateSpaceDto?.slug) {
      const slugExists = await this.spaceRepo.slugExists(
        updateSpaceDto.slug,
        workspaceId,
      );

      if (slugExists) {
        throw new BadRequestException(
          'Space slug exists. Please use a unique space slug',
        );
      }
    }

    return await this.spaceRepo.updateSpace(
      {
        name: updateSpaceDto.name,
        description: updateSpaceDto.description,
        slug: updateSpaceDto.slug,
      },
      updateSpaceDto.spaceId,
      workspaceId,
    );
  }

  async getSpaceInfo(spaceId: string, workspaceId: string): Promise<Space> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId, {
      includeMemberCount: true,
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return space;
  }

  async getWorkspaceSpaces(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Space>> {
    const spaces = await this.spaceRepo.getSpacesInWorkspace(
      workspaceId,
      pagination,
    );

    return spaces;
  }

  async deleteSpace(spaceId: string, workspaceId: string): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    await this.spaceRepo.deleteSpace(spaceId, workspaceId);
    await this.attachmentQueue.add(QueueJob.DELETE_SPACE_ATTACHMENTS, space);
  }

  normalizeStatusOptions(statusOptions: string[]) {
    const cleaned: string[] = [];
    const seen = new Set<string>();

    for (const item of statusOptions) {
      const value = item?.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(value);
      }
    }

    if (cleaned.length === 0) {
      throw new BadRequestException('At least one status option is required');
    }

    return cleaned;
  }

  normalizeEnabledProperties(enabledProperties: string[]): PagePropertyKey[] {
    const enabledSet = new Set(enabledProperties);
    return PAGE_PROPERTY_KEYS.filter((key) => enabledSet.has(key));
  }

  async getPagePropertyStatusConfig(spaceId: string, workspaceId: string) {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    let config = await this.spaceRepo.findPagePropertyStatusConfig(
      spaceId,
      workspaceId,
    );

    if (!config) {
      config = await this.spaceRepo.upsertPagePropertyStatusConfig(
        spaceId,
        workspaceId,
        this.defaultPageStatusOptions,
        DEFAULT_ENABLED_PAGE_PROPERTIES,
      );
    }

    return {
      ...config,
      enabledProperties: Array.isArray(config.enabledProperties)
        ? this.normalizeEnabledProperties(config.enabledProperties as string[])
        : DEFAULT_ENABLED_PAGE_PROPERTIES,
    };
  }

  async updatePagePropertyStatusConfig(
    spaceId: string,
    workspaceId: string,
    statusOptions: string[],
    enabledProperties: string[],
  ) {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const normalized = this.normalizeStatusOptions(statusOptions);
    const normalizedEnabledProperties =
      this.normalizeEnabledProperties(enabledProperties);

    const currentConfig = await this.getPagePropertyStatusConfig(
      spaceId,
      workspaceId,
    );
    const nextStatusKeys = new Set(
      normalized.map((status) => status.toLowerCase()),
    );
    const removedStatuses = (currentConfig.statusOptions as string[]).filter(
      (status) => !nextStatusKeys.has(status.toLowerCase()),
    );

    const usages = await this.spaceRepo.countPagesUsingStatuses(
      spaceId,
      removedStatuses,
    );
    if (usages.length > 0) {
      throw new BadRequestException({
        code: 'STATUS_IN_USE',
        message: 'One or more statuses are still used by pages',
        statuses: usages.map((usage) => ({
          status: usage.propertyStatus,
          pageCount: Number(usage.pageCount),
        })),
      });
    }

    return this.spaceRepo.upsertPagePropertyStatusConfig(
      spaceId,
      workspaceId,
      normalized,
      normalizedEnabledProperties,
    );
  }

  async getPagePropertyOwners(
    spaceId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    let query = this.db
      .selectFrom('users')
      .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
      .where('users.workspaceId', '=', workspaceId)
      .where('users.deletedAt', 'is', null)
      .where(
        sql<boolean>`exists (
          select 1
          from space_members sm
          left join group_users gu on gu.group_id = sm.group_id
          where sm.space_id = ${spaceId}
            and (sm.user_id = users.id or gu.user_id = users.id)
        )`,
      )
      .orderBy('users.name', 'asc');

    if (pagination.query?.trim()) {
      const search = `%${pagination.query.trim()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('users.name', 'ilike', search),
          eb('users.email', 'ilike', search),
        ]),
      );
    }

    return executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });
  }
}

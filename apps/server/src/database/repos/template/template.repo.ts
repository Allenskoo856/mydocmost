import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertableTemplate,
  InsertableTemplateUsage,
  Template,
  UpdatableTemplate,
} from '@docmost/db/types/entity.types';
import { validate as isValidUUID } from 'uuid';
import { ExpressionBuilder, sql } from 'kysely';
import { DB } from '@docmost/db/types/db';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import {
  executeWithPagination,
  PaginationResult,
} from '@docmost/db/pagination/pagination';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

@Injectable()
export class TemplateRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof Template> = [
    'id',
    'name',
    'category',
    'scenes',
    'maintainerId',
    'spaceId',
    'workspaceId',
    'creatorId',
    'updaterId',
    'content',
    'textContent',
    'icon',
    'propertyOwnerId',
    'propertyStatus',
    'propertyPriority',
    'propertyDueAt',
    'propertyTags',
    'status',
    'isRecommended',
    'recommendedOrder',
    'publishedAt',
    'publishedById',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    templateId: string,
    opts?: {
      includeContent?: boolean;
      includeCreator?: boolean;
      includeMaintainer?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<any> {
    const fields = opts?.includeContent
      ? this.baseFields
      : this.baseFields.filter((field) => field !== 'content');

    let query = dbOrTx(this.db, opts?.trx)
      .selectFrom('templates')
      .select(fields as any)
      .where('deletedAt', 'is', null);

    if (opts?.includeCreator) {
      query = query.select((eb) => this.withCreator(eb));
    }
    if (opts?.includeMaintainer) {
      query = query.select((eb) => this.withMaintainer(eb));
    }

    if (isValidUUID(templateId)) {
      query = query.where('id', '=', templateId);
    } else {
      return null;
    }

    return query.executeTakeFirst();
  }

  async insertTemplate(
    insertableTemplate: InsertableTemplate,
    trx?: KyselyTransaction,
  ): Promise<Template> {
    return dbOrTx(this.db, trx)
      .insertInto('templates')
      .values(insertableTemplate)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateTemplate(
    templateId: string,
    updatableTemplate: UpdatableTemplate,
    trx?: KyselyTransaction,
  ) {
    return dbOrTx(this.db, trx)
      .updateTable('templates')
      .set({ ...updatableTemplate, updatedAt: new Date() })
      .where('id', '=', templateId)
      .where('deletedAt', 'is', null)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async insertTemplateUsage(
    usage: InsertableTemplateUsage,
    trx?: KyselyTransaction,
  ) {
    return dbOrTx(this.db, trx)
      .insertInto('templateUsages')
      .values(usage)
      .returningAll()
      .executeTakeFirst();
  }

  async getRecommendedTemplates(spaceId: string, limit = 6) {
    return this.db
      .selectFrom('templates')
      .select(this.baseFields.filter((f) => f !== 'content'))
      .select((eb) => [this.withCreator(eb), this.withMaintainer(eb)])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .where('status', '=', 'published')
      .where('isRecommended', '=', true)
      .orderBy('recommendedOrder', 'asc')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .execute();
  }

  async getTeamCommonTemplates(spaceId: string, limit = 6, withinDays = 30) {
    return this.db
      .selectFrom('templateUsages as tu')
      .innerJoin('templates as t', 't.id', 'tu.templateId')
      .select([
        't.id',
        't.name',
        't.category',
        't.scenes',
        't.maintainerId',
        't.spaceId',
        't.workspaceId',
        't.creatorId',
        't.updaterId',
        't.textContent',
        't.icon',
        't.propertyOwnerId',
        't.propertyStatus',
        't.propertyPriority',
        't.propertyDueAt',
        't.propertyTags',
        't.status',
        't.isRecommended',
        't.recommendedOrder',
        't.publishedAt',
        't.publishedById',
        't.createdAt',
        't.updatedAt',
        't.deletedAt',
        sql<number>`count(tu.id)`.as('usageCount'),
      ])
      .select((eb) => [
        this.withTemplateCreator(eb),
        this.withTemplateMaintainer(eb),
      ])
      .where('tu.spaceId', '=', spaceId)
      .where('t.deletedAt', 'is', null)
      .where('t.status', '=', 'published')
      .where(
        'tu.createdAt',
        '>=',
        sql<Date>`now() - (${withinDays} * interval '1 day')`,
      )
      .groupBy([
        't.id',
        't.name',
        't.category',
        't.scenes',
        't.maintainerId',
        't.spaceId',
        't.workspaceId',
        't.creatorId',
        't.updaterId',
        't.textContent',
        't.icon',
        't.propertyOwnerId',
        't.propertyStatus',
        't.propertyPriority',
        't.propertyDueAt',
        't.propertyTags',
        't.status',
        't.isRecommended',
        't.recommendedOrder',
        't.publishedAt',
        't.publishedById',
        't.createdAt',
        't.updatedAt',
        't.deletedAt',
      ])
      .orderBy('usageCount', 'desc')
      .orderBy('t.updatedAt', 'desc')
      .limit(limit)
      .execute();
  }

  async getRecentUsedTemplates(userId: string, spaceId: string, limit = 5) {
    return this.db
      .with('recent_template_ids', (db) =>
        db
          .selectFrom('templateUsages')
          .select((eb) => ['templateId', eb.fn.max('createdAt').as('lastUsedAt')])
          .where('userId', '=', userId)
          .where('spaceId', '=', spaceId)
          .groupBy('templateId')
          .orderBy('lastUsedAt', 'desc')
          .limit(limit),
      )
      .selectFrom('recent_template_ids as r')
      .innerJoin('templates as t', 't.id', 'r.templateId')
      .select([
        't.id',
        't.name',
        't.category',
        't.scenes',
        't.maintainerId',
        't.spaceId',
        't.workspaceId',
        't.creatorId',
        't.updaterId',
        't.textContent',
        't.icon',
        't.propertyOwnerId',
        't.propertyStatus',
        't.propertyPriority',
        't.propertyDueAt',
        't.propertyTags',
        't.status',
        't.isRecommended',
        't.recommendedOrder',
        't.publishedAt',
        't.publishedById',
        't.createdAt',
        't.updatedAt',
        't.deletedAt',
        'r.lastUsedAt',
      ])
      .select((eb) => [
        this.withTemplateCreator(eb),
        this.withTemplateMaintainer(eb),
      ])
      .where('t.deletedAt', 'is', null)
      .orderBy('r.lastUsedAt', 'desc')
      .execute();
  }

  async searchTemplates(
    params: {
      spaceId: string;
      keyword?: string;
      category?: string;
      scenes?: string[];
      statuses?: string[];
      creatorId?: string;
    },
    pagination: { page?: number; limit?: number },
  ): Promise<PaginationResult<any>> {
    let query = this.db
      .selectFrom('templates')
      .select(this.baseFields.filter((f) => f !== 'content'))
      .select((eb) => [this.withCreator(eb), this.withMaintainer(eb)])
      .where('spaceId', '=', params.spaceId)
      .where('deletedAt', 'is', null)
      .$if(Boolean(params.statuses?.length), (qb) =>
        qb.where('status', 'in', params.statuses as string[]),
      )
      .$if(Boolean(params.creatorId), (qb) =>
        qb.where('creatorId', '=', params.creatorId as string),
      )
      .$if(Boolean(params.category), (qb) =>
        qb.where('category', '=', params.category as string),
      );

    if (params.scenes?.length) {
      const scenes = params.scenes.filter(Boolean);
      if (scenes.length > 0) {
        query = query.where(
          sql<boolean>`exists (select 1 from unnest(templates.scenes) as scene where scene in (${sql.join(
            scenes.map((scene) => sql`${scene}`),
          )}))`,
        );
      }
    }

    if (params.keyword?.trim()) {
      const rawKeyword = params.keyword.trim();
      const keyword = `%${rawKeyword}%`;
      const searchQuery = tsquery(rawKeyword + '*');

      query = query
        .select(
          sql<number>`ts_rank(tsv, to_tsquery('english', f_unaccent(${searchQuery})))`.as(
            'rank',
          ),
        )
        .where(
          'tsv',
          '@@',
          sql<string>`to_tsquery('english', f_unaccent(${searchQuery}))`,
        );

      query = query.where((eb) =>
        eb.or([
          eb('name', 'ilike', keyword),
          eb('category', 'ilike', keyword),
          eb('textContent', 'ilike', keyword),
          sql<boolean>`exists (select 1 from unnest(templates.scenes) as scene where scene ilike ${keyword})`,
        ]),
      );

      query = query.orderBy(sql`rank`, 'desc');
    }

    query = query.orderBy('updatedAt', 'desc');

    return executeWithPagination(query, {
      page: pagination.page || 1,
      perPage: pagination.limit || 20,
    });
  }

  withCreator(eb: ExpressionBuilder<DB, 'templates'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'templates.creatorId'),
    ).as('creator');
  }

  withMaintainer(eb: ExpressionBuilder<DB, 'templates'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'templates.maintainerId'),
    ).as('maintainer');
  }

  withTemplateCreator(eb: ExpressionBuilder<any, any>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 't.creatorId'),
    ).as('creator');
  }

  withTemplateMaintainer(eb: ExpressionBuilder<any, any>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 't.maintainerId'),
    ).as('maintainer');
  }
}

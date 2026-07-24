import { Injectable } from '@nestjs/common';
import { SearchDTO, SearchSuggestionDTO } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import {
  SEARCH_TEXT_INDEX_CHARS,
  buildSubstringHighlight,
  clampSearchLimit,
  normalizeHighlight,
  prepareSearchQuery,
} from './utils/search-query.util';

type HybridSearchRow = SearchResponseDto & {
  titleMatch?: number | string | boolean | null;
  ftsRank?: number | null;
  bodySnippet?: string | null;
  ftsHighlight?: string | null;
};

@Injectable()
export class SearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private pageRepo: PageRepo,
    private shareRepo: ShareRepo,
    private spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async searchPage(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
    },
  ): Promise<SearchResponseDto[]> {
    const prepared = prepareSearchQuery(searchParams.query);
    if (!prepared.ok) {
      return [];
    }

    const { query, ilikePattern, tsQuery } = prepared;
    const limit = clampSearchLimit(searchParams.limit);
    const offset = searchParams.offset || 0;

    // Hybrid match expressions must stay aligned with trgm indexes:
    // pages_title_trgm_idx / pages_text_content_trgm_idx
    const titleMatchExpr = sql<boolean>`
      f_unaccent(coalesce(pages.title, ''))
      ILIKE f_unaccent(${ilikePattern}) ESCAPE '!'
    `;
    const bodyMatchExpr = sql<boolean>`
      f_unaccent(left(coalesce(pages.text_content, ''), ${sql.lit(SEARCH_TEXT_INDEX_CHARS)}))
      ILIKE f_unaccent(${ilikePattern}) ESCAPE '!'
    `;
    const ftsMatchExpr = tsQuery
      ? sql<boolean>`pages.tsv @@ to_tsquery('english', f_unaccent(${tsQuery}))`
      : null;

    let queryResults = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'createdAt',
        'updatedAt',
        'propertyOwnerId',
        'propertyStatus',
        'propertyPriority',
        'propertyDueAt',
        'propertyTags',
        // Cheap window around first case-insensitive match; avoids shipping full body.
        sql<string>`
          case
            when strpos(lower(coalesce(pages.text_content, '')), lower(${query})) > 0 then
              substring(
                coalesce(pages.text_content, '')
                from greatest(1, strpos(lower(coalesce(pages.text_content, '')), lower(${query})) - 40)
                for 120
              )
            else null
          end
        `.as('bodySnippet'),
        sql<number>`case when ${titleMatchExpr} then 1 else 0 end`.as(
          'titleMatch',
        ),
        tsQuery
          ? sql<number>`ts_rank(pages.tsv, to_tsquery('english', f_unaccent(${tsQuery})))`.as(
              'ftsRank',
            )
          : sql<number>`0`.as('ftsRank'),
        tsQuery
          ? sql<string>`ts_headline('english', coalesce(pages.text_content, ''), to_tsquery('english', f_unaccent(${tsQuery})),'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
              'ftsHighlight',
            )
          : sql<string>`null`.as('ftsHighlight'),
      ])
      .where((eb) => {
        const conditions = [titleMatchExpr, bodyMatchExpr];
        if (ftsMatchExpr) {
          conditions.push(ftsMatchExpr);
        }
        return eb.or(conditions);
      })
      .$if(Boolean(searchParams.creatorId), (qb) =>
        qb.where('creatorId', '=', searchParams.creatorId),
      )
      .$if(Boolean(searchParams.status?.length), (qb) =>
        qb.where('propertyStatus', 'in', searchParams.status),
      )
      .$if(Boolean(searchParams.priority?.length), (qb) =>
        qb.where('propertyPriority', 'in', searchParams.priority),
      )
      .$if(Boolean(searchParams.ownerIds?.length), (qb) =>
        qb.where('propertyOwnerId', 'in', searchParams.ownerIds),
      )
      .where('deletedAt', 'is', null)
      .orderBy('titleMatch', 'desc')
      .orderBy('ftsRank', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset(offset);

    if (searchParams.tags?.length) {
      const normalizedTags = searchParams.tags
        .map((tag) => tag?.trim().toLowerCase())
        .filter(Boolean);
      if (normalizedTags.length > 0) {
        queryResults = queryResults.where(
          sql<boolean>`exists (select 1 from unnest(pages.property_tags) as tag where lower(tag) in (${sql.join(
            normalizedTags.map((tag) => sql`${tag}`),
          )}))`,
        );
      }
    }

    if (searchParams.dueRange?.from) {
      queryResults = queryResults.where(
        'propertyDueAt',
        '>=',
        new Date(searchParams.dueRange.from),
      );
    }
    if (searchParams.dueRange?.to) {
      queryResults = queryResults.where(
        'propertyDueAt',
        '<=',
        new Date(searchParams.dueRange.to),
      );
    }

    if (!searchParams.shareId) {
      queryResults = queryResults.select((eb) => this.pageRepo.withSpace(eb));
    }

    if (searchParams.spaceId) {
      // search by spaceId
      queryResults = queryResults.where('spaceId', '=', searchParams.spaceId);
    } else if (opts.userId && !searchParams.spaceId) {
      // only search spaces the user is a member of
      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
        opts.userId,
      );
      if (userSpaceIds.length > 0) {
        queryResults = queryResults
          .where('spaceId', 'in', userSpaceIds)
          .where('workspaceId', '=', opts.workspaceId);
      } else {
        return [];
      }
    } else if (searchParams.shareId && !searchParams.spaceId && !opts.userId) {
      // search in shares
      const shareId = searchParams.shareId;
      const share = await this.shareRepo.findById(shareId);
      if (!share || share.workspaceId !== opts.workspaceId) {
        return [];
      }

      const pageIdsToSearch = [];
      if (share.includeSubPages) {
        const pageList = await this.pageRepo.getPageAndDescendants(
          share.pageId,
          {
            includeContent: false,
          },
        );

        pageIdsToSearch.push(...pageList.map((page) => page.id));
      } else {
        pageIdsToSearch.push(share.pageId);
      }

      if (pageIdsToSearch.length > 0) {
        queryResults = queryResults
          .where('id', 'in', pageIdsToSearch)
          .where('workspaceId', '=', opts.workspaceId);
      } else {
        return [];
      }
    } else {
      return [];
    }

    const rows = (await queryResults.execute()) as unknown as HybridSearchRow[];

    return rows.map((result) => {
      const titleMatch = Number(result.titleMatch) === 1;
      const ftsRank = Number(result.ftsRank) || 0;
      let highlight = normalizeHighlight(result.ftsHighlight);

      if (!highlight) {
        highlight = buildSubstringHighlight(result.bodySnippet, query);
      }
      if (!highlight && titleMatch) {
        highlight = buildSubstringHighlight(result.title, query);
      }

      // Prefer title hits in the exposed rank so clients that sort client-side
      // still surface Chinese title matches above weak FTS scores.
      const rank = titleMatch ? Math.max(ftsRank, 1) + 10 : ftsRank > 0 ? ftsRank : 1;

      const {
        titleMatch: _titleMatch,
        ftsRank: _ftsRank,
        bodySnippet: _bodySnippet,
        ftsHighlight: _ftsHighlight,
        ...rest
      } = result;

      return {
        ...rest,
        rank,
        highlight,
      } as SearchResponseDto;
    });
  }

  async searchSuggestions(
    suggestion: SearchSuggestionDTO,
    userId: string,
    workspaceId: string,
  ) {
    let users = [];
    let groups = [];
    let pages = [];

    const limit = suggestion?.limit || 10;
    const query = suggestion.query.toLowerCase().trim();

    if (suggestion.includeUsers) {
      const userQuery = this.db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'avatarUrl'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where((eb) =>
          eb.or([
            eb(
              sql`LOWER(f_unaccent(users.name))`,
              'like',
              sql`LOWER(f_unaccent(${`%${query}%`}))`,
            ),
            eb(sql`users.email`, 'ilike', sql`f_unaccent(${`%${query}%`})`),
          ]),
        )
        .limit(limit);

      users = await userQuery.execute();
    }

    if (suggestion.includeGroups) {
      groups = await this.db
        .selectFrom('groups')
        .select(['id', 'name', 'description'])
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(groups.name))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('workspaceId', '=', workspaceId)
        .limit(limit)
        .execute();
    }

    if (suggestion.includePages) {
      let pageSearch = this.db
        .selectFrom('pages')
        .select(['id', 'slugId', 'title', 'icon', 'spaceId'])
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(pages.title))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('deletedAt', 'is', null)
        .where('workspaceId', '=', workspaceId)
        .limit(limit);

      // only search spaces the user has access to
      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);

      if (suggestion?.spaceId) {
        if (userSpaceIds.includes(suggestion.spaceId)) {
          pageSearch = pageSearch.where('spaceId', '=', suggestion.spaceId);
          pages = await pageSearch.execute();
        }
      } else if (userSpaceIds?.length > 0) {
        // we need this check or the query will throw an error if the userSpaceIds array is empty
        pageSearch = pageSearch.where('spaceId', 'in', userSpaceIds);
        pages = await pageSearch.execute();
      }
    }

    return { users, groups, pages };
  }
}

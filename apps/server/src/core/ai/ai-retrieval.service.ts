import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AiModelService } from './ai-model.service';
import { prepareSearchQuery } from '../search/utils/search-query.util';

export interface RetrievalScope {
  spaceId?: string;
  pageId?: string;
}

export interface RetrievedChunk {
  pageId: string;
  title: string;
  slugId: string;
  icon: string | null;
  spaceId: string;
  spaceSlug: string;
  text: string;
  score: number;
}

const FTS_PAGE_LIMIT = 40;
const MAX_PER_PAGE = 3;

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

@Injectable()
export class AiRetrievalService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly aiModel: AiModelService,
    private readonly environmentService: EnvironmentService,
  ) {}

  /** Space ids the user may read, intersected with the requested scope. */
  async resolveAllowedSpaceIds(
    userId: string,
    scope?: RetrievalScope,
  ): Promise<string[]> {
    const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);
    if (scope?.spaceId) {
      return userSpaceIds.includes(scope.spaceId) ? [scope.spaceId] : [];
    }
    return userSpaceIds;
  }

  isEnabled(): boolean {
    return this.aiModel.isEnabled();
  }

  /** All non-deleted space ids in a workspace (used by the workspace-scoped MCP agent). */
  async getWorkspaceSpaceIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
    return rows.map((r) => r.id);
  }

  async retrieve(
    query: string,
    opts: {
      workspaceId: string;
      userId?: string;
      allowedSpaceIds?: string[];
      scope?: RetrievalScope;
      topK?: number;
    },
  ): Promise<RetrievedChunk[]> {
    if (!this.aiModel.isEnabled() || !query?.trim()) return [];

    let allowedSpaceIds: string[];
    if (opts.allowedSpaceIds) {
      allowedSpaceIds = opts.scope?.spaceId
        ? opts.allowedSpaceIds.includes(opts.scope.spaceId)
          ? [opts.scope.spaceId]
          : []
        : opts.allowedSpaceIds;
    } else if (opts.userId) {
      allowedSpaceIds = await this.resolveAllowedSpaceIds(
        opts.userId,
        opts.scope,
      );
    } else {
      return [];
    }
    if (!allowedSpaceIds.length) return [];

    const topK = opts.topK ?? this.environmentService.getAiRagTopK();
    const candidateLimit = this.environmentService.getAiVectorCandidateLimit();

    // 1) Query embedding (semantic side).
    const queryVec = await this.aiModel.embedOne(query);
    if (!queryVec.length) return [];

    // 2) Keyword candidate pages (FTS), unless a single page is targeted.
    let candidatePageIds: string[] = [];
    if (!opts.scope?.pageId) {
      candidatePageIds = await this.ftsCandidatePageIds(
        query,
        opts.workspaceId,
        allowedSpaceIds,
      );
    }

    // 3) Load candidate chunk rows (permission-filtered).
    let chunkQuery = this.db
      .selectFrom('pageEmbeddings as pe')
      .innerJoin('pages as p', 'p.id', 'pe.pageId')
      .innerJoin('spaces as s', 's.id', 'pe.spaceId')
      .select([
        'pe.pageId as pageId',
        'pe.embedding as embedding',
        'pe.metadata as metadata',
        'p.title as title',
        'p.slugId as slugId',
        'p.icon as icon',
        'pe.spaceId as spaceId',
        's.slug as spaceSlug',
      ])
      .where('pe.workspaceId', '=', opts.workspaceId)
      .where('pe.spaceId', 'in', allowedSpaceIds)
      .where('p.deletedAt', 'is', null);

    if (opts.scope?.pageId) {
      chunkQuery = chunkQuery.where('pe.pageId', '=', opts.scope.pageId);
    } else if (candidatePageIds.length) {
      chunkQuery = chunkQuery.where('pe.pageId', 'in', candidatePageIds);
    } else {
      // Pure-semantic fallback: most recently updated chunks in scope.
      chunkQuery = chunkQuery.orderBy('p.updatedAt', 'desc');
    }

    const rows = (await chunkQuery.limit(candidateLimit).execute()) as any[];
    if (!rows.length) return [];

    // 4) Rerank by cosine similarity in memory (CPU-only).
    const scored = rows
      .map((row) => ({
        pageId: row.pageId as string,
        title: (row.title as string) ?? 'Untitled',
        slugId: row.slugId as string,
        icon: (row.icon as string) ?? null,
        spaceId: row.spaceId as string,
        spaceSlug: row.spaceSlug as string,
        text: (row.metadata?.text as string) ?? '',
        score: cosineSimilarity(row.embedding as number[], queryVec),
      }))
      .filter((r) => r.text)
      .sort((a, b) => b.score - a.score);

    // 5) Diversify: cap chunks per page so one page can't dominate context.
    const perPage = new Map<string, number>();
    const result: RetrievedChunk[] = [];
    for (const chunk of scored) {
      const count = perPage.get(chunk.pageId) ?? 0;
      if (count >= MAX_PER_PAGE) continue;
      perPage.set(chunk.pageId, count + 1);
      result.push(chunk);
      if (result.length >= topK) break;
    }
    return result;
  }

  private async ftsCandidatePageIds(
    query: string,
    workspaceId: string,
    allowedSpaceIds: string[],
  ): Promise<string[]> {
    const prepared = prepareSearchQuery(query);
    if (!prepared.ok) return [];

    const { ilikePattern, tsQuery } = prepared;
    const titleMatch = sql<boolean>`f_unaccent(coalesce(pages.title, '')) ILIKE f_unaccent(${ilikePattern}) ESCAPE '!'`;
    const bodyMatch = sql<boolean>`f_unaccent(left(coalesce(pages.text_content, ''), ${sql.lit(
      2000,
    )})) ILIKE f_unaccent(${ilikePattern}) ESCAPE '!'`;
    const ftsMatch = tsQuery
      ? sql<boolean>`pages.tsv @@ to_tsquery('english', f_unaccent(${tsQuery}))`
      : null;

    const rows = await this.db
      .selectFrom('pages')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', 'in', allowedSpaceIds)
      .where('deletedAt', 'is', null)
      .where((eb) => {
        const conditions = [titleMatch, bodyMatch];
        if (ftsMatch) conditions.push(ftsMatch);
        return eb.or(conditions);
      })
      .limit(FTS_PAGE_LIMIT)
      .execute();

    return rows.map((r) => r.id);
  }
}

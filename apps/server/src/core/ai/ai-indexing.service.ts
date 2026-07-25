import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { createHash } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { isPageEmbeddingsTableExists } from '@docmost/db/helpers/helpers';
import { PageEmbeddingRepo } from '@docmost/db/repos/page-embedding/page-embedding.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AiModelService } from './ai-model.service';
import { chunkText } from './chunking.util';

const EMBED_BATCH = 64;

@Injectable()
export class AiIndexingService {
  private readonly logger = new Logger(AiIndexingService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageEmbeddingRepo: PageEmbeddingRepo,
    private readonly aiModel: AiModelService,
    private readonly environmentService: EnvironmentService,
  ) {}

  private async ready(): Promise<boolean> {
    if (!this.aiModel.isEnabled()) return false;
    return isPageEmbeddingsTableExists(this.db);
  }

  async deletePages(pageIds: string[]): Promise<void> {
    if (!pageIds?.length) return;
    if (!(await this.ready())) return;
    await this.pageEmbeddingRepo.deleteByPageIds(pageIds);
  }

  async reindexPages(pageIds: string[]): Promise<void> {
    if (!pageIds?.length) return;
    if (!(await this.ready())) return;

    const pages = await this.db
      .selectFrom('pages')
      .select([
        'id',
        'title',
        'textContent',
        'spaceId',
        'workspaceId',
        'deletedAt',
      ])
      .where('id', 'in', pageIds)
      .execute();

    for (const page of pages) {
      try {
        await this.reindexPage(page);
      } catch (err) {
        this.logger.error(
          `Failed to embed page ${page.id}: ${err?.['message']}`,
        );
      }
    }
  }

  private async reindexPage(page: {
    id: string;
    title: string | null;
    textContent: string | null;
    spaceId: string;
    workspaceId: string;
    deletedAt: Date | null;
  }): Promise<void> {
    const body = [page.title ?? '', page.textContent ?? ''].join('\n').trim();

    if (page.deletedAt || !body) {
      await this.pageEmbeddingRepo.deleteByPageId(page.id);
      return;
    }

    const modelName = this.environmentService.getAiEmbeddingModel();
    const hash = createHash('sha256')
      .update(`${modelName}\n${body}`)
      .digest('hex');

    const existingHash = await this.pageEmbeddingRepo.getPageIndexHash(page.id);
    if (existingHash === hash) {
      return; // unchanged since last index
    }

    // Prepend the title to the first chunk's context so title-only queries hit.
    const source = `${page.title ?? ''}\n${page.textContent ?? ''}`;
    const chunks = chunkText(
      source,
      this.environmentService.getAiChunkSize(),
      this.environmentService.getAiChunkOverlap(),
    );
    if (!chunks.length) {
      await this.pageEmbeddingRepo.deleteByPageId(page.id);
      return;
    }

    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.text);
      vectors.push(...(await this.aiModel.embed(batch)));
    }

    const dim =
      this.environmentService.getAiEmbeddingDimension() ||
      vectors[0]?.length ||
      0;

    const rows = chunks.map((chunk, i) => ({
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      attachmentId: null,
      modelName,
      modelDimensions: dim,
      embedding: vectors[i],
      chunkIndex: chunk.index,
      chunkStart: chunk.start,
      chunkLength: chunk.length,
      metadata: { hash, text: chunk.text },
    }));

    await executeTx(this.db, async (trx) => {
      await this.pageEmbeddingRepo.deleteByPageId(page.id, trx);
      await this.pageEmbeddingRepo.insertChunks(rows, trx);
    });

    this.logger.debug(`Embedded page ${page.id} (${rows.length} chunks)`);
  }

  async reindexWorkspace(workspaceId: string): Promise<void> {
    if (!(await this.ready())) return;

    const pageSize = 100;
    let lastId: string | null = null;
    // Keyset pagination over workspace pages.
    for (;;) {
      let query = this.db
        .selectFrom('pages')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .orderBy('id', 'asc')
        .limit(pageSize);
      if (lastId) query = query.where('id', '>', lastId);

      const batch = await query.execute();
      if (!batch.length) break;

      await this.reindexPages(batch.map((p) => p.id));
      lastId = batch[batch.length - 1].id;
      if (batch.length < pageSize) break;
    }
    this.logger.log(`Workspace ${workspaceId} embeddings rebuilt`);
  }
}

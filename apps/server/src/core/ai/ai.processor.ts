import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { PageEmbeddingRepo } from '@docmost/db/repos/page-embedding/page-embedding.repo';
import { AiIndexingService } from './ai-indexing.service';

interface AiJobData {
  pageIds?: string[];
  pageId?: string | string[];
  workspaceId?: string;
  spaceId?: string;
}

function normalizePageIds(data: AiJobData): string[] {
  if (Array.isArray(data.pageIds)) return data.pageIds;
  if (Array.isArray(data.pageId)) return data.pageId;
  if (typeof data.pageId === 'string') return [data.pageId];
  return [];
}

/**
 * Consumes the AI queue (jobs are already enqueued by the page/space/workspace
 * listeners and the collab persistence extension). No-ops safely when AI is
 * disabled or the embeddings table is missing.
 */
@Processor(QueueName.AI_QUEUE)
export class AiProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly aiIndexingService: AiIndexingService,
    private readonly pageEmbeddingRepo: PageEmbeddingRepo,
  ) {
    super();
  }

  async process(job: Job<AiJobData, void>): Promise<void> {
    switch (job.name) {
      case QueueJob.PAGE_CREATED:
      case QueueJob.PAGE_CONTENT_UPDATED:
      case QueueJob.PAGE_UPDATED:
      case QueueJob.PAGE_RESTORED:
      case QueueJob.PAGE_MOVED_TO_SPACE:
      case QueueJob.GENERATE_PAGE_EMBEDDINGS:
        await this.aiIndexingService.reindexPages(normalizePageIds(job.data));
        break;

      case QueueJob.PAGE_DELETED:
      case QueueJob.PAGE_SOFT_DELETED:
      case QueueJob.DELETE_PAGE_EMBEDDINGS:
        await this.aiIndexingService.deletePages(normalizePageIds(job.data));
        break;

      case QueueJob.WORKSPACE_CREATE_EMBEDDINGS:
        if (job.data.workspaceId) {
          await this.aiIndexingService.reindexWorkspace(job.data.workspaceId);
        }
        break;

      case QueueJob.WORKSPACE_DELETE_EMBEDDINGS:
      case QueueJob.WORKSPACE_DELETED:
        if (job.data.workspaceId) {
          await this.pageEmbeddingRepo.deleteByWorkspaceId(
            job.data.workspaceId,
          );
        }
        break;

      case QueueJob.SPACE_DELETED:
        if (job.data.spaceId) {
          await this.pageEmbeddingRepo.deleteBySpaceId(job.data.spaceId);
        }
        break;

      default:
        // ignore unrelated jobs routed to this queue
        break;
    }
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.error(
      `Error processing AI ${job.name} job. Reason: ${job.failedReason}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}

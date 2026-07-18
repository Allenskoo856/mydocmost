import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { jsonToHtml } from '../../../collaboration/collaboration.util';
import { getProsemirrorContent } from '../../../common/helpers/prosemirror/utils';

export interface PageSnapshot {
  renderedContent: string;
  contentSize: number;
}

interface SnapshotPage {
  id: string;
  updatedAt: Date;
  content: unknown;
}

const SNAPSHOT_CACHE_SECONDS = 6 * 60 * 60;
const LOCAL_CACHE_LIMIT = 20;

@Injectable()
export class PageSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(PageSnapshotService.name);
  private readonly localCache = new Map<string, PageSnapshot>();
  private readonly pending = new Map<string, Promise<PageSnapshot>>();

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    // Load happy-dom and build the ProseMirror schema during application start
    // instead of charging their cold-start cost to the first page request.
    try {
      await jsonToHtml({ type: 'doc', content: [] });
    } catch (error) {
      this.logger.warn(`Failed to warm page snapshot renderer: ${error}`);
    }
  }

  async getSnapshot(page: SnapshotPage): Promise<PageSnapshot> {
    const cacheKey = this.getCacheKey(page);
    const localSnapshot = this.localCache.get(cacheKey);
    if (localSnapshot) {
      return localSnapshot;
    }

    const pendingSnapshot = this.pending.get(cacheKey);
    if (pendingSnapshot) {
      return pendingSnapshot;
    }

    const snapshotPromise = this.loadOrCreateSnapshot(cacheKey, page).finally(
      () => this.pending.delete(cacheKey),
    );
    this.pending.set(cacheKey, snapshotPromise);

    return snapshotPromise;
  }

  private async loadOrCreateSnapshot(
    cacheKey: string,
    page: SnapshotPage,
  ): Promise<PageSnapshot> {
    const redis = this.redisService.getOrNil();

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const snapshot = JSON.parse(cached) as PageSnapshot;
          this.setLocal(cacheKey, snapshot);
          return snapshot;
        }
      } catch (error) {
        this.logger.warn(`Failed to read page snapshot cache: ${error}`);
      }
    }

    const content = getProsemirrorContent(page.content);
    const serializedContent = JSON.stringify(content);
    const snapshot: PageSnapshot = {
      renderedContent: await jsonToHtml(content),
      contentSize: Buffer.byteLength(serializedContent, 'utf8'),
    };

    this.setLocal(cacheKey, snapshot);

    if (redis) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(snapshot),
          'EX',
          SNAPSHOT_CACHE_SECONDS,
        );
      } catch (error) {
        this.logger.warn(`Failed to write page snapshot cache: ${error}`);
      }
    }

    return snapshot;
  }

  private getCacheKey(page: SnapshotPage): string {
    const updatedAt = new Date(page.updatedAt).getTime();
    return `page-snapshot:v1:${page.id}:${updatedAt}`;
  }

  private setLocal(cacheKey: string, snapshot: PageSnapshot): void {
    this.localCache.set(cacheKey, snapshot);

    if (this.localCache.size > LOCAL_CACHE_LIMIT) {
      const oldestKey = this.localCache.keys().next().value;
      if (oldestKey) {
        this.localCache.delete(oldestKey);
      }
    }
  }
}

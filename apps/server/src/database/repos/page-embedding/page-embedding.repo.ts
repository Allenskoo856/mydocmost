import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Insertable, sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { PageEmbeddings } from '@docmost/db/types/embeddings.types';

@Injectable()
export class PageEmbeddingRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertChunks(
    rows: Insertable<PageEmbeddings>[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (!rows.length) return;
    const db = dbOrTx(this.db, trx);
    await db.insertInto('pageEmbeddings').values(rows).execute();
  }

  async deleteByPageId(pageId: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('pageEmbeddings')
      .where('pageId', '=', pageId)
      .execute();
  }

  async deleteByPageIds(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('pageId', 'in', pageIds)
      .execute();
  }

  async deleteByWorkspaceId(workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async deleteBySpaceId(spaceId: string): Promise<void> {
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('spaceId', '=', spaceId)
      .execute();
  }

  /**
   * Content hash of the currently-indexed page, if any. Used to skip
   * re-embedding when a page's text has not changed.
   */
  async getPageIndexHash(pageId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('pageEmbeddings')
      .select(sql<string>`metadata->>'hash'`.as('hash'))
      .where('pageId', '=', pageId)
      .limit(1)
      .executeTakeFirst();
    return row?.hash ?? null;
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('pageEmbeddings')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}

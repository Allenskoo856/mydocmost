import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  DocDatabaseView,
  InsertableDocDatabaseView,
  UpdatableDocDatabaseView,
} from '@docmost/db/types/entity.types';

@Injectable()
export class DocDatabaseViewRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof DocDatabaseView> = [
    'id',
    'name',
    'type',
    'config',
    'isDefault',
    'databaseId',
    'creatorId',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    viewId: string,
    opts?: { withLock?: boolean; trx?: KyselyTransaction },
  ): Promise<DocDatabaseView> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db.selectFrom('docDatabaseViews').select(this.baseFields);

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    return query.where('id', '=', viewId).executeTakeFirst();
  }

  async listByDatabaseId(
    databaseId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<DocDatabaseView[]> {
    return dbOrTx(this.db, opts?.trx)
      .selectFrom('docDatabaseViews')
      .select(this.baseFields)
      .where('databaseId', '=', databaseId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async insertView(
    insertable: InsertableDocDatabaseView,
    trx?: KyselyTransaction,
  ): Promise<DocDatabaseView> {
    return dbOrTx(this.db, trx)
      .insertInto('docDatabaseViews')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateView(
    updatable: UpdatableDocDatabaseView,
    viewId: string,
    trx?: KyselyTransaction,
  ): Promise<DocDatabaseView> {
    return dbOrTx(this.db, trx)
      .updateTable('docDatabaseViews')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', viewId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async setDefaultView(
    databaseId: string,
    viewId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .updateTable('docDatabaseViews')
      .set({ isDefault: false, updatedAt: new Date() })
      .where('databaseId', '=', databaseId)
      .execute();

    await db
      .updateTable('docDatabaseViews')
      .set({ isDefault: true, updatedAt: new Date() })
      .where('id', '=', viewId)
      .where('databaseId', '=', databaseId)
      .execute();
  }
}

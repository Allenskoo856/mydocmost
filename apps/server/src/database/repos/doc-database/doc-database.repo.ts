import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  DocDatabase,
  InsertableDocDatabase,
  UpdatableDocDatabase,
} from '@docmost/db/types/entity.types';
import { validate as isValidUUID } from 'uuid';

@Injectable()
export class DocDatabaseRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof DocDatabase> = [
    'id',
    'title',
    'schema',
    'ydoc',
    'creatorId',
    'lastUpdatedById',
    'spaceId',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    databaseId: string,
    opts?: {
      withLock?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<DocDatabase> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db.selectFrom('docDatabases').select(this.baseFields);

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    if (isValidUUID(databaseId)) {
      query = query.where('id', '=', databaseId);
    } else {
      query = query.where('id', '=', databaseId);
    }

    return query.executeTakeFirst();
  }

  async insertDatabase(
    insertable: InsertableDocDatabase,
    trx?: KyselyTransaction,
  ): Promise<DocDatabase> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('docDatabases')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateDatabase(
    updatable: UpdatableDocDatabase,
    databaseId: string,
    trx?: KyselyTransaction,
  ): Promise<DocDatabase> {
    return dbOrTx(this.db, trx)
      .updateTable('docDatabases')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', databaseId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocDatabaseRepo } from '../../../database/repos/doc-database/doc-database.repo';
import { DocDatabaseViewRepo } from '../../../database/repos/doc-database/doc-database-view.repo';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { User } from '@docmost/db/types/entity.types';

@Injectable()
export class DocDatabaseService {
  constructor(
    private readonly docDatabaseRepo: DocDatabaseRepo,
    private readonly docDatabaseViewRepo: DocDatabaseViewRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async createDatabase(user: User, workspaceId: string, spaceId: string, title?: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const now = new Date();

    return executeTx(this.db, async (trx) => {
      const database = await this.docDatabaseRepo.insertDatabase(
        {
          title: title ?? '新数据库',
          schema: null,
          ydoc: null,
          creatorId: user.id,
          lastUpdatedById: user.id,
          spaceId,
          workspaceId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        } as any,
        trx,
      );

      const view = await this.docDatabaseViewRepo.insertView(
        {
          name: '表格',
          type: 'table',
          config: null,
          isDefault: true,
          databaseId: database.id,
          creatorId: user.id,
          workspaceId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        } as any,
        trx,
      );

      return { database, view };
    });
  }

  async getInfo(user: User, databaseId: string) {
    const database = await this.docDatabaseRepo.findById(databaseId, {
    });

    if (!database) {
      throw new NotFoundException('Database not found');
    }

    const ability = await this.spaceAbility.createForUser(user, database.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const views = await this.docDatabaseViewRepo.listByDatabaseId(databaseId);

    return { database, views };
  }

  async createView(user: User, workspaceId: string, databaseId: string, input: { name?: string; type?: 'table'; config?: any; isDefault?: boolean }) {
    const database = await this.docDatabaseRepo.findById(databaseId);
    if (!database) {
      throw new NotFoundException('Database not found');
    }

    const ability = await this.spaceAbility.createForUser(user, database.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const now = new Date();

    const view = await this.docDatabaseViewRepo.insertView({
      name: input.name ?? '表格',
      type: input.type ?? 'table',
      config: input.config ?? null,
      isDefault: input.isDefault ?? false,
      databaseId,
      creatorId: user.id,
      workspaceId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    if (view.isDefault) {
      await executeTx(this.db, async (trx) => {
        await this.docDatabaseViewRepo.setDefaultView(databaseId, view.id, trx);
      });
    }

    return view;
  }

  async setDefaultView(user: User, databaseId: string, viewId: string) {
    const database = await this.docDatabaseRepo.findById(databaseId);
    if (!database) {
      throw new NotFoundException('Database not found');
    }

    const ability = await this.spaceAbility.createForUser(user, database.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await executeTx(this.db, async (trx) => {
      const view = await this.docDatabaseViewRepo.findById(viewId, {
        withLock: true,
        trx,
      });

      if (!view || view.databaseId !== databaseId) {
        throw new NotFoundException('View not found');
      }

      await this.docDatabaseViewRepo.setDefaultView(databaseId, viewId, trx);
    });

    return { ok: true };
  }
}

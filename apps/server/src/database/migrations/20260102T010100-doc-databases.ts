import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('doc_databases')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('title', 'varchar', (col) => col)
    .addColumn('schema', 'jsonb', (col) => col)
    .addColumn('ydoc', 'bytea', (col) => col)
    .addColumn('creator_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('last_updated_by_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  await db.schema
    .createTable('doc_database_views')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col)
    .addColumn('type', 'varchar', (col) => col.notNull().defaultTo('table'))
    .addColumn('config', 'jsonb', (col) => col)
    .addColumn('is_default', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('database_id', 'uuid', (col) =>
      col.references('doc_databases.id').onDelete('cascade').notNull(),
    )
    .addColumn('creator_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  await db.schema
    .createIndex('doc_database_views_database_id_idx')
    .on('doc_database_views')
    .column('database_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('doc_database_views').execute();
  await db.schema.dropTable('doc_databases').execute();
}

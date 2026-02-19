import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_page_property_configs')
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade').primaryKey(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('status_options', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .alterTable('pages')
    .addColumn('property_owner_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('property_status', 'varchar', (col) => col)
    .addColumn('property_priority', 'varchar', (col) => col)
    .addColumn('property_due_at', 'timestamptz', (col) => col)
    .addColumn('property_tags', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .execute();

  await db.schema
    .createIndex('pages_space_updated_at_idx')
    .on('pages')
    .columns(['space_id', 'updated_at'])
    .execute();

  await db.schema
    .createIndex('pages_space_property_status_idx')
    .on('pages')
    .columns(['space_id', 'property_status'])
    .execute();

  await db.schema
    .createIndex('pages_space_property_priority_idx')
    .on('pages')
    .columns(['space_id', 'property_priority'])
    .execute();

  await db.schema
    .createIndex('pages_space_property_due_at_idx')
    .on('pages')
    .columns(['space_id', 'property_due_at'])
    .execute();

  await db.schema
    .createIndex('pages_space_property_owner_idx')
    .on('pages')
    .columns(['space_id', 'property_owner_id'])
    .execute();

  await db.schema
    .createIndex('pages_property_tags_gin_idx')
    .on('pages')
    .using('gin')
    .expression(sql`property_tags`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('pages_property_tags_gin_idx').ifExists().execute();
  await db.schema
    .dropIndex('pages_space_property_owner_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('pages_space_property_due_at_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('pages_space_property_priority_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('pages_space_property_status_idx')
    .ifExists()
    .execute();
  await db.schema.dropIndex('pages_space_updated_at_idx').ifExists().execute();

  await db.schema
    .alterTable('pages')
    .dropColumn('property_owner_id')
    .dropColumn('property_status')
    .dropColumn('property_priority')
    .dropColumn('property_due_at')
    .dropColumn('property_tags')
    .execute();

  await db.schema.dropTable('space_page_property_configs').execute();
}

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('templates')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('category', 'varchar', (col) => col.notNull())
    .addColumn('scenes', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('maintainer_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('creator_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('updater_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('content', 'jsonb', (col) => col)
    .addColumn('text_content', 'text', (col) => col)
    .addColumn('tsv', sql`tsvector`, (col) => col)
    .addColumn('icon', 'varchar', (col) => col)
    .addColumn('property_owner_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('property_status', 'varchar', (col) => col)
    .addColumn('property_priority', 'varchar', (col) => col)
    .addColumn('property_due_at', 'timestamptz', (col) => col)
    .addColumn('property_tags', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('draft'))
    .addColumn('is_recommended', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('recommended_order', 'integer', (col) => col)
    .addColumn('published_at', 'timestamptz', (col) => col)
    .addColumn('published_by_id', 'uuid', (col) => col.references('users.id'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  await db.schema
    .createTable('template_usages')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('template_id', 'uuid', (col) =>
      col.references('templates.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('templates_space_status_deleted_idx')
    .on('templates')
    .columns(['space_id', 'status', 'deleted_at'])
    .execute();

  await db.schema
    .createIndex('templates_space_recommended_idx')
    .on('templates')
    .columns(['space_id', 'is_recommended', 'recommended_order'])
    .execute();

  await db.schema
    .createIndex('template_usages_space_created_at_idx')
    .on('template_usages')
    .columns(['space_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('template_usages_user_space_created_at_idx')
    .on('template_usages')
    .columns(['user_id', 'space_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('templates_tsv_idx')
    .on('templates')
    .using('GIN')
    .column('tsv')
    .execute();

  await sql`
    CREATE OR REPLACE FUNCTION templates_tsvector_trigger() RETURNS trigger AS $$
    begin
      new.tsv :=
        setweight(to_tsvector('english', f_unaccent(coalesce(new.name, ''))), 'A') ||
        setweight(to_tsvector('english', f_unaccent(coalesce(new.category, ''))), 'B') ||
        setweight(to_tsvector('english', f_unaccent(coalesce(array_to_string(new.scenes, ' '), ''))), 'B') ||
        setweight(to_tsvector('english', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'C');
      return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE OR REPLACE TRIGGER templates_tsvector_update
    BEFORE INSERT OR UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION templates_tsvector_trigger();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS templates_tsvector_update ON templates`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS templates_tsvector_trigger`.execute(db);

  await db.schema.dropIndex('templates_tsv_idx').ifExists().execute();
  await db.schema
    .dropIndex('template_usages_user_space_created_at_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('template_usages_space_created_at_idx')
    .ifExists()
    .execute();
  await db.schema.dropIndex('templates_space_recommended_idx').ifExists().execute();
  await db.schema
    .dropIndex('templates_space_status_deleted_idx')
    .ifExists()
    .execute();

  await db.schema.dropTable('template_usages').ifExists().execute();
  await db.schema.dropTable('templates').ifExists().execute();
}

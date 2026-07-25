import { Kysely, sql } from 'kysely';

/**
 * RAG embeddings store. No pgvector / no PG extension (works on the stock
 * image): vectors are stored as a native `real[]` column and similarity is
 * computed in the application layer over a permission-filtered candidate set.
 * Chunk text is not duplicated here — it is reconstructed from
 * pages.text_content via (chunk_start, chunk_length).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('page_embeddings')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('attachment_id', 'uuid', (col) =>
      col.references('attachments.id').onDelete('cascade'),
    )
    .addColumn('model_name', 'varchar', (col) => col.notNull())
    .addColumn('model_dimensions', 'integer', (col) => col.notNull())
    .addColumn('embedding', sql`real[]`, (col) => col.notNull())
    .addColumn('chunk_index', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('chunk_start', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('chunk_length', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('metadata', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
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
    .createIndex('page_embeddings_page_id_idx')
    .on('page_embeddings')
    .column('page_id')
    .execute();

  await db.schema
    .createIndex('page_embeddings_workspace_space_idx')
    .on('page_embeddings')
    .columns(['workspace_id', 'space_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('page_embeddings_workspace_space_idx')
    .ifExists()
    .execute();
  await db.schema.dropIndex('page_embeddings_page_id_idx').ifExists().execute();
  await db.schema.dropTable('page_embeddings').ifExists().execute();
}

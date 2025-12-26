import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('file_tasks')
    .addColumn('parent_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('file_tasks')
    .dropColumn('parent_page_id')
    .execute();
}

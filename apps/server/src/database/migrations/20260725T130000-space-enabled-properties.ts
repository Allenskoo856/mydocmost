import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('space_page_property_configs')
    .addColumn('enabled_properties', 'jsonb', (col) =>
      col
        .notNull()
        .defaultTo(
          sql`'["tags","owner","status","priority","dueAt"]'::jsonb`,
        ),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('space_page_property_configs')
    .dropColumn('enabled_properties')
    .execute();
}

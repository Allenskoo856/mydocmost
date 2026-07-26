import { type Kysely, sql } from 'kysely';

/**
 * Accelerate Chinese/CJK substring search used by hybrid page search.
 * Title + first 200k chars of text_content, matching SearchService expressions.
 * Keep existing english tsvector trigger unchanged.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`.execute(db);

  // f_unaccent may already exist from 20250729 migration; recreate is safe.
  await sql`
    CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
    AS $$
      SELECT unaccent($1);
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS pages_title_trgm_idx
    ON pages
    USING gin (f_unaccent(coalesce(title, '')) gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS pages_text_content_trgm_idx
    ON pages
    USING gin (
      f_unaccent(left(coalesce(text_content, ''), 200000)) gin_trgm_ops
    )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS pages_text_content_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pages_title_trgm_idx`.execute(db);
}

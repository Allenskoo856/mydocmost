import { Kysely, sql } from 'kysely';

export function createUnaccentWrapper(schemaName: string) {
  return sql`
    CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN ${extensionObjectIdentifier(schemaName, 'unaccent')}($1);
  `;
}

export async function getExtensionSchema(
  db: Kysely<any>,
  extensionName: string,
): Promise<string> {
  const extension = await db
    .selectFrom('pg_catalog.pg_extension as extension')
    .innerJoin(
      'pg_catalog.pg_namespace as namespace',
      'namespace.oid',
      'extension.extnamespace',
    )
    .select('namespace.nspname as schemaName')
    .where('extension.extname', '=', extensionName)
    .executeTakeFirst();

  return requireExtensionSchema(extensionName, extension?.schemaName);
}

export function extensionObjectIdentifier(
  schemaName: string,
  objectName: string,
) {
  return sql.id(schemaName, objectName);
}

export function requireExtensionSchema(
  extensionName: string,
  schemaName: string | undefined,
): string {
  if (!schemaName) {
    throw new Error(
      `PostgreSQL extension "${extensionName}" is not installed or has no schema`,
    );
  }

  return schemaName;
}

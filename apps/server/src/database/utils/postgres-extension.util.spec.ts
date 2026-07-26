import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import {
  createUnaccentWrapper,
  extensionObjectIdentifier,
  getExtensionSchema,
  requireExtensionSchema,
} from './postgres-extension.util';

describe('postgres extension utilities', () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    db = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool(),
      }),
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('schema-qualifies extension objects', () => {
    const query = sql`select ${extensionObjectIdentifier('extensions', 'unaccent')}($1)`;

    expect(query.compile(db).sql).toBe('select "extensions"."unaccent"($1)');
  });

  it('escapes identifiers containing quotes', () => {
    const query = sql`select ${extensionObjectIdentifier('custom"schema', 'unaccent')}($1)`;

    expect(query.compile(db).sql).toBe(
      'select "custom""schema"."unaccent"($1)',
    );
  });

  it('builds an immutable wrapper with a schema-qualified unaccent call', () => {
    const query = createUnaccentWrapper('extensions');

    expect(query.compile(db).sql).toContain(
      'RETURN "extensions"."unaccent"($1);',
    );
  });

  it('does not use dollar quoting when the schema contains dollar delimiters', () => {
    const compiledSql =
      createUnaccentWrapper('extension$$schema').compile(db).sql;

    expect(compiledSql).toContain('RETURN "extension$$schema"."unaccent"($1);');
    expect(compiledSql).not.toContain('AS $$');
  });

  it('reports a missing extension schema clearly', () => {
    expect(() => requireExtensionSchema('unaccent', undefined)).toThrow(
      'PostgreSQL extension "unaccent" is not installed',
    );
  });

  it('reads the installed schema from PostgreSQL extension metadata', async () => {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest
        .fn()
        .mockResolvedValue({ schemaName: 'extensions' }),
    };
    const metadataDb = {
      selectFrom: jest.fn().mockReturnValue(query),
    };

    await expect(
      getExtensionSchema(metadataDb as never, 'unaccent'),
    ).resolves.toBe('extensions');
    expect(metadataDb.selectFrom).toHaveBeenCalledWith(
      'pg_catalog.pg_extension as extension',
    );
    expect(query.innerJoin).toHaveBeenCalledWith(
      'pg_catalog.pg_namespace as namespace',
      'namespace.oid',
      'extension.extnamespace',
    );
    expect(query.where).toHaveBeenCalledWith(
      'extension.extname',
      '=',
      'unaccent',
    );
  });
});

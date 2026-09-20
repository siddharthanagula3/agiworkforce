import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { SEARCH_SOURCE_KINDS, type SearchSourceKind } from '@agiworkforce/data-layer/search';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/retrieval-embedding-service', async () => {
  class RetrievalEmbeddingError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return { embedTextsMetered: vi.fn(), RetrievalEmbeddingError };
});

const { indexRetrievalDocument, loadRetrievalSourceText } =
  await import('../retrieval-index-service');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INDEX_MIGRATION = 'apps/web/db/neon/0202_retrieval_index.sql';
const LIFECYCLE_CONTRACT = 'packages/contracts/types/src/lifecycle-semantics.json';

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Which table each indexable kind copies from, taken from the schema: the
 * document's foreign key columns and the constraint that ties one of them to
 * each source kind.
 */
function sourceTables(): Map<SearchSourceKind, string> {
  const migration = read(INDEX_MIGRATION);
  const columnTables = new Map<string, string>();
  for (const match of migration.matchAll(
    /^\s{2}([a-z_]+_id)\s+uuid\s+references\s+public\.([a-z_]+)\(id\)/gm,
  )) {
    columnTables.set(match[1]!, match[2]!);
  }
  const tables = new Map<SearchSourceKind, string>();
  for (const match of migration.matchAll(
    /\(source_kind = '([a-z_]+)'\) = \(([a-z_]+_id) is not null\)/g,
  )) {
    const table = columnTables.get(match[2]!);
    if (table) tables.set(match[1] as SearchSourceKind, table);
  }
  return tables;
}

/** The column that says a row of this table has been withdrawn, if it has one. */
function withdrawalMarkers(): Map<string, string> {
  const contract = JSON.parse(read(LIFECYCLE_CONTRACT)) as {
    resources: Record<string, { softDeleted?: { column: string }; archived?: { column: string } }>;
  };
  const markers = new Map<string, string>();
  for (const [table, resource] of Object.entries(contract.resources)) {
    const column = resource.softDeleted?.column ?? resource.archived?.column;
    if (column) markers.set(table, column);
  }
  return markers;
}

function recordingDb(rows: unknown[] = []) {
  const statements: string[] = [];
  const run = async (sql: string) => {
    statements.push(sql);
    return rows;
  };
  const db = {
    query: vi.fn(run),
    execute: vi.fn(async (sql: string) => {
      await run(sql);
      return 1;
    }),
    transaction: vi.fn(async <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
      callback(db as unknown as DatabaseAdapter),
    ),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as unknown as DatabaseAdapter, statements };
}

function claimedDocument(kind: SearchSourceKind) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    organization_id: null,
    source_kind: kind,
    source_id: '22222222-2222-4222-8222-222222222222',
    status: 'indexing',
    chunk_version: 0,
    content_sha256: null,
    embedding_model: null,
    attempts: 0,
  };
}

describe('every indexable source follows its original out of reach', () => {
  it('knows which table each indexed kind copies from', () => {
    const tables = sourceTables();
    expect([...tables.keys()].sort()).toEqual([...SEARCH_SOURCE_KINDS].sort());
  });

  it.each([...SEARCH_SOURCE_KINDS])(
    'reads %s behind the withdrawal marker its table carries',
    async (kind) => {
      const table = sourceTables().get(kind);
      expect(table).toBeDefined();
      const marker = withdrawalMarkers().get(table!);
      if (!marker) return;

      const { db, statements } = recordingDb();
      await loadRetrievalSourceText(db, {
        source_kind: kind,
        source_id: '22222222-2222-4222-8222-222222222222',
        user_id: 'user-1',
      });

      const sourceRead = statements.find((sql) => new RegExp(`from\\s+${table}\\b`).test(sql));
      expect(sourceRead, `${kind} never reads ${table}`).toBeDefined();
      expect(sourceRead, `${kind} can read a withdrawn ${table} row`).toMatch(
        new RegExp(`${marker}\\s+is\\s+null|not\\s+${marker}|${marker}\\s*=\\s*false`),
      );
    },
  );

  it.each([...SEARCH_SOURCE_KINDS])(
    'deletes the %s document rather than rebuilding it when the source is out of reach',
    async (kind) => {
      const { db, statements } = recordingDb();
      db.query = vi.fn(async (sql: string) => {
        statements.push(sql);
        return sql.includes("set status = 'indexing'") ? [claimedDocument(kind)] : [];
      }) as never;

      expect(await indexRetrievalDocument(db, claimedDocument(kind).id, 'run-1')).toEqual({
        kind: 'removed',
      });
      expect(statements.some((sql) => /delete from retrieval_documents/.test(sql))).toBe(true);
      expect(statements.some((sql) => /insert into retrieval_chunks/.test(sql))).toBe(false);
    },
  );
});

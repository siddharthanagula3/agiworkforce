import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { RETRIEVAL_EMBEDDING_DIMENSIONS } from '@agiworkforce/data-layer/search';

const mocks = vi.hoisted(() => ({ embed: vi.fn() }));

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
  return { embedTextsMetered: mocks.embed, RetrievalEmbeddingError };
});

const {
  RETRIEVAL_FAILURE_MESSAGES,
  RETRIEVAL_MAX_ATTEMPTS,
  contentDigest,
  indexRetrievalDocument,
  prepareChunks,
  reserveDueRetrievalDocuments,
} = await import('../retrieval-index-service');
const { RetrievalEmbeddingError } = await import('@/lib/services/retrieval-embedding-service');

const DOCUMENT = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'user-1',
  organization_id: null,
  source_kind: 'project_knowledge',
  source_id: '22222222-2222-4222-8222-222222222222',
  status: 'indexing',
  chunk_version: 2,
  content_sha256: null,
  embedding_model: null,
  attempts: 1,
};

const TEXT = Array.from({ length: 30 }, (_, index) => `Paragraph ${index} about refunds.`).join(
  '\n\n',
);

interface FakeOptions {
  claimed?: Record<string, unknown> | null;
  file?: Record<string, unknown> | null;
}

function fakeDb(options: FakeOptions = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const run = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("set status = 'indexing'")) {
      return options.claimed === undefined ? [DOCUMENT] : options.claimed ? [options.claimed] : [];
    }
    if (sql.includes('from project_knowledge_files')) {
      return options.file === undefined
        ? [
            {
              project_id: 'project-1',
              file_name: 'policy.md',
              extracted_text: TEXT,
              extracted_anchors: [{ start: 0, page: 3 }],
            },
          ]
        : options.file
          ? [options.file]
          : [];
    }
    return [];
  };
  const db = {
    query: vi.fn(run),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      await run(sql, params);
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

function vector(): number[] {
  return Array.from({ length: RETRIEVAL_EMBEDDING_DIMENSIONS }, () => 0.01);
}

beforeEach(() => {
  mocks.embed.mockReset();
});

describe('prepareChunks', () => {
  it('windows a knowledge file and stamps each chunk with its project and page', () => {
    const chunks = prepareChunks({
      title: 'policy.md',
      segments: [{ text: TEXT, metadata: { projectId: 'project-1' } }],
      anchorsFor: () => ({ anchor: { page: 3 } }),
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({
      index: 0,
      start: 0,
      metadata: { projectId: 'project-1', anchor: { page: 3 } },
    });
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
  });
});

describe('indexRetrievalDocument', () => {
  it('embeds every chunk, writes the next chunk version and marks the document indexed', async () => {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
    const { db, statements } = fakeDb();

    const outcome = await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

    expect(outcome).toMatchObject({ kind: 'indexed', semantic: true });
    const insert = statements.find((entry) => entry.sql.includes('insert into retrieval_chunks'));
    expect(insert?.params[5]).toBe(3);
    const embeddings = insert?.params[12] as Array<string | null>;
    expect(embeddings.every((literal) => literal?.startsWith('[0.01,'))).toBe(true);
    const settle = statements.find((entry) => entry.sql.includes("then 'indexed'"));
    expect(settle?.params).toEqual(
      expect.arrayContaining([true, 3, 'embedding-model', null, DOCUMENT.user_id]),
    );
  });

  it('stores chunks for keyword search and schedules a retry when embedding is refused', async () => {
    mocks.embed.mockRejectedValue(new RetrievalEmbeddingError('limit', 'billing_refused'));
    const { db, statements } = fakeDb();

    const outcome = await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

    expect(outcome).toMatchObject({ kind: 'failed' });
    const insert = statements.find((entry) => entry.sql.includes('insert into retrieval_chunks'));
    expect((insert?.params[12] as unknown[]).every((literal) => literal === null)).toBe(true);
    const settle = statements.find((entry) => entry.sql.includes("then 'indexed'"));
    expect(settle?.params[1]).toBe(false);
    expect(settle?.params[8]).toBe(RETRIEVAL_FAILURE_MESSAGES.billing_refused);
  });

  it('costs nothing when the text is unchanged and already embedded', async () => {
    const chunks = prepareChunks({
      title: 'policy.md',
      segments: [{ text: TEXT, metadata: { projectId: 'project-1' } }],
    });
    const { db, statements } = fakeDb({
      claimed: {
        ...DOCUMENT,
        content_sha256: contentDigest('policy.md', chunks),
        embedding_model: 'embedding-model',
      },
    });

    const outcome = await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(statements.some((entry) => entry.sql.includes('insert into retrieval_chunks'))).toBe(
      false,
    );
  });

  it('deletes the document when its source is gone', async () => {
    const { db, statements } = fakeDb({ file: null });

    expect(await indexRetrievalDocument(db, DOCUMENT.id, 'run-1')).toEqual({ kind: 'removed' });
    expect(
      statements.find((entry) => entry.sql.includes('delete from retrieval_documents'))?.params,
    ).toEqual([DOCUMENT.id, DOCUMENT.user_id]);
  });

  it('skips a document another run holds', async () => {
    const { db } = fakeDb({ claimed: null });
    expect(await indexRetrievalDocument(db, DOCUMENT.id, 'run-2')).toEqual({ kind: 'skipped' });
    expect(mocks.embed).not.toHaveBeenCalled();
  });
});

describe('developer session documents', () => {
  const SESSION_DOCUMENT = {
    ...DOCUMENT,
    id: '33333333-3333-4333-8333-333333333333',
    source_kind: 'developer_session',
    source_id: '44444444-4444-4444-8444-444444444444',
  };

  function sessionDb(archivedAt: string | null) {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const run = async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes("set status = 'indexing'")) return [SESSION_DOCUMENT];
      if (sql.includes('from cloud_code_sessions')) {
        const withheld = sql.includes('archived_at is null') && archivedAt !== null;
        return withheld ? [] : [{ title: 'Parser work', repository_url: null }];
      }
      if (sql.includes('from cloud_code_agent_turns')) {
        return [{ id: 'turn-1', goal: 'Fix the parser', final_message: 'Parser fixed.' }];
      }
      return [];
    };
    const db = {
      query: vi.fn(run),
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        await run(sql, params);
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

  it('indexes the turns of an active session', async () => {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
    const { db, statements } = sessionDb(null);

    expect(await indexRetrievalDocument(db, SESSION_DOCUMENT.id, 'run-1')).toMatchObject({
      kind: 'indexed',
    });
    const insert = statements.find((entry) => entry.sql.includes('insert into retrieval_chunks'));
    expect((insert?.params[10] as string[]).join(' ')).toContain('Parser fixed.');
  });

  it('removes the document of an archived session instead of rebuilding it', async () => {
    const { db, statements } = sessionDb('2026-09-19T00:00:00.000Z');

    expect(await indexRetrievalDocument(db, SESSION_DOCUMENT.id, 'run-1')).toEqual({
      kind: 'removed',
    });
    expect(
      statements.find((entry) => entry.sql.includes('delete from retrieval_documents'))?.params,
    ).toEqual([SESSION_DOCUMENT.id, SESSION_DOCUMENT.user_id]);
    expect(statements.some((entry) => entry.sql.includes('insert into retrieval_chunks'))).toBe(
      false,
    );
    expect(mocks.embed).not.toHaveBeenCalled();
  });
});

describe('reserveDueRetrievalDocuments', () => {
  it('holds due documents with skip-locked claiming and the attempt ceiling', async () => {
    const { db, statements } = fakeDb();
    await reserveDueRetrievalDocuments(db, 10);
    expect(statements[0]?.sql).toContain('for update skip locked');
    expect(statements[0]?.params).toEqual([RETRIEVAL_MAX_ATTEMPTS, 10]);
  });
});

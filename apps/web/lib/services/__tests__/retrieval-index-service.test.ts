import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { RETRIEVAL_EMBEDDING_DIMENSIONS } from '@agiworkforce/data-layer/search';
import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import {
  ChatFileSchemaReachedError,
  createSchemaAbsentDb,
} from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import {
  BUCKET,
  FakePreparationDb,
  createCountingStorage,
  type CountingStorage,
} from '@/lib/server/chat-file-preparation/__tests__/preparation-harness';
import {
  pagesIndexKey,
  preparationKeyPrefix,
  serializePagesIndex,
  textSegmentKey,
  type PreparedPageEntry,
} from '@/lib/server/chat-file-preparation/derived-keys';

type SchemaModule = typeof import('@/lib/server/chat-file-intake/schema');

const mocks = vi.hoisted(() => ({ embed: vi.fn() }));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/chat-file-intake/schema', async (importOriginal) => {
  const actual = await importOriginal<SchemaModule>();
  return {
    ...actual,
    chatFileSchemaReady: (db: Parameters<typeof actual.chatFileSchemaReady>[0]) =>
      actual.chatFileSchemaReady(db),
  };
});
vi.mock('@/lib/services/retrieval-embedding-service', async (importOriginal) => {
  class RetrievalEmbeddingError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    embedTextsMetered: mocks.embed,
    RetrievalEmbeddingError,
  };
});

const {
  RETRIEVAL_FAILURE_MESSAGES,
  RETRIEVAL_MAX_ATTEMPTS,
  contentDigest,
  indexRetrievalDocument,
  prepareChunks,
  preparedChatFileChunkCap,
  requestMediaAssetReindex,
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
  googleSource?: boolean;
  settledRows?: number;
  failChunkInsert?: boolean;
}

/** The real adapters refuse a transaction opened inside another; a fake that allowed it hid one. */
function insideTransaction(db: object): DatabaseAdapter {
  return {
    ...db,
    transaction: async () => {
      throw new Error('A transaction cannot be opened inside another transaction.');
    },
  } as unknown as DatabaseAdapter;
}

function fakeDb(options: FakeOptions = {}) {
  const statements: Array<{ sql: string; params: unknown[]; transaction: boolean }> = [];
  const run = async (sql: string, params: unknown[] = [], transaction = false) => {
    statements.push({ sql, params, transaction });
    if (options.failChunkInsert && sql.includes('insert into retrieval_chunks')) {
      throw new Error('insert failed');
    }
    if (sql.includes('external_resource_references')) {
      return [{ google: options.googleSource === true }];
    }
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
  const statementsOn = (transaction: boolean) => ({
    query: vi.fn((sql: string, params?: unknown[]) => run(sql, params, transaction)),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      await run(sql, params, transaction);
      return sql.includes('update retrieval_documents') ? (options.settledRows ?? 1) : 1;
    }),
  });
  const db = {
    ...statementsOn(false),
    transaction: vi.fn(async <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
      callback(insideTransaction({ ...db, ...statementsOn(true) })),
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

describe('contentDigest', () => {
  it('hashes the title followed by each chunk behind a NUL separator, so stored digests stay valid', () => {
    const chunks = ['alpha', 'beta'].map((text, index) => ({
      index,
      start: 0,
      end: text.length,
      text,
      metadata: {},
    }));

    expect(contentDigest('policy.md', chunks)).toBe(
      createHash('sha256').update('policy.md\u0000alpha\u0000beta').digest('hex'),
    );
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

  it.each([
    ['a file imported from a Google connector', true],
    ['an uploaded file', false],
  ])(
    'embeds %s with providers that keep inputs out of training only when it came from Google',
    async (_label, googleSource) => {
      mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
        vectors: texts.map(() => vector()),
        model: 'embedding-model',
        routeId: 'route',
      }));
      const { db } = fakeDb({ googleSource });

      await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

      expect(mocks.embed).toHaveBeenCalled();
      for (const [input] of mocks.embed.mock.calls) {
        expect(input).toMatchObject({ purpose: 'document', forceNoTraining: googleSource });
      }
    },
  );

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

  it('settles and writes chunks in one transaction, fenced to the claiming run', async () => {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
    const { db, statements } = fakeDb();

    await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

    const settle = statements.find((entry) => entry.sql.includes("then 'indexed'"));
    const insert = statements.find((entry) => entry.sql.includes('insert into retrieval_chunks'));
    expect(settle?.transaction).toBe(true);
    expect(insert?.transaction).toBe(true);
    expect(settle?.sql).toContain('workflow_run_id = $13');
    expect(settle?.params[12]).toBe('run-1');
    expect(statements.indexOf(settle!)).toBeLessThan(statements.indexOf(insert!));
  });

  it('writes nothing when a newer run has taken the document over', async () => {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
    const { db, statements } = fakeDb({ settledRows: 0 });

    expect(await indexRetrievalDocument(db, DOCUMENT.id, 'run-1')).toEqual({ kind: 'skipped' });
    expect(statements.some((entry) => entry.sql.includes('delete from retrieval_chunks'))).toBe(
      false,
    );
    expect(statements.some((entry) => entry.sql.includes('insert into retrieval_chunks'))).toBe(
      false,
    );
  });

  it('does not let a superseded run record an unchanged result', async () => {
    const chunks = prepareChunks({
      title: 'policy.md',
      segments: [{ text: TEXT, metadata: { projectId: 'project-1' } }],
    });
    const { db } = fakeDb({
      settledRows: 0,
      claimed: {
        ...DOCUMENT,
        content_sha256: contentDigest('policy.md', chunks),
        embedding_model: 'embedding-model',
      },
    });

    expect(await indexRetrievalDocument(db, DOCUMENT.id, 'run-1')).toEqual({ kind: 'skipped' });
  });

  it('records a failed write without having published a new chunk version', async () => {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
    const { db, statements } = fakeDb({ failChunkInsert: true });

    expect(await indexRetrievalDocument(db, DOCUMENT.id, 'run-1')).toMatchObject({
      kind: 'failed',
    });
    const failure = statements.filter((entry) => entry.sql.includes("then 'indexed'")).at(-1);
    expect(failure?.transaction).toBe(false);
    expect(failure?.params[1]).toBe(false);
    expect(failure?.params[2]).toBeNull();
  });

  it('keeps the retry delay of a much-retried document within a day, a value the interval can hold', async () => {
    const { db, statements } = fakeDb({
      claimed: { ...DOCUMENT, attempts: 40 },
      failChunkInsert: true,
    });

    await indexRetrievalDocument(db, DOCUMENT.id, 'run-1');

    const failure = statements.filter((entry) => entry.sql.includes("then 'indexed'")).at(-1);
    expect(failure?.params[10]).toBe(24 * 60);
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
        callback(insideTransaction(db)),
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

describe('Google provenance at actual embedding dispatch', () => {
  it.each(['conversation', 'artifact', 'research_report'])(
    'reads current %s provenance after capturing source bytes',
    async (sourceKind) => {
      for (const unreadable of [false, true]) {
        let captured = false;
        let provenanceRead = false;
        let provenanceReadBeforeCapture = false;
        mocks.embed.mockClear();
        mocks.embed.mockImplementation(
          async ({ texts, forceNoTraining }: { texts: string[]; forceNoTraining: boolean }) => {
            expect(captured).toBe(true);
            expect(provenanceRead).toBe(true);
            expect(forceNoTraining).toBe(true);
            expect(texts.join(' ')).toContain('captured-source');
            return {
              vectors: texts.map(() => vector()),
              model: 'embedding-model',
              routeId: 'route',
            };
          },
        );
        const query = vi.fn(async (sql: string) => {
          if (sql.includes("set status = 'indexing'"))
            return [{ ...DOCUMENT, source_kind: sourceKind }];
          if (sql.includes('google_user_data_at is not null as marked')) {
            provenanceReadBeforeCapture ||= !captured;
            provenanceRead = true;
            if (unreadable) throw new Error('Provenance read unavailable');
            return [{ marked: true, project_id: null }];
          }
          if (sql.includes('select conversation_id::text as conversation_id'))
            return [{ conversation_id: 'source-conversation' }];
          if (sql.includes('select title from web_conversations'))
            return [{ title: 'captured-title' }];
          if (sql.includes('from web_messages')) {
            captured = true;
            return [{ id: 'source-message', role: 'assistant', content: 'captured-source' }];
          }
          if (sql.includes('from web_artifacts a') || sql.includes('from research_reports r')) {
            captured = true;
            return [
              {
                title: 'captured-title',
                content: 'captured-source',
                query: 'query',
                summary: 'summary',
                artifact_type: 'text',
                language: null,
                conversation_id: 'source-conversation',
              },
            ];
          }
          return [];
        });
        const db = {
          query,
          execute: vi.fn(async () => 1),
          transaction: vi.fn(async <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
            callback(insideTransaction(db)),
          ),
        };
        await expect(
          indexRetrievalDocument(db as unknown as DatabaseAdapter, DOCUMENT.id, 'run-1'),
        ).resolves.toMatchObject({
          kind: 'indexed',
          semantic: true,
        });
        expect(mocks.embed).toHaveBeenCalled();
        expect(provenanceReadBeforeCapture).toBe(false);
        expect(query.mock.calls.some(([sql]) => sql.includes('gmail_data_present'))).toBe(false);
      }
    },
  );
});

describe('library_file documents of large chat files', () => {
  const ASSET_ID = '55555555-5555-4555-8555-555555555555';
  const OWNER = 'user-1';
  const LIBRARY_DOCUMENT = {
    ...DOCUMENT,
    id: '66666666-6666-4666-8666-666666666666',
    source_kind: 'library_file',
    source_id: ASSET_ID,
  };
  const SENTENCE = 'The harbor lantern report covers the meadow quarter in detail. ';

  interface LibraryAsset {
    kind: string;
    mime_type: string;
    prompt: string | null;
    file_name: string | null;
    byte_size: number | null;
  }

  const LARGE_FILE: LibraryAsset = {
    kind: 'file',
    mime_type: 'text/plain',
    prompt: null,
    file_name: 'ledger.txt',
    byte_size: MAX_CHAT_ATTACHMENT_BYTES + 1,
  };

  function textOf(chars: number): string {
    return SENTENCE.repeat(Math.ceil(chars / SENTENCE.length)).slice(0, chars);
  }

  async function seedPreparation(
    prep: FakePreparationDb,
    storage: CountingStorage,
    options: {
      assetId?: string;
      text?: string;
      kind?: string;
      pages?: PreparedPageEntry[];
      indexedChars?: number;
      withText?: boolean;
    },
  ): Promise<void> {
    const assetId = options.assetId ?? ASSET_ID;
    const prefix = preparationKeyPrefix(OWNER, assetId, 1);
    const derived: string[] = [];
    const text = options.text ?? '';
    if (options.withText !== false) {
      const key = textSegmentKey(prefix, 1);
      await storage.memory.put({
        bucket: BUCKET,
        key,
        body: Buffer.from(text, 'utf8'),
        contentType: 'text/plain',
      });
      derived.push(key);
    }
    if (options.pages) {
      const key = pagesIndexKey(prefix, 1);
      await storage.memory.put({
        bucket: BUCKET,
        key,
        body: Buffer.from(serializePagesIndex(options.pages), 'utf8'),
        contentType: 'application/json',
      });
      derived.push(key);
    }
    const id = `row-${assetId}`;
    prep.rows.set(id, {
      id,
      media_asset_id: assetId,
      user_id: OWNER,
      organization_id: null,
      kind: options.kind ?? 'text',
      state: 'ready',
      preparer_version: 1,
      cursor: {},
      segments_ready: options.withText === false ? 0 : 1,
      pages_read: options.pages?.length ?? 0,
      page_count: options.pages?.length ?? null,
      sheet_count: null,
      indexed_chars: String(options.indexedChars ?? 0),
      derived_keys: derived,
      coverage:
        options.withText === false
          ? { segmentChars: [], textChars: 0 }
          : { segmentChars: [text.length], textChars: text.length },
      error: null,
      updated_at: new Date(),
    });
  }

  function libraryDb(options: {
    asset: LibraryAsset | null;
    claimed?: Record<string, unknown>;
    schemaAbsent?: boolean;
  }) {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
      statements.push({ sql, params });
      if (/chat_file_|to_regclass|information_schema/.test(sql)) return prep.query(sql, params);
      if (sql.includes('external_resource_references')) return [{ google: false }];
      if (sql.includes("set status = 'indexing'")) return [options.claimed ?? LIBRARY_DOCUMENT];
      if (sql.includes('from media_assets')) return options.asset ? [options.asset] : [];
      return [];
    };
    const delegate = {
      query: vi.fn(run),
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        await run(sql, params);
        return 1;
      }),
      transaction: vi.fn(async <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
        callback(insideTransaction(delegate)),
      ),
      withUser: vi.fn(),
      withOrg: vi.fn(),
      dispose: vi.fn(),
    };
    const db = options.schemaAbsent
      ? createSchemaAbsentDb(delegate as unknown as DatabaseAdapter)
      : (delegate as unknown as DatabaseAdapter);
    return { db, prep, storage, statements };
  }

  function insertedChunks(statements: Array<{ sql: string; params: unknown[] }>) {
    const inserts = statements.filter((entry) =>
      entry.sql.includes('insert into retrieval_chunks'),
    );
    return {
      contents: inserts.flatMap((entry) => entry.params[10] as string[]),
      starts: inserts.flatMap((entry) => entry.params[8] as number[]),
      ends: inserts.flatMap((entry) => entry.params[9] as number[]),
      metadata: inserts.flatMap((entry) =>
        (entry.params[11] as string[]).map((json) => JSON.parse(json)),
      ),
      embeddings: inserts.flatMap((entry) => entry.params[12] as Array<string | null>),
    };
  }

  function namesChatFileSchema(statements: Array<{ sql: string }>): boolean {
    return statements.some((entry) => /chat_file_|to_regclass|scanned_sha256/.test(entry.sql));
  }

  function embedEverything() {
    mocks.embed.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      vectors: texts.map(() => vector()),
      model: 'embedding-model',
      routeId: 'route',
    }));
  }

  it('a small library_file indexes exactly as today', async () => {
    embedEverything();
    const asset = { ...LARGE_FILE, file_name: 'notes.txt', byte_size: 2_048 };
    const { db, statements } = libraryDb({ asset, schemaAbsent: true });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1');

    expect(outcome).toEqual({ kind: 'indexed', chunkCount: 1, semantic: true });
    expect(namesChatFileSchema(statements)).toBe(false);
    expect(insertedChunks(statements).contents).toEqual(['notes.txt']);
    expect(mocks.embed).toHaveBeenCalledTimes(1);
  });

  it('a large library_file against a database without the chat file schema indexes its title as today', async () => {
    embedEverything();
    const { db, statements } = libraryDb({ asset: LARGE_FILE, schemaAbsent: true });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1');

    expect(outcome).toEqual({ kind: 'indexed', chunkCount: 1, semantic: true });
    expect(insertedChunks(statements).contents).toEqual(['ledger.txt']);
  });

  it('a large file with no preparation row keeps the title-only text', async () => {
    embedEverything();
    const { db, statements } = libraryDb({ asset: LARGE_FILE });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1');

    expect(outcome).toEqual({ kind: 'indexed', chunkCount: 1, semantic: true });
    expect(insertedChunks(statements).contents).toEqual(['ledger.txt']);
  });

  it('a generated-media library_file is indexed unchanged and never asks for the chat file schema', async () => {
    embedEverything();
    const asset: LibraryAsset = {
      kind: 'video',
      mime_type: 'video/mp4',
      prompt: 'A red fox crossing a snowy field',
      file_name: null,
      byte_size: 90 * 1024 * 1024,
    };
    const { db, statements } = libraryDb({ asset });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1');

    expect(outcome).toEqual({ kind: 'indexed', chunkCount: 1, semantic: true });
    expect(namesChatFileSchema(statements)).toBe(false);
    expect(insertedChunks(statements).contents).toEqual([
      'video\n\nA red fox crossing a snowy field',
    ]);
  });

  it('indexes 2,000,000 characters of prepared text in about 1,670 keyword-only chunks and nothing past the cap', async () => {
    const indexedCap = CHAT_LARGE_FILE_POLICY.preparation.maxIndexedChars;
    expect(preparedChatFileChunkCap()).toBe(1_669);
    for (const body of ['x'.repeat(indexedCap), textOf(indexedCap)]) {
      mocks.embed.mockClear();
      const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
      await seedPreparation(prep, storage, { text: `${body}zebramarker past the cap` });

      const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
        preparation: { storage },
      });

      expect(outcome).toMatchObject({ kind: 'indexed', semantic: false });
      const chunks = insertedChunks(statements);
      expect(chunks.contents.length).toBeGreaterThan(1_500);
      expect(chunks.contents.length).toBeLessThanOrEqual(preparedChatFileChunkCap());
      expect(chunks.contents[0]).toBe('ledger.txt');
      expect(chunks.contents.some((content) => content.includes('zebramarker'))).toBe(false);
      expect(Math.max(...chunks.ends)).toBe(indexedCap);
      expect(prep.rowForAsset(ASSET_ID)?.['indexed_chars']).toBe(String(indexedCap));
      expect(mocks.embed).not.toHaveBeenCalled();
      if (body.startsWith('x')) expect(chunks.contents).toHaveLength(1_668);
    }
  });

  it('spends no embedding on a chat file and settles it as succeeded with no embedding model', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, storage, { text: textOf(5_000) });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage },
    });

    expect(outcome).toMatchObject({ kind: 'indexed', semantic: false });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(insertedChunks(statements).embeddings.every((literal) => literal === null)).toBe(true);
    const settle = statements.find((entry) => entry.sql.includes("then 'indexed'"));
    expect(settle?.params[1]).toBe(true);
    expect(settle?.params[5]).toBe(true);
    expect(settle?.params[6]).toBeNull();
    expect(settle?.params[8]).toBeNull();
  });

  it('treats an unchanged digest of a keyword-only chat file as a no-op', async () => {
    const first = libraryDb({ asset: LARGE_FILE });
    const text = textOf(5_000);
    await seedPreparation(first.prep, first.storage, { text });
    await indexRetrievalDocument(first.db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage: first.storage },
    });
    const digest = first.statements.find((entry) => entry.sql.includes("then 'indexed'"))
      ?.params[4];
    expect(typeof digest).toBe('string');

    const second = libraryDb({
      asset: LARGE_FILE,
      claimed: { ...LIBRARY_DOCUMENT, content_sha256: digest, embedding_model: null },
    });
    await seedPreparation(second.prep, second.storage, { text, indexedChars: text.length });

    const outcome = await indexRetrievalDocument(second.db, LIBRARY_DOCUMENT.id, 'run-2', {
      preparation: { storage: second.storage },
    });

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(
      second.statements.some((entry) => entry.sql.includes('insert into retrieval_chunks')),
    ).toBe(false);
    expect(second.statements.some((entry) => entry.sql.includes('set indexed_chars'))).toBe(false);
  });

  it('records the indexed characters on an unchanged run when an earlier record was lost', async () => {
    const first = libraryDb({ asset: LARGE_FILE });
    const text = textOf(5_000);
    await seedPreparation(first.prep, first.storage, { text });
    await indexRetrievalDocument(first.db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage: first.storage },
    });
    const digest = first.statements.find((entry) => entry.sql.includes("then 'indexed'"))
      ?.params[4];

    const second = libraryDb({
      asset: LARGE_FILE,
      claimed: { ...LIBRARY_DOCUMENT, content_sha256: digest, embedding_model: null },
    });
    await seedPreparation(second.prep, second.storage, { text, indexedChars: 0 });

    const outcome = await indexRetrievalDocument(second.db, LIBRARY_DOCUMENT.id, 'run-2', {
      preparation: { storage: second.storage },
    });

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(second.prep.rowForAsset(ASSET_ID)?.['indexed_chars']).toBe(String(text.length));
  });

  it('a reindex asked for while the file is being indexed leaves the document stale, so it runs again', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    const text = textOf(5_000);
    await seedPreparation(prep, storage, { text });
    const document = { status: 'pending', workflowRunId: null as string | null };
    let reindexedMidRun = false;

    const nextStatus = (sql: string, params: unknown[]): string => {
      const body = /set status = case([\s\S]*?)end,/.exec(sql)?.[1] ?? '';
      for (const [, condition, result] of body.matchAll(/when\s+(.+?)\s+then\s+(\S+)/g)) {
        const flag = /^\$(\d+)::boolean$/.exec(condition!);
        const holds = flag
          ? params[Number(flag[1]) - 1] === true
          : /'(\w+)'/.exec(condition!)?.[1] === document.status;
        if (holds)
          return result!.endsWith('status') ? document.status : result!.replaceAll("'", '');
      }
      return /else\s+'(\w+)'/.exec(body)?.[1] ?? document.status;
    };

    const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
      if (/chat_file_|to_regclass|information_schema/.test(sql)) return prep.query(sql, params);
      if (sql.includes('external_resource_references')) return [{ google: false }];
      if (sql.includes("set status = 'indexing'")) {
        if (!['pending', 'stale', 'failed'].includes(document.status)) return [];
        document.status = 'indexing';
        document.workflowRunId = String(params[1]);
        return [{ ...LIBRARY_DOCUMENT, status: 'indexing' }];
      }
      if (sql.includes('where d.media_asset_id = $1::uuid')) {
        document.status = nextStatus(sql, params);
        return [{ id: LIBRARY_DOCUMENT.id }];
      }
      if (sql.includes("then 'indexed'")) {
        if (!['indexing', 'stale'].includes(document.status)) return [];
        if (params[12] !== document.workflowRunId) return [];
        document.status = nextStatus(sql, params);
        return [{}];
      }
      if (sql.includes("metadata->>'filename' as file_name")) {
        if (!reindexedMidRun) {
          reindexedMidRun = true;
          await requestMediaAssetReindex(db, { assetId: ASSET_ID, ownerUserId: OWNER });
        }
        return [LARGE_FILE];
      }
      return [];
    };
    const adapter = {
      query: vi.fn(run),
      execute: vi.fn(
        async (sql: string, params: unknown[] = []) => (await run(sql, params)).length,
      ),
      transaction: vi.fn(async <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
        callback(insideTransaction(adapter)),
      ),
      withUser: vi.fn(),
      withOrg: vi.fn(),
      dispose: vi.fn(),
    };
    const db = adapter as unknown as DatabaseAdapter;

    const first = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage },
    });

    expect(reindexedMidRun).toBe(true);
    expect(first).toMatchObject({ kind: 'indexed' });
    expect(document.status).toBe('stale');

    const second = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-2', {
      preparation: { storage },
    });
    expect(second).toMatchObject({ kind: 'indexed' });
    expect(document.status).toBe('indexed');
  });

  it('stops indexing once the person has used the per-user indexed character cap', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, storage, { text: textOf(5_000) });
    await seedPreparation(prep, storage, {
      assetId: '77777777-7777-4777-8777-777777777777',
      text: 'other file',
      indexedChars: CHAT_LARGE_FILE_POLICY.preparation.maxIndexedCharsPerUser,
    });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage },
    });

    expect(outcome).toEqual({ kind: 'indexed', chunkCount: 1, semantic: false });
    expect(insertedChunks(statements).contents).toEqual(['ledger.txt']);
    expect(prep.rowForAsset(ASSET_ID)?.['indexed_chars']).toBe('0');
  });

  it('indexes only what is left of the per-user cap', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, storage, { text: textOf(5_000) });
    await seedPreparation(prep, storage, {
      assetId: '77777777-7777-4777-8777-777777777777',
      text: 'other file',
      indexedChars: CHAT_LARGE_FILE_POLICY.preparation.maxIndexedCharsPerUser - 1_000,
    });

    await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', { preparation: { storage } });

    expect(Math.max(...insertedChunks(statements).ends)).toBe(1_000);
    expect(prep.rowForAsset(ASSET_ID)?.['indexed_chars']).toBe('1000');
  });

  it('stamps each chunk with the page it starts on', async () => {
    const { db, prep, storage, statements } = libraryDb({
      asset: { ...LARGE_FILE, mime_type: 'application/pdf', file_name: 'report.pdf' },
    });
    const text = textOf(6_000);
    await seedPreparation(prep, storage, {
      text,
      kind: 'pdf',
      pages: [
        { page: 1, start: 0, end: 3_000, hasText: true },
        { page: 2, start: 3_000, end: 6_000, hasText: true },
      ],
    });

    await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', { preparation: { storage } });

    const chunks = insertedChunks(statements);
    const textChunks = chunks.metadata.slice(1);
    const starts = chunks.starts.slice(1);
    expect(textChunks[0]).toMatchObject({ page: 1 });
    textChunks.forEach((metadata, index) => {
      expect(metadata).toMatchObject({ page: starts[index]! >= 3_000 ? 2 : 1 });
    });
  });

  it('writes prepared text holding NUL characters in a form Postgres stores', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, storage, { text: `alpha\u0000beta ${textOf(2_000)}` });

    await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', { preparation: { storage } });

    const contents = insertedChunks(statements).contents;
    expect(contents[1]?.startsWith('alphabeta ')).toBe(true);
    expect(contents.some((content) => content.includes('\u0000'))).toBe(false);
  });

  it('writes prepared text holding NUL and cut inside a surrogate pair in a form Postgres stores', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    const text = `alpha\u0000beta ${'\u{1F600}'.repeat(4_000)}`;
    await seedPreparation(prep, storage, { text });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage },
    });

    expect(outcome).toMatchObject({ kind: 'indexed' });
    const chunks = insertedChunks(statements);
    expect(chunks.contents.length).toBeGreaterThan(2);
    expect(chunks.contents.every((content) => content.isWellFormed())).toBe(true);
    expect(chunks.contents.some((content) => content.includes('\ufffd'))).toBe(true);
    expect(chunks.contents.some((content) => content.includes('\u0000'))).toBe(false);
    expect(chunks.contents[1]?.startsWith('alphabeta ')).toBe(true);
  });

  it('leaves out a window of prepared text made only of NUL characters, so no chunk is empty', async () => {
    const { db, prep, storage, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, storage, { text: `alpha ${'\u0000'.repeat(4_000)} omega` });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage },
    });

    expect(outcome).toMatchObject({ kind: 'indexed' });
    const chunks = insertedChunks(statements);
    expect(chunks.contents.every((content) => content.trim().length > 0)).toBe(true);
    expect(chunks.contents.some((content) => content.includes('alpha'))).toBe(true);
    expect(chunks.contents.some((content) => content.includes('omega'))).toBe(true);
    expect(chunks.contents.some((content) => content.includes('\u0000'))).toBe(false);
  });

  it('records a failed attempt with backoff when prepared text cannot be read', async () => {
    const { db, prep, statements } = libraryDb({ asset: LARGE_FILE });
    await seedPreparation(prep, createCountingStorage(), { text: textOf(1_000) });

    const outcome = await indexRetrievalDocument(db, LIBRARY_DOCUMENT.id, 'run-1', {
      preparation: { storage: createCountingStorage() },
    });

    expect(outcome).toMatchObject({ kind: 'failed' });
    const settle = statements.filter((entry) => entry.sql.includes("then 'indexed'")).at(-1);
    expect(settle?.params[1]).toBe(false);
    expect(settle?.params[2]).toBeNull();
    expect(statements.some((entry) => entry.sql.includes('insert into retrieval_chunks'))).toBe(
      false,
    );
  });

  it('a schema-absent database refuses any statement naming the chat file tables', async () => {
    const { db } = libraryDb({ asset: LARGE_FILE, schemaAbsent: true });
    await expect(db.query('select 1 from public.chat_file_preparations')).rejects.toBeInstanceOf(
      ChatFileSchemaReachedError,
    );
  });
});

describe('requestMediaAssetReindex', () => {
  const ASSET_ID = '55555555-5555-4555-8555-555555555555';

  it('resets an existing document to pending only for a live, non-temporary asset of the owner', async () => {
    const query = vi.fn(async () => [{ id: 'doc-1' }]);

    const id = await requestMediaAssetReindex({ query } as never, {
      assetId: ASSET_ID,
      ownerUserId: 'user-1',
    });

    expect(id).toBe('doc-1');
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("then 'stale' else 'pending'");
    expect(sql).toContain('not a.temporary_chat');
    expect(sql).toContain('a.deleted_at is null');
    expect(params).toEqual([ASSET_ID, 'user-1']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('creates the library_file document when the asset has none', async () => {
    const query = vi
      .fn<(sql: string, params: unknown[]) => Promise<Array<{ id: string }>>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'doc-2' }]);

    const id = await requestMediaAssetReindex({ query } as never, {
      assetId: ASSET_ID,
      ownerUserId: 'user-1',
    });

    expect(id).toBe('doc-2');
    const [sql, params] = query.mock.calls[1]!;
    expect(sql).toContain("'library_file'");
    expect(sql).toContain('not a.temporary_chat');
    expect(sql).toContain('on conflict (source_kind, source_id)');
    expect(params).toEqual([ASSET_ID, 'user-1']);
  });

  it('answers null for an asset that is gone, temporary or not the owner', async () => {
    const query = vi.fn(async () => []);
    expect(
      await requestMediaAssetReindex({ query } as never, {
        assetId: ASSET_ID,
        ownerUserId: 'user-2',
      }),
    ).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS } from '@agiworkforce/cloud-contracts';
import type { PublishedArtifactRow } from './published-artifact-service';

vi.mock('server-only', () => ({}));

const {
  PUBLISHED_TOKEN_REGEX,
  buildPublishedArtifactUrl,
  getPublishedArtifactByToken,
  isPublishableKind,
  listPublishedArtifacts,
  renamePublishedArtifact,
  mintPublishToken,
  publishArtifactRecord,
  readPublishedArtifactRestoreSource,
  restorePublishedArtifactRecord,
  requiresSandboxedRender,
  unpublishArtifactRecord,
  unpublishArtifactsForConversations,
  MAX_PUBLISHED_PER_USER,
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
} = await import('./published-artifact-service');

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
}

function makeDb(rows: unknown[] = []): FakeDb {
  const db = {
    query: vi.fn(async (_sql: unknown, _params?: unknown[]) => rows),
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(async (callback: (tx: FakeDb) => Promise<unknown>) => {
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const history = historyRows(String(sql), params);
      if (history !== null) return history;
      if (String(sql).includes('as other_published')) {
        return [{ other_published: 0, owned_conversations: 1 }];
      }
      if (isInsert(sql) || String(sql).includes('set title = case')) return rows;
      throw new Error(`Unexpected transaction SQL: ${String(sql)}`);
    });
    try {
      return await callback(db);
    } finally {
      db.query.mockImplementation(original);
    }
  });
  return db;
}

function historyRows(sql: string, params: unknown[]): unknown[] | null {
  if (
    sql.includes('from public.published_artifact_versions') &&
    sql.includes('order by version desc')
  ) return [];
  if (sql.includes('insert into public.published_artifact_versions')) {
    return [{ version: params[2] }];
  }
  if (sql.includes('set version = $2')) {
    return [{ id: params[0], user_id: params[2], version: params[1] }];
  }
  return null;
}

const INSERT_SQL = 'insert into public.published_artifacts';

function isInsert(sql: unknown): boolean {
  return String(sql).includes(INSERT_SQL);
}

function insertCall(db: FakeDb): [string, unknown[]] {
  const call = db.query.mock.calls.find(([sql]) => isInsert(sql));
  if (!call) throw new Error('publishArtifactRecord never issued the insert');
  return call as [string, unknown[]];
}

function makeRoutedDb(options: {
  otherPublished?: number | string;
  ownedConversations?: number | string;
  insertRows?: unknown[];
  insertError?: unknown;
}): FakeDb {
  const db = {
    transaction: vi.fn(),
    query: vi.fn(async (sql: unknown, params: unknown[] = []) => {
      const history = historyRows(String(sql), params);
      if (history !== null) return history;
      if (isInsert(sql)) {
        if (options.insertError) throw options.insertError;
        return options.insertRows ?? [row()];
      }
      if (!String(sql).includes('as other_published')) {
        throw new Error(`Unexpected publish SQL: ${String(sql)}`);
      }
      return [
        {
          other_published: options.otherPublished ?? 0,
          owned_conversations: options.ownedConversations ?? 0,
        },
      ];
    }),
  };
  db.transaction.mockImplementation(
    async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  );
  return db;
}

function row(overrides: Partial<PublishedArtifactRow> = {}): PublishedArtifactRow {
  return {
    id: 'row-1',
    token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title: 'Dashboard',
    kind: 'html',
    language: null,
    content: '<h1>hi</h1>',
    visibility: 'public',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('token minting', () => {
  it('mints a 24-char base64url token the routes and page will accept', () => {
    for (let i = 0; i < 25; i++) {
      expect(PUBLISHED_TOKEN_REGEX.test(mintPublishToken())).toBe(true);
    }
  });

  it('never derives the token from anything an artifact reader can see', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => mintPublishToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('kind policy', () => {
  it('accepts exactly the kinds the public page can render', () => {
    for (const kind of ['html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code']) {
      expect(isPublishableKind(kind)).toBe(true);
    }
    for (const kind of ['pdf', 'docx', 'image', 'spreadsheet', 'presentation', 'email', '']) {
      expect(isPublishableKind(kind)).toBe(false);
    }
  });

  it('marks every script-executing kind as sandbox-only', () => {
    expect(requiresSandboxedRender('html')).toBe(true);
    expect(requiresSandboxedRender('react')).toBe(true);
    expect(requiresSandboxedRender('mermaid')).toBe(true);
    expect(requiresSandboxedRender('svg')).toBe(false);
    expect(requiresSandboxedRender('markdown')).toBe(false);
    expect(requiresSandboxedRender('code')).toBe(false);
  });
});

describe('publishArtifactRecord', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = makeDb([row()]);
  });

  it('persists the artifact and returns the minted token', async () => {
    const published = await publishArtifactRecord(db as never, {
      userId: 'user-1',
      artifactId: 'artifact-1',
      title: 'Dashboard',
      kind: 'html',
      content: '<h1>hi</h1>',
    });

    expect(published.token).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    const [sql, params] = insertCall(db);
    expect(sql).toContain('insert into public.published_artifacts');
    expect(PUBLISHED_TOKEN_REGEX.test((params as unknown[])[0] as string)).toBe(true);
    expect((params as unknown[])[1]).toBe('user-1');
  });

  it('upserts on (user_id, artifact_id) so republish keeps one live URL', async () => {
    await publishArtifactRecord(db as never, {
      userId: 'user-1',
      artifactId: 'artifact-1',
      title: 'Dashboard',
      kind: 'html',
      content: '<h1>hi</h1>',
    });
    const [sql] = insertCall(db);
    expect(sql).toContain('on conflict (user_id, artifact_id) do update set');
    expect(sql).not.toMatch(/do update set[\s\S]*token = excluded\.token/);
  });

  it('keeps a name the publisher gave the page when the artifact is republished', async () => {
    await publishArtifactRecord(db as never, {
      userId: 'user-1',
      artifactId: 'artifact-1',
      title: 'Dashboard v2',
      kind: 'html',
      content: '<h1>hi</h1>',
    });
    const [sql] = insertCall(db);
    expect(sql).toMatch(
      /title = case when published_artifacts\.title = '' then excluded\.title\s+else published_artifacts\.title end/,
    );
  });

  it('refuses kinds with no public renderer before touching the database', async () => {
    await expect(
      publishArtifactRecord(db as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Report',
        kind: 'pdf',
        content: 'data:application/pdf;base64,AAAA',
      }),
    ).rejects.toBeInstanceOf(PublishedArtifactValidationError);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects empty content instead of publishing a blank page', async () => {
    await expect(
      publishArtifactRecord(db as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Empty',
        kind: 'code',
        content: '   ',
      }),
    ).rejects.toThrow(/content is required/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects oversize content rather than truncating it into a broken page', async () => {
    await expect(
      publishArtifactRecord(db as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Huge',
        kind: 'code',
        content: 'x'.repeat(1_000_001),
      }),
    ).rejects.toThrow(/exceeds/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses another users conversation before the insert, not after RLS raises', async () => {
    const foreign = makeRoutedDb({ ownedConversations: 0 });
    await expect(
      publishArtifactRecord(foreign as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        conversationId: '11111111-1111-4111-8111-111111111111',
        title: 'Someone elses chat',
        kind: 'html',
        content: '<h1>hi</h1>',
      }),
    ).rejects.toBeInstanceOf(PublishedArtifactOwnershipError);
    expect(foreign.query.mock.calls.some(([sql]) => isInsert(sql))).toBe(false);
  });

  it('checks ownership against the callers own user id and the given conversation', async () => {
    const owned = makeRoutedDb({ ownedConversations: 1 });
    await publishArtifactRecord(owned as never, {
      userId: 'user-1',
      artifactId: 'artifact-1',
      conversationId: '11111111-1111-4111-8111-111111111111',
      title: 'Dashboard',
      kind: 'html',
      content: '<h1>hi</h1>',
    });
    const [sql, params] = owned.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain('public.web_conversations');
    expect(params).toEqual(['user-1', 'artifact-1', '11111111-1111-4111-8111-111111111111']);
    expect(owned.query.mock.calls.some(([s]) => isInsert(s))).toBe(true);
  });

  it('never asks about conversation ownership when no conversation was given', async () => {
    const anonymous = makeRoutedDb({ ownedConversations: 0 });
    await publishArtifactRecord(anonymous as never, {
      userId: 'user-1',
      artifactId: 'artifact-1',
      title: 'Dashboard',
      kind: 'html',
      content: '<h1>hi</h1>',
    });
    expect(anonymous.query.mock.calls.some(([sql]) => isInsert(sql))).toBe(true);
  });

  it('bounds how many pages one user can leave published', async () => {
    const full = makeRoutedDb({ otherPublished: MAX_PUBLISHED_PER_USER });
    await expect(
      publishArtifactRecord(full as never, {
        userId: 'user-1',
        artifactId: 'artifact-999',
        title: 'One too many',
        kind: 'code',
        content: 'print(1)',
      }),
    ).rejects.toBeInstanceOf(PublishedArtifactQuotaError);
    expect(full.query.mock.calls.some(([sql]) => isInsert(sql))).toBe(false);
  });

  it('excludes the artifact being republished from the quota count', async () => {
    const atCap = makeRoutedDb({ otherPublished: MAX_PUBLISHED_PER_USER - 1 });
    await expect(
      publishArtifactRecord(atCap as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Dashboard',
        kind: 'html',
        content: '<h1>hi</h1>',
      }),
    ).resolves.toMatchObject({ token: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    const [sql] = atCap.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain('artifact_id <> $2');
  });

  it('turns a racing RLS denial into an ownership refusal, not an unhandled 500', async () => {
    const denied = makeRoutedDb({
      ownedConversations: 1,
      insertError: Object.assign(
        new Error('new row violates row-level security policy for table "published_artifacts"'),
        { code: '42501' },
      ),
    });
    await expect(
      publishArtifactRecord(denied as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        conversationId: '11111111-1111-4111-8111-111111111111',
        title: 'Dashboard',
        kind: 'html',
        content: '<h1>hi</h1>',
      }),
    ).rejects.toBeInstanceOf(PublishedArtifactOwnershipError);
  });

  it('still surfaces a missing-table error so the route can answer 503', async () => {
    const missing = makeRoutedDb({
      insertError: Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    });
    await expect(
      publishArtifactRecord(missing as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Dashboard',
        kind: 'html',
        content: '<h1>hi</h1>',
      }),
    ).rejects.toMatchObject({ code: '42P01' });
  });

  it('reports an RLS-denied write instead of claiming success', async () => {
    const denied = makeDb([]);
    await expect(
      publishArtifactRecord(denied as never, {
        userId: 'user-1',
        artifactId: 'artifact-1',
        title: 'Dashboard',
        kind: 'html',
        content: '<h1>hi</h1>',
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('unpublishArtifactRecord', () => {
  it('scopes the delete to the owner and reports the row it removed', async () => {
    const db = makeDb([{ token: 'aaaaaaaaaaaaaaaaaaaaaaaa' }]);
    const ok = await unpublishArtifactRecord(db as never, {
      userId: 'user-1',
      token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(ok).toBe(true);
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain('where token = $1 and user_id = $2');
    expect(params).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa', 'user-1']);
  });

  it('returns false, never a throw, when nothing matched', async () => {
    const db = makeDb([]);
    expect(
      await unpublishArtifactRecord(db as never, {
        userId: 'user-1',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toBe(false);
  });

  it('never queries for a malformed token', async () => {
    const db = makeDb([]);
    expect(await unpublishArtifactRecord(db as never, { userId: 'user-1', token: 'nope' })).toBe(
      false,
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listPublishedArtifacts', () => {
  it('never selects the artifact bodies', async () => {
    const db = makeDb([]);
    await listPublishedArtifacts(db as never, { userId: 'user-1' });
    const [sql] = db.query.mock.calls[0]!;
    expect(sql).toContain('length(content) as content_chars');
    expect(sql).not.toMatch(/select[\s\S]*\bcontent,/);
  });

  it('scopes the list to the caller and reports a real byte size', async () => {
    const db = makeDb([
      {
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        artifact_id: 'artifact-1',
        title: 'Dashboard',
        kind: 'html',
        language: null,
        content_chars: '2048',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ]);
    const [entry] = await listPublishedArtifacts(db as never, { userId: 'user-1' });
    expect(db.query.mock.calls[0]![1]).toEqual(['user-1', 200]);
    expect(entry).toMatchObject({ token: 'aaaaaaaaaaaaaaaaaaaaaaaa', contentChars: 2048 });
  });
});

describe('renamePublishedArtifact', () => {
  it('renames only a row the caller owns', async () => {
    const db = makeDb([row({ title: 'Scoreboard' })]);
    const renamed = await renamePublishedArtifact(db as never, {
      userId: 'user-1',
      token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: '  Scoreboard  ',
    });
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain('where token = $1 and user_id = $2');
    expect(params).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa', 'user-1', 'Scoreboard']);
    expect(renamed?.title).toBe('Scoreboard');
  });

  it('answers null for a foreign or malformed token and an empty name', async () => {
    const db = makeDb([]);
    expect(
      await renamePublishedArtifact(db as never, {
        userId: 'user-1',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        title: 'Mine',
      }),
    ).toBeNull();
    expect(
      await renamePublishedArtifact(db as never, { userId: 'user-1', token: 'bad', title: 'x' }),
    ).toBeNull();
    expect(
      await renamePublishedArtifact(db as never, {
        userId: 'user-1',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        title: '   ',
      }),
    ).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('getPublishedArtifactByToken', () => {
  it('reads the row for a well-formed token', async () => {
    const db = makeDb([row()]);
    const artifact = await getPublishedArtifactByToken(db as never, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(artifact?.content).toBe('<h1>hi</h1>');
  });

  it('never queries for a malformed token', async () => {
    const db = makeDb([row()]);
    expect(await getPublishedArtifactByToken(db as never, '../../etc/passwd')).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('downgrades an unknown kind to inert text rather than a scripted branch', async () => {
    const db = makeDb([row({ kind: 'something-new' })]);
    const artifact = await getPublishedArtifactByToken(db as never, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(artifact?.kind).toBe('text');
    expect(requiresSandboxedRender(artifact!.kind)).toBe(false);
  });
});

describe('buildPublishedArtifactUrl', () => {
  it('points at the public serving page', () => {
    expect(buildPublishedArtifactUrl('aaaaaaaaaaaaaaaaaaaaaaaa')).toContain(
      '/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });
});

describe('unpublishArtifactsForConversations', () => {
  it('revokes every page published out of the given conversations, scoped to the owner', async () => {
    const db = makeDb([{ token: 'a'.repeat(24) }, { token: 'b'.repeat(24) }]);

    const revoked = await unpublishArtifactsForConversations(db as never, {
      userId: 'user-1',
      conversationIds: ['conversation-1', 'conversation-2'],
    });

    expect(revoked).toEqual(['a'.repeat(24), 'b'.repeat(24)]);
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain('delete from public.published_artifacts');
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('conversation_id = any($2::uuid[])');
    expect(params).toEqual(['user-1', ['conversation-1', 'conversation-2']]);
  });

  it('deduplicates ids and never issues a query for an empty or unowned request', async () => {
    const db = makeDb([]);

    await unpublishArtifactsForConversations(db as never, {
      userId: 'user-1',
      conversationIds: ['conversation-1', 'conversation-1'],
    });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', ['conversation-1']]);

    db.query.mockClear();
    expect(
      await unpublishArtifactsForConversations(db as never, { userId: '', conversationIds: ['c'] }),
    ).toEqual([]);
    expect(
      await unpublishArtifactsForConversations(db as never, {
        userId: 'user-1',
        conversationIds: [],
      }),
    ).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// This adapter models predicate-bound reads/writes, not PostgreSQL locks, triggers or RLS.
describe('Restore persistence without republication', () => {
  const restoreInput = {
    userId: 'user-1',
    publishedArtifactId: 'row-1',
    artifactId: 'artifact-1',
    token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Historical title',
    kind: 'code',
    language: 'typescript',
    content: 'const restored = true;',
  };
  const sourceInput = { userId: 'user-1', token: restoreInput.token, version: 2 };

  function model(
    options: {
      publication?: PublishedArtifactRow | null;
      snapshot?: Record<string, unknown> | null;
      beforeUpdate?: () => void;
      otherPublished?: number;
      ownedConversations?: number;
      updateError?: unknown;
    } = {},
  ) {
    let publication =
      options.publication === undefined ? row({ visibility: 'invited' }) : options.publication;
    const snapshot =
      options.snapshot === undefined
        ? {
            published_artifact_id: 'row-1',
            user_id: 'user-1',
            version: 2,
            title: 'Historical title',
            kind: 'code',
            language: 'typescript',
            content: 'const historical = true;',
          }
        : options.snapshot;
    const grants = [{ publicationId: 'row-1', recipient: 'reader-1' }];
    const storage = [{ publicationId: 'row-1', key: 'existing-storage' }];
    const db = {
      transaction: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[]) => {
        const history = historyRows(sql, params);
        if (history !== null) return history;
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('select') && normalized.includes('as other_published')) {
          expect(normalized).toContain('where user_id = $1 and artifact_id <> $2');
          expect(normalized).toContain('where id = $3::uuid and user_id = $1 and deleted_at is null');
          return [{
            other_published: options.otherPublished ?? 0,
            owned_conversations: options.ownedConversations ?? 1,
          }];
        }
        if (
          normalized.startsWith('select') &&
          normalized.includes('snapshot.version as snapshot_version')
        ) {
          expect(normalized).toContain(
            'join public.published_artifact_versions snapshot on ' +
              'snapshot.published_artifact_id = publication.id and snapshot.user_id = $2',
          );
          expect(normalized).toContain(
            'where publication.token = $1 and publication.user_id = $2 and snapshot.version = $3',
          );
          if (
            !publication || !snapshot ||
            publication.token !== params[0] || publication.user_id !== params[1] ||
            snapshot['published_artifact_id'] !== publication.id ||
            snapshot['user_id'] !== params[1] || snapshot['version'] !== params[2]
          ) return [];
          return [{
            ...publication,
            snapshot_version: String(snapshot['version']),
            snapshot_title: snapshot['title'],
            snapshot_kind: snapshot['kind'],
            snapshot_language: snapshot['language'],
            snapshot_content: snapshot['content'],
          }];
        }
        if (normalized.startsWith('update public.published_artifacts')) {
          expect(normalized).toContain(
            'where user_id = $1 and id = $2 and artifact_id = $3 and token = $4',
          );
          expect(normalized.split(' where ')[0]).toBe(
            "update public.published_artifacts set title = case when title = '' then $5 else title end, " +
              'kind = $6, language = $7, content = $8, updated_at = now()',
          );
          options.beforeUpdate?.();
          if (options.updateError) throw options.updateError;
          if (
            !publication || publication.user_id !== params[0] || publication.id !== params[1] ||
            publication.artifact_id !== params[2] || publication.token !== params[3]
          ) return [];
          publication = {
            ...publication,
            title: publication.title === '' ? String(params[4]) : publication.title,
            kind: String(params[5]),
            language: params[6] === null ? null : String(params[6]),
            content: String(params[7]),
            updated_at: '2026-11-07T00:00:00.000Z',
          };
          return [publication];
        }
        throw new Error(`Unexpected Restore SQL: ${normalized}`);
      }),
    };
    db.transaction.mockImplementation(
      async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    );
    return {
      db,
      grants,
      storage,
      current: () => publication,
      replace: (next: PublishedArtifactRow | null) => { publication = next; },
    };
  }

  it('reads the current owner publication and historical snapshot through one bound join', async () => {
    const state = model();
    const source = await readPublishedArtifactRestoreSource(state.db as never, {
      ...sourceInput,
      userId: ' user-1 ',
      token: ` ${sourceInput.token} `,
    });
    expect(source).toMatchObject({
      publication: {
        id: 'row-1', title: 'Dashboard', visibility: 'invited', content: '<h1>hi</h1>',
      },
      snapshot: {
        version: 2, title: 'Historical title', kind: 'code',
        language: 'typescript', content: 'const historical = true;',
      },
    });
    expect(state.db.query).toHaveBeenCalledTimes(1);
    expect(state.db.query.mock.calls[0]?.[1]).toEqual([sourceInput.token, 'user-1', 2]);
  });

  it.each([
    { userId: '' },
    { token: 'bad' },
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: NaN },
    { version: Infinity },
    { version: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid source identity/version without querying: %j', async (change) => {
    const state = model();
    expect(
      await readPublishedArtifactRestoreSource(state.db as never, { ...sourceInput, ...change }),
    ).toBeNull();
    expect(state.db.query).not.toHaveBeenCalled();
  });

  it.each([
    { publication: null },
    { publication: row({ user_id: 'other-user' }) },
    { publication: row({ token: 'bbbbbbbbbbbbbbbbbbbbbbbb' }) },
    { publication: row({ id: 'replacement-publication' }) },
    { snapshot: null },
    { snapshot: { published_artifact_id: 'row-1', user_id: 'other-user', version: 2 } },
    { snapshot: { published_artifact_id: 'other-publication', user_id: 'user-1', version: 2 } },
    { snapshot: { published_artifact_id: 'row-1', user_id: 'user-1', version: 3 } },
  ])('does not join missing, replaced, foreign or wrong-version sources: %j', async (options) => {
    const state = model(options);
    expect(await readPublishedArtifactRestoreSource(state.db as never, sourceInput)).toBeNull();
    expect(state.db.query).toHaveBeenCalledTimes(1);
  });

  it.each(['public', 'organization', 'invited'])('preserves %s metadata with content-only SQL', async (visibility) => {
    const original = row({ visibility, conversation_id: '11111111-1111-4111-8111-111111111111' });
    const state = model({ publication: original });
    const restored = await restorePublishedArtifactRecord(state.db as never, {
      ...restoreInput,
      conversationId: original.conversation_id,
    });
    expect(restored).toMatchObject({
      id: original.id,
      token: original.token,
      userId: original.user_id,
      artifactId: original.artifact_id,
      conversationId: original.conversation_id,
      title: original.title,
      visibility,
      createdAt: original.created_at,
      kind: 'code',
      language: 'typescript',
      content: restoreInput.content,
    });
    expect(restored?.updatedAt).not.toBe(original.updated_at);
    expect(state.grants).toEqual([{ publicationId: 'row-1', recipient: 'reader-1' }]);
    expect(state.storage).toEqual([{ publicationId: 'row-1', key: 'existing-storage' }]);
    expect(state.db.query).toHaveBeenCalledTimes(5);
    expect(state.db.query.mock.calls[1]?.[1]).toEqual([
      'user-1', 'row-1', 'artifact-1', restoreInput.token,
      restoreInput.title, 'code', 'typescript', restoreInput.content,
    ]);
  });

  it('fills an empty current title using prepared input but never overwrites conversation provenance', async () => {
    const state = model({
      publication: row({ title: '', conversation_id: 'original-conversation' }),
    });
    const result = await restorePublishedArtifactRecord(state.db as never, {
      ...restoreInput,
      userId: ' user-1 ',
      artifactId: ' artifact-1 ',
      conversationId: null,
    });
    expect(result).toMatchObject({
      title: restoreInput.title,
      conversationId: 'original-conversation',
    });
    expect(state.db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'artifact-1', null]);
  });

  it.each([
    null,
    row({ id: 'replacement-publication', token: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
    row({ id: 'replacement-publication' }),
    row({ user_id: 'other-user' }),
    row({ artifact_id: 'other-artifact' }),
    row({ token: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
  ])('refuses a deleted/replaced/mismatched row at write time: %j', async (replacement) => {
    const state = model({ beforeUpdate: () => state.replace(replacement) });
    const source = await readPublishedArtifactRestoreSource(state.db as never, sourceInput);
    expect(source?.publication.id).toBe('row-1');
    expect(await restorePublishedArtifactRecord(state.db as never, restoreInput)).toBeNull();
    expect(state.current()).toEqual(replacement);
    expect(state.db.query).toHaveBeenCalledTimes(3);
  });

  it('returns null when the publication is already absent', async () => {
    const state = model({ publication: null });
    expect(await restorePublishedArtifactRecord(state.db as never, restoreInput)).toBeNull();
    expect(state.current()).toBeNull();
  });

  it('cannot resurrect a row on retry after UPDATE followed by a modeled deletion', async () => {
    const state = model();
    await expect(
      restorePublishedArtifactRecord(state.db as never, restoreInput),
    ).resolves.toMatchObject({ id: 'row-1', content: restoreInput.content });
    state.replace(null);
    expect(await restorePublishedArtifactRecord(state.db as never, restoreInput)).toBeNull();
    expect(state.current()).toBeNull();
    expect(state.db.query).toHaveBeenCalledTimes(7);
  });

  it.each([{ publishedArtifactId: '' }, { token: 'bad' }])('rejects malformed identity: %j', async (change) => {
    const state = model();
    expect(
      await restorePublishedArtifactRecord(state.db as never, { ...restoreInput, ...change }),
    ).toBeNull();
    expect(state.db.query).not.toHaveBeenCalled();
  });

  it.each([
    { userId: '' },
    { artifactId: '' },
    { artifactId: 'x'.repeat(201) },
    { kind: 'pdf' },
    { content: '   ' },
    { content: 'x'.repeat(1_000_001) },
  ])('retains shared validation before touching persistence (case %#)', async (change) => {
    const state = model();
    await expect(
      restorePublishedArtifactRecord(state.db as never, { ...restoreInput, ...change }),
    ).rejects.toBeInstanceOf(PublishedArtifactValidationError);
    expect(state.db.query).not.toHaveBeenCalled();
  });

  it('retains quota refusal without any mutation', async () => {
    const state = model({ otherPublished: MAX_PUBLISHED_PER_USER });
    await expect(
      restorePublishedArtifactRecord(state.db as never, restoreInput),
    ).rejects.toBeInstanceOf(PublishedArtifactQuotaError);
    expect(state.db.query).toHaveBeenCalledTimes(1);
    expect(state.current()?.content).toBe('<h1>hi</h1>');
  });

  it('excludes its own artifact from the quota at capacity', async () => {
    const state = model({ otherPublished: MAX_PUBLISHED_PER_USER - 1 });
    await expect(
      restorePublishedArtifactRecord(state.db as never, restoreInput),
    ).resolves.toMatchObject({ id: 'row-1' });
    expect(state.db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'artifact-1', null]);
  });

  it('rejects a deleted or foreign conversation before updating', async () => {
    const state = model({ ownedConversations: 0 });
    await expect(
      restorePublishedArtifactRecord(state.db as never, {
        ...restoreInput,
        conversationId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toBeInstanceOf(PublishedArtifactOwnershipError);
    expect(state.db.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: '42501' },
    { cause: { code: '42501' } },
    { cause: { cause: { code: '42501' } } },
  ])('maps an adapter RLS error to an ownership refusal: %j', async (updateError) => {
    const state = model({ updateError });
    await expect(
      restorePublishedArtifactRecord(state.db as never, restoreInput),
    ).rejects.toBeInstanceOf(PublishedArtifactOwnershipError);
    expect(state.current()?.content).toBe('<h1>hi</h1>');
  });

  it('preserves infrastructure errors for the route instead of reporting a successful restore', async () => {
    const updateError = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const state = model({ updateError });
    await expect(
      restorePublishedArtifactRecord(state.db as never, restoreInput),
    ).rejects.toBe(updateError);
  });
});

describe('Restore prepared payload', () => {
  it('bounds title and language while passing the prepared sanitized body unchanged', async () => {
    const db = makeDb([row()]);
    const content = '<h1>Sanitized historical content</h1>';
    await restorePublishedArtifactRecord(db as never, {
      userId: ' user-1 ',
      artifactId: ' artifact-1 ',
      publishedArtifactId: 'row-1',
      token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 't'.repeat(MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS + 1),
      kind: 'html',
      language: 'l'.repeat(51),
      content,
    });
    expect(db.query.mock.calls[1]?.[1]).toEqual([
      'user-1',
      'row-1',
      'artifact-1',
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      't'.repeat(MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS),
      'html',
      'l'.repeat(50),
      content,
    ]);
  });
});

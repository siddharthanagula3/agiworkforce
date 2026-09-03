import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  PUBLISHED_TOKEN_REGEX,
  buildPublishedArtifactUrl,
  getPublishedArtifactByToken,
  isPublishableKind,
  listPublishedArtifacts,
  mintPublishToken,
  publishArtifactRecord,
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
}

function makeDb(rows: unknown[] = []): FakeDb {
  return { query: vi.fn(async () => rows) };
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
  return {
    query: vi.fn(async (sql: unknown) => {
      if (isInsert(sql)) {
        if (options.insertError) throw options.insertError;
        return options.insertRows ?? [row()];
      }
      return [
        {
          other_published: options.otherPublished ?? 0,
          owned_conversations: options.ownedConversations ?? 0,
        },
      ];
    }),
  };
}

function row(overrides: Record<string, unknown> = {}) {
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

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
  PublishedArtifactValidationError,
} = await import('./published-artifact-service');

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
}

function makeDb(rows: unknown[] = []): FakeDb {
  return { query: vi.fn(async () => rows) };
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
    const [sql, params] = db.query.mock.calls[0]!;
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
    const [sql] = db.query.mock.calls[0]!;
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

  it('returns false — never a throw — when nothing matched', async () => {
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

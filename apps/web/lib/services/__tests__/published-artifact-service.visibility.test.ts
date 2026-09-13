import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getPublishedArtifactByToken,
  isPublishedArtifactVisibility,
  listPublishedArtifacts,
  setPublishedArtifactVisibility,
} from '../published-artifact-service';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return handler(sql, params);
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as never, issued };
}

function row(visibility = 'public') {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title: 'Plan',
    kind: 'markdown',
    language: null,
    content: '# plan',
    visibility,
    created_at: '2026-09-13T00:00:00.000Z',
    updated_at: '2026-09-13T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the anonymous token read', () => {
  it('asks the database for public rows only, so a workspace artifact never serves on the token', async () => {
    const { db, issued } = makeDb(() => [row()]);

    const artifact = await getPublishedArtifactByToken(db, TOKEN);

    expect(artifact?.visibility).toBe('public');
    expect(issued[0]?.sql).toContain("visibility = 'public'");
  });

  it('returns null when the predicate matched nothing', async () => {
    const { db } = makeDb(() => []);
    await expect(getPublishedArtifactByToken(db, TOKEN)).resolves.toBeNull();
  });
});

describe('setPublishedArtifactVisibility', () => {
  it('binds the owner and changes nothing but the audience', async () => {
    const { db, issued } = makeDb(() => [row('organization')]);

    const updated = await setPublishedArtifactVisibility(db, {
      userId: 'user-1',
      token: TOKEN,
      visibility: 'organization',
    });

    expect(updated?.visibility).toBe('organization');
    expect(updated?.token).toBe(TOKEN);
    expect(issued[0]?.sql).toContain('where token = $1 and user_id = $2');
    expect(issued[0]?.sql).not.toMatch(/set[\s\S]*content =/i);
    expect(issued[0]?.params).toEqual([TOKEN, 'user-1', 'organization']);
  });

  it('refuses a malformed token without touching the database', async () => {
    const { db, issued } = makeDb(() => []);
    await expect(
      setPublishedArtifactVisibility(db, { userId: 'user-1', token: 'nope', visibility: 'public' }),
    ).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });
});

describe('the management list', () => {
  it('carries the audience so the owner can see which pages are public', async () => {
    const { db, issued } = makeDb(() => [
      {
        token: TOKEN,
        artifact_id: 'artifact-1',
        title: 'Plan',
        kind: 'markdown',
        language: null,
        content_chars: 6,
        visibility: 'organization',
        created_at: '2026-09-13T00:00:00.000Z',
        updated_at: '2026-09-13T00:00:00.000Z',
      },
    ]);

    const [summary] = await listPublishedArtifacts(db, { userId: 'user-1' });

    expect(summary?.visibility).toBe('organization');
    expect(issued[0]?.sql).toContain('visibility');
  });
});

describe('isPublishedArtifactVisibility', () => {
  it('admits the two modelled audiences and nothing else', () => {
    expect(isPublishedArtifactVisibility('public')).toBe(true);
    expect(isPublishedArtifactVisibility('organization')).toBe(true);
    expect(isPublishedArtifactVisibility('unlisted')).toBe(false);
    expect(isPublishedArtifactVisibility(null)).toBe(false);
  });
});

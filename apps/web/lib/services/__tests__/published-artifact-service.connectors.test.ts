import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  publicationUsesConnectors,
  publishArtifactRecord,
  publishedArtifactAllowsConnectors,
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
  };
  return { db: db as never, issued };
}

function publishedRow(visibility: string) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: '44444444-4444-4444-8444-444444444444',
    conversation_id: null,
    title: 'Pipeline',
    kind: 'html',
    language: null,
    content: '<p>pipeline</p>',
    visibility,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a first publish of an artifact with a connector binding', () => {
  it('opens to invited people only, never to anyone with the link', async () => {
    const { db, issued } = makeDb((sql) =>
      sql.includes('insert into public.published_artifacts')
        ? [publishedRow('invited')]
        : [{ other_published: 0, owned_conversations: 0 }],
    );

    const published = await publishArtifactRecord(db, {
      userId: 'user-1',
      artifactId: '44444444-4444-4444-8444-444444444444',
      title: 'Pipeline',
      kind: 'html',
      content: '<p>pipeline</p>',
    });

    const insert = issued.find((entry) =>
      entry.sql.includes('insert into public.published_artifacts'),
    );
    expect(insert?.sql).toMatch(/from public\.live_artifacts live/);
    expect(insert?.sql).toMatch(/live\.user_id = \$2 and live\.artifact_id::text = lower\(\$3\)/);
    expect(insert?.sql).toMatch(/then 'invited' else 'public' end/);
    expect(insert?.sql).not.toMatch(/visibility = excluded\.visibility/);
    expect(published.visibility).toBe('invited');
  });
});

describe('publicationUsesConnectors', () => {
  it('joins the caller’s own publication to the caller’s own live binding', async () => {
    const { db, issued } = makeDb(() => [{ uses_connectors: true }]);

    await expect(publicationUsesConnectors(db, { userId: 'user-1', token: TOKEN })).resolves.toBe(
      true,
    );
    expect(issued[0]?.sql).toMatch(/live\.user_id = publication\.user_id/);
    expect(issued[0]?.sql).toMatch(/live\.artifact_id::text = lower\(publication\.artifact_id\)/);
    expect(issued[0]?.sql).toMatch(/publication\.token = \$1 and publication\.user_id = \$2/);
    expect(issued[0]?.params).toEqual([TOKEN, 'user-1']);
  });

  it('answers false for an artifact without a binding', async () => {
    const { db } = makeDb(() => [{ uses_connectors: false }]);

    await expect(publicationUsesConnectors(db, { userId: 'user-1', token: TOKEN })).resolves.toBe(
      false,
    );
  });

  it('never queries for a malformed token', async () => {
    const { db, issued } = makeDb(() => [{ uses_connectors: true }]);

    await expect(
      publicationUsesConnectors(db, { userId: 'user-1', token: '../../etc' }),
    ).resolves.toBe(false);
    expect(issued).toHaveLength(0);
  });
});

describe('publishedArtifactAllowsConnectors', () => {
  it('asks the database audience check for the publication', async () => {
    const { db, issued } = makeDb(() => [{ allowed: true }]);

    await expect(publishedArtifactAllowsConnectors(db, 'publication-1')).resolves.toBe(true);
    expect(issued[0]?.sql).toContain('public.app_published_artifact_allows_connectors($1::uuid)');
    expect(issued[0]?.params).toEqual(['publication-1']);
  });

  it.each([[[{ allowed: false }]], [[{ allowed: null }]], [[]]])(
    'answers false for %j',
    async (rows) => {
      const { db } = makeDb(() => rows);

      await expect(publishedArtifactAllowsConnectors(db, 'publication-1')).resolves.toBe(false);
    },
  );
});

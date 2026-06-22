/**
 * /api/settings/sync — TRUST-BOUNDARY enforcement + delta semantics.
 *
 * The load-bearing tests here are the leak guards: no secret namespace and no
 * secret-looking key may ever cross the device boundary, even if a client pushes it.
 * A regression in `filterCloudSafeSettings`/`scrubSecrets` = a credential leak.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

import {
  GET,
  POST,
  filterCloudSafeSettings,
  scrubSecrets,
  CLOUD_SAFE_SETTINGS_NAMESPACES,
  FORBIDDEN_SETTINGS_NAMESPACES,
} from '@/app/api/settings/sync/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([{ server_version: '3' }]);
});

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/settings/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('filterCloudSafeSettings — leak guards', () => {
  it('drops every forbidden namespace (allowlist is fail-closed)', () => {
    const dirty: Record<string, unknown> = {
      appearance: { theme: 'dark' },
    };
    for (const ns of FORBIDDEN_SETTINGS_NAMESPACES) {
      dirty[ns] = { apiKey: 'sk-LEAK', value: 'secret' };
    }
    const safe = filterCloudSafeSettings(dirty);
    expect(safe).toEqual({ appearance: { theme: 'dark' } });
    for (const ns of FORBIDDEN_SETTINGS_NAMESPACES) {
      expect(safe[ns]).toBeUndefined();
    }
  });

  it('never passes an unknown/new namespace (fail-closed default)', () => {
    const safe = filterCloudSafeSettings({ someBrandNewSensitiveNs: { token: 'x' } });
    expect(safe).toEqual({});
  });

  it('scrubs secret-looking keys even inside an allowed namespace', () => {
    const safe = filterCloudSafeSettings({
      personalization: {
        nickname: 'Sid',
        anthropicApiKey: 'sk-ant-LEAK',
        nested: { bearerToken: 'LEAK', tone: 'concise' },
      },
    });
    expect(safe).toEqual({
      personalization: { nickname: 'Sid', nested: { tone: 'concise' } },
    });
  });

  it('only allows the documented cloud-safe namespaces', () => {
    const all: Record<string, unknown> = {};
    for (const ns of CLOUD_SAFE_SETTINGS_NAMESPACES) all[ns] = { ok: true };
    all['byok'] = { key: 'LEAK' };
    expect(Object.keys(filterCloudSafeSettings(all)).sort()).toEqual(
      [...CLOUD_SAFE_SETTINGS_NAMESPACES].sort(),
    );
  });
});

describe('scrubSecrets', () => {
  it('drops api keys/tokens/passwords recursively, keeps the rest', () => {
    expect(
      scrubSecrets({ a: 1, apiKey: 'x', deep: { password: 'y', keep: 2, accessKey: 'z' } }),
    ).toEqual({ a: 1, deep: { keep: 2 } });
  });
});

describe('POST /api/settings/sync — push', () => {
  it('merges only cloud-safe namespaces (jsonb ||) with LWW, forcing user_id', async () => {
    const res = await POST(
      postReq({
        settings: { appearance: { theme: 'dark' }, byok: { anthropic: 'sk-LEAK' } },
        updatedAt: '2026-06-22T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(true);

    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_settings'),
    );
    expect(call).toBeDefined();
    const sql = String(call![0]);
    expect(sql).toContain('user_settings.settings || excluded.settings'); // merge, preserve secrets already stored
    expect(sql).toContain('excluded.updated_at >= user_settings.updated_at'); // LWW
    // The stored JSONB param must NOT contain the byok secret.
    const stored = JSON.parse(String((call![1] as unknown[])[1]));
    expect(stored.byok).toBeUndefined();
    expect(stored.appearance).toEqual({ theme: 'dark' });
    // user_id forced server-side.
    expect((call![1] as unknown[])[0]).toBe('u1');
  });
});

describe('GET /api/settings/sync — pull', () => {
  it('returns only cloud-safe namespaces and never emits secrets', async () => {
    queryMock.mockResolvedValueOnce([
      {
        settings: {
          appearance: { theme: 'dark' },
          byok: { anthropic: 'sk-LEAK' },
          personalization: { nickname: 'Sid', apiKey: 'sk-LEAK2' },
        },
        server_version: '9',
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/settings/sync?since=5'));
    const body = await res.json();
    expect(body.cursor).toBe('9');
    expect(body.settings.byok).toBeUndefined();
    expect(body.settings.personalization).toEqual({ nickname: 'Sid' });
    expect(body.settings.appearance).toEqual({ theme: 'dark' });
  });

  it('returns nothing new when the row server_version is not ahead of the cursor', async () => {
    queryMock.mockResolvedValueOnce([{ settings: { appearance: {} }, server_version: '5' }]);
    const res = await GET(new NextRequest('http://localhost/api/settings/sync?since=5'));
    const body = await res.json();
    expect(body.settings).toEqual({});
    expect(body.cursor).toBe('5');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  auth: vi.fn(),
  withRateLimit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.query(...args) })),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: () => mocks.auth() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms, recordTermsAcceptance } from './terms';
import { POST as acceptTerms } from '@/app/api/terms/accept/route';

function acceptRequest(
  body: unknown = { surface: 'web-signup', version: POLICY_LAST_UPDATED.terms },
): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/terms/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('recordTermsAcceptance', () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it('names the revision of /terms the user was actually shown', () => {
    expect(CURRENT_TERMS_VERSION).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('writes the version, instant and surface against the account', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: '2026-08-08T10:00:00.000Z',
        terms_accepted_surface: 'web-signup',
      },
    ]);

    const acceptance = await recordTermsAcceptance('user_123', 'web-signup');

    expect(acceptance).toEqual({
      version: CURRENT_TERMS_VERSION,
      acceptedAt: '2026-08-08T10:00:00.000Z',
      surface: 'web-signup',
    });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into public\.profiles/i);
    expect(params).toEqual(['user_123', CURRENT_TERMS_VERSION, 'web-signup']);
  });

  it('keeps the first acceptance of a version when the flow is re-entered', async () => {
    // The upsert's conflict predicate suppresses the update for a version
    // already on record, so it returns no row and the stored instant stands.
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: '2026-08-01T09:00:00.000Z',
        terms_accepted_surface: 'web-signup',
      },
    ]);

    const acceptance = await recordTermsAcceptance('user_123', 'web-signup');

    expect(acceptance.acceptedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(mocks.query.mock.calls[1]?.[0]).toMatch(/select terms_version/i);
    // The suppression itself is a database predicate, so it cannot be exercised
    // against a mocked driver — assert the upsert still carries it, or the
    // no-op above would silently become a timestamp rewrite.
    expect(mocks.query.mock.calls[0]?.[0]).toMatch(
      /on conflict \(id\) do update[\s\S]*where public\.profiles\.terms_version is distinct from excluded\.terms_version/i,
    );
  });

  it('fails loudly when the database accepts neither the write nor the read', async () => {
    mocks.query.mockResolvedValue([]);
    await expect(recordTermsAcceptance('user_123', 'web-signup')).rejects.toThrow(
      /neither written nor found/,
    );
  });

  it.each([
    ['missing', [], false],
    [
      'outdated',
      [
        {
          terms_version: '1970-01-01',
          terms_accepted_at: '2026-08-01T09:00:00.000Z',
          terms_accepted_surface: 'web-signup',
        },
      ],
      false,
    ],
    [
      'current',
      [
        {
          terms_version: CURRENT_TERMS_VERSION,
          terms_accepted_at: '2026-08-01T09:00:00.000Z',
          terms_accepted_surface: 'web-signup',
        },
      ],
      true,
    ],
  ] as const)('identifies a %s durable acceptance', async (_label, rows, expected) => {
    mocks.query.mockResolvedValueOnce(rows);
    await expect(hasAcceptedCurrentTerms('user_123')).resolves.toBe(expected);
  });
});

describe('POST /api/terms/accept', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.auth.mockReset();
  });

  it('records the acceptance for the signed-in account', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_abc' });
    mocks.query.mockResolvedValueOnce([
      {
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: '2026-08-08T10:00:00.000Z',
        terms_accepted_surface: 'web-signup',
      },
    ]);

    const response = await acceptTerms(acceptRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: CURRENT_TERMS_VERSION,
      acceptedAt: '2026-08-08T10:00:00.000Z',
    });
    expect((mocks.query.mock.calls[0] as [string, unknown[]])[1]?.[0]).toBe('user_abc');
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
  });

  it('records login acceptance on the distinct login surface', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_abc' });
    mocks.query.mockResolvedValueOnce([
      {
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: '2026-08-08T10:00:00.000Z',
        terms_accepted_surface: 'web-login',
      },
    ]);

    const response = await acceptTerms(
      acceptRequest({ surface: 'web-login', version: POLICY_LAST_UPDATED.terms }),
    );

    expect(response.status).toBe(200);
    expect((mocks.query.mock.calls[0] as [string, unknown[]])[1]).toEqual([
      'user_abc',
      CURRENT_TERMS_VERSION,
      'web-login',
    ]);
  });

  it('refuses to attribute an acceptance to nobody', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await acceptTerms(acceptRequest());

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a surface the clickwrap never collected', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_abc' });

    const response = await acceptTerms(
      acceptRequest({ surface: 'somewhere-else', version: POLICY_LAST_UPDATED.terms }),
    );

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns the current revision when the displayed policy became stale', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_abc' });

    const response = await acceptTerms(
      acceptRequest({ surface: 'web-login', version: '1970-01-01' }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TERMS_VERSION_OUTDATED' },
      currentVersion: CURRENT_TERMS_VERSION,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

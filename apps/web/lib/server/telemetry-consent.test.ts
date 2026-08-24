import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getCurrentUserRlsDb: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentUserRlsDb: mocks.getCurrentUserRlsDb,
}));

import { readServerTelemetryConsent } from './telemetry-consent';

function scopedDb(rows: Array<{ share_telemetry: string | null }>) {
  return { db: { query: mocks.query.mockResolvedValue(rows) }, userId: 'user_1' };
}

// WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01: this is the server-side source
// the root layout renders into the document, so a brand-new device's first
// paint reflects the account's real consent instead of a stale/absent
// localStorage mirror. Every exit fails closed — a telemetry read must never
// default a user into being tracked.
describe('readServerTelemetryConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the account opted in', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue(scopedDb([{ share_telemetry: 'true' }]));

    await expect(readServerTelemetryConsent()).resolves.toBe(true);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(params).toEqual(['user_1']);
  });

  it('returns false when the account explicitly opted out', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue(scopedDb([{ share_telemetry: 'false' }]));

    await expect(readServerTelemetryConsent()).resolves.toBe(false);
  });

  it('returns false when the account has no stored answer', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue(scopedDb([{ share_telemetry: null }]));

    await expect(readServerTelemetryConsent()).resolves.toBe(false);
  });

  it('returns false when the account has no settings row at all', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue(scopedDb([]));

    await expect(readServerTelemetryConsent()).resolves.toBe(false);
  });

  it('returns false when signed out, without querying the database', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue(null);

    await expect(readServerTelemetryConsent()).resolves.toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('fails closed when the database read throws', async () => {
    mocks.getCurrentUserRlsDb.mockResolvedValue({
      db: { query: vi.fn().mockRejectedValue(new Error('connection reset')) },
      userId: 'user_1',
    });

    await expect(readServerTelemetryConsent()).resolves.toBe(false);
  });
});

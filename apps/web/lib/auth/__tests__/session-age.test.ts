import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  isSessionPastAbsoluteLifetime,
  resetSessionStartCache,
  sessionStartedAt,
  unreadableSessionStartCount,
  type SessionAgeOperations,
} from '../session-age';

const DAY_MS = 86_400_000;

function identityWith(getSession: ReturnType<typeof vi.fn>): SessionAgeOperations {
  return { getSession, revokeSession: vi.fn() } as unknown as SessionAgeOperations;
}

describe('session start lookup', () => {
  beforeEach(() => {
    resetSessionStartCache();
  });

  it('measures the age on the next request after a failed lookup', async () => {
    const now = Date.now();
    const getSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue({ userId: 'user-1', createdAt: now - 400 * DAY_MS });
    const identity = identityWith(getSession);

    await expect(isSessionPastAbsoluteLifetime(identity, 'sess-1', 'user-1', now)).resolves.toBe(
      false,
    );
    await expect(isSessionPastAbsoluteLifetime(identity, 'sess-1', 'user-1', now)).resolves.toBe(
      true,
    );
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(unreadableSessionStartCount()).toBe(1);
  });

  it('still looks a readable session up once', async () => {
    const getSession = vi.fn().mockResolvedValue({ userId: 'user-1', createdAt: 1_000 });
    const identity = identityWith(getSession);

    await sessionStartedAt(identity, 'sess-1', 'user-1');
    await sessionStartedAt(identity, 'sess-1', 'user-1');

    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

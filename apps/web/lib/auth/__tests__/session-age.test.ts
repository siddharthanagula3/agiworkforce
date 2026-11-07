import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentitySession } from '@agiworkforce/identity';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  isSessionPastAbsoluteLifetime,
  resetSessionStartCache,
  sessionStartedAt,
  unreadableSessionStartCount,
  type SessionAgeOperations,
} from '../session-age';

const NOW = 1_800_000_000_000;
const HOUR_MS = 3_600_000;
const SUBJECT = 'native-subject';
const SESSION = 'sess-native';

function session(overrides: Partial<IdentitySession> = {}): IdentitySession {
  return {
    id: SESSION,
    userId: SUBJECT,
    status: 'active',
    createdAt: NOW - 60_000,
    lastActiveAt: NOW,
    expireAt: null,
    latestActivity: null,
    ...overrides,
  };
}

function createIdentity() {
  return {
    getSession: vi.fn<SessionAgeOperations['getSession']>(),
    revokeSession: vi.fn<SessionAgeOperations['revokeSession']>(),
  } satisfies SessionAgeOperations;
}

describe('session start lookup', () => {
  beforeEach(() => {
    resetSessionStartCache();
    vi.stubEnv('SESSION_ABSOLUTE_LIFETIME_HOURS', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('measures the age on the next request after a failed lookup', async () => {
    const identity = createIdentity();
    identity.getSession
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue(session({ createdAt: NOW - HOUR_MS }));

    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(true);
    expect(identity.getSession).toHaveBeenCalledTimes(2);
    expect(unreadableSessionStartCount()).toBe(1);
  });

  it.each([
    ['missing session', null],
    ['different session', session({ id: 'sess-foreign' })],
    ['different subject', session({ userId: 'foreign-subject' })],
    ['unknown start', session({ createdAt: null })],
    ['NaN start', session({ createdAt: Number.NaN })],
    ['infinite start', session({ createdAt: Number.POSITIVE_INFINITY })],
    ['negative infinite start', session({ createdAt: Number.NEGATIVE_INFINITY })],
  ] as const)(
    'does not cache a %s or let it hide a later known over-age session',
    async (_label, first) => {
      const identity = createIdentity();
      identity.getSession
        .mockResolvedValueOnce(first)
        .mockResolvedValue(session({ createdAt: NOW - HOUR_MS }));

      await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
      await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(true);
      await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(true);
      expect(identity.getSession).toHaveBeenCalledTimes(2);
      expect(unreadableSessionStartCount()).toBe(1);
    },
  );

  it('caches a verified start while measuring age again on every request', async () => {
    const identity = createIdentity();
    identity.getSession.mockResolvedValue(session({ createdAt: NOW }));

    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
    await expect(
      isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW + HOUR_MS),
    ).resolves.toBe(true);
    expect(identity.getSession).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(unreadableSessionStartCount()).toBe(0);
  });

  it('keeps the same session id separate for different native subjects', async () => {
    const identity = createIdentity();
    identity.getSession
      .mockResolvedValueOnce(session())
      .mockResolvedValue(session({ userId: 'other-native', createdAt: NOW - HOUR_MS }));

    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
    await expect(
      isSessionPastAbsoluteLifetime(identity, SESSION, 'other-native', NOW),
    ).resolves.toBe(true);
    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
    expect(identity.getSession).toHaveBeenCalledTimes(2);
  });

  it('keeps different sessions separate for the same native subject', async () => {
    const identity = createIdentity();
    identity.getSession
      .mockResolvedValueOnce(session())
      .mockResolvedValue(session({ id: 'sess-other', createdAt: NOW - HOUR_MS }));

    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(false);
    await expect(
      isSessionPastAbsoluteLifetime(identity, 'sess-other', SUBJECT, NOW),
    ).resolves.toBe(true);
    expect(identity.getSession.mock.calls).toEqual([[SESSION], ['sess-other']]);
  });

  it('does not reuse a cached age for an unexpected subject or contaminate its owner', async () => {
    const identity = createIdentity();
    identity.getSession.mockResolvedValue(session({ createdAt: NOW - HOUR_MS }));

    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(true);
    await expect(
      isSessionPastAbsoluteLifetime(identity, SESSION, 'foreign-subject', NOW),
    ).resolves.toBe(false);
    await expect(
      isSessionPastAbsoluteLifetime(identity, SESSION, 'foreign-subject', NOW),
    ).resolves.toBe(false);
    await expect(isSessionPastAbsoluteLifetime(identity, SESSION, SUBJECT, NOW)).resolves.toBe(true);
    expect(identity.getSession).toHaveBeenCalledTimes(3);
    expect(unreadableSessionStartCount()).toBe(2);
  });

  it('keeps tuple keys distinct when identifiers contain separators', async () => {
    const identity = createIdentity();
    identity.getSession
      .mockResolvedValueOnce(session({ id: 'c', userId: 'a:b', createdAt: 0 }))
      .mockResolvedValueOnce(session({ id: 'b:c', userId: 'a', createdAt: NOW }));

    await expect(sessionStartedAt(identity, 'c', 'a:b')).resolves.toBe(0);
    await expect(sessionStartedAt(identity, 'b:c', 'a')).resolves.toBe(NOW);
    await expect(sessionStartedAt(identity, 'c', 'a:b')).resolves.toBe(0);
    expect(identity.getSession).toHaveBeenCalledTimes(2);
  });
});

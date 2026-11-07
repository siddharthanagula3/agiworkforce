import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentitySession } from '@agiworkforce/identity';
import type { KeyValueStore } from '@agiworkforce/key-value';

const state = vi.hoisted(() => ({
  getSession: vi.fn<(sessionId: string) => Promise<IdentitySession | null>>(),
  revokeSession: vi.fn<(sessionId: string) => Promise<void>>(),
  set: vi.fn<KeyValueStore['set']>(),
  storeAvailable: true,
  after: vi.fn<(task: Promise<unknown>) => void>(),
  pending: [] as Promise<unknown>[],
  emit: vi.fn(),
  warn: vi.fn(),
  db: { query: vi.fn(), execute: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: state.after }));
vi.mock('@/lib/logger', () => ({ logger: { warn: state.warn } }));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({
    getSession: state.getSession,
    revokeSession: state.revokeSession,
  }),
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => (state.storeAvailable ? { set: state.set } : null),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => state.db }));
vi.mock('@/lib/services/identity-events', () => ({ emitIdentitySecurityEvent: state.emit }));

const NOW = 1_800_000_000_000;
const ACCOUNT = 'product-sighting-account';
const SUBJECT = 'native-sighting-subject';
const SESSION = 'sess-sighting';
const WINDOW_MS = 15 * 60 * 1000;
let noteSessionSighting: (typeof import('../session-sightings'))['noteSessionSighting'];
let age: typeof import('@/lib/auth/session-age');

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

async function finishSightings(): Promise<void> {
  await Promise.all(state.pending.splice(0));
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('SESSION_ABSOLUTE_LIFETIME_HOURS', '1');
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  state.pending = [];
  state.storeAvailable = true;
  state.getSession.mockResolvedValue(session());
  state.set.mockResolvedValue(true);
  state.emit.mockResolvedValue(undefined);
  state.after.mockImplementation((task) => {
    state.pending.push(task);
  });
  age = await import('@/lib/auth/session-age');
  ({ noteSessionSighting } = await import('../session-sightings'));
});

afterEach(async () => {
  await finishSightings();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('native session sightings for mapped product accounts', () => {
  it('shares a validated age lookup and emits a product-scoped notice with the original request', async () => {
    const request = new Request('https://app.example.test/api/chat');
    const provider = { getSession: state.getSession, revokeSession: state.revokeSession };
    await age.sessionStartedAt(provider, SESSION, SUBJECT);

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, request);
    await finishSightings();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, request);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(state.set).toHaveBeenCalledExactlyOnceWith(`session-seen:${SESSION}`, ACCOUNT, {
      ttlSeconds: 3600,
      onlyIfAbsent: true,
    });
    expect(state.emit).toHaveBeenCalledExactlyOnceWith(state.db, {
      userId: ACCOUNT,
      event: 'new_sign_in',
      subjectRef: SESSION,
      request,
    });
    expect(state.after).toHaveBeenCalledTimes(1);
    expect(state.revokeSession).not.toHaveBeenCalled();
  });

  it('does not inherit an older age cached for a different native subject', async () => {
    const provider = { getSession: state.getSession, revokeSession: state.revokeSession };
    state.getSession.mockResolvedValueOnce(
      session({ userId: 'old-native-subject', createdAt: NOW - 2 * WINDOW_MS }),
    );
    await age.sessionStartedAt(provider, SESSION, 'old-native-subject');

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledTimes(2);
    expect(state.emit).toHaveBeenCalledExactlyOnceWith(state.db, {
      userId: ACCOUNT,
      event: 'new_sign_in',
      subjectRef: SESSION,
      request: undefined,
    });
  });

  it.each([
    ['missing session', null],
    ['foreign subject', session({ userId: ACCOUNT })],
    ['foreign session', session({ id: 'sess-foreign' })],
    ['unknown start', session({ createdAt: null })],
    ['NaN start', session({ createdAt: Number.NaN })],
    ['infinite start', session({ createdAt: Number.POSITIVE_INFINITY })],
  ] as const)(
    'retries after a %s instead of remembering an unmeasured sighting',
    async (_label, first) => {
      state.getSession.mockResolvedValueOnce(first);

      noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
      await finishSightings();
      expect(state.set).not.toHaveBeenCalled();
      expect(state.emit).not.toHaveBeenCalled();
      expect(age.unreadableSessionStartCount()).toBe(1);

      noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
      await finishSightings();
      expect(state.getSession).toHaveBeenCalledTimes(2);
      expect(state.set).toHaveBeenCalledTimes(1);
      expect(state.emit).toHaveBeenCalledTimes(1);
    },
  );

  it('retries a thrown provider lookup without caching the failed sighting', async () => {
    state.getSession.mockRejectedValueOnce(new Error('provider unavailable'));

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    expect(state.set).not.toHaveBeenCalled();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledTimes(2);
    expect(state.emit).toHaveBeenCalledTimes(1);
  });

  it('retries after a missing store while reusing the verified native start', async () => {
    state.storeAvailable = false;
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    expect(state.emit).not.toHaveBeenCalled();

    state.storeAvailable = true;
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledTimes(1);
    expect(state.set).toHaveBeenCalledTimes(1);
    expect(state.emit).toHaveBeenCalledTimes(1);
  });

  it('retries a failed store write and keeps failure logging product-scoped', async () => {
    const error = new Error('store unavailable');
    state.set.mockRejectedValueOnce(error);
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    expect(state.emit).not.toHaveBeenCalled();
    expect(state.warn).toHaveBeenCalledWith(
      { error, userId: ACCOUNT },
      '[session-sightings] new sign-in notice failed',
    );

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    expect(state.set).toHaveBeenCalledTimes(2);
    expect(state.emit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [WINDOW_MS, 1],
    [WINDOW_MS + 1, 0],
  ])(
    'preserves the recent-session boundary for an age of %s milliseconds',
    async (elapsed, notices) => {
      state.getSession.mockResolvedValue(session({ createdAt: NOW - elapsed }));

      noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
      await finishSightings();
      noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
      await finishSightings();

      expect(state.getSession).toHaveBeenCalledTimes(1);
      expect(state.set).toHaveBeenCalledTimes(notices);
      expect(state.emit).toHaveBeenCalledTimes(notices);
    },
  );

  it('does not notify when another process has claimed the distributed sighting key', async () => {
    state.set.mockResolvedValue(false);

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.set).toHaveBeenCalledTimes(1);
    expect(state.emit).not.toHaveBeenCalled();
  });

  it('deduplicates simultaneous sightings while the provider lookup is still pending', async () => {
    let resolveSession!: (value: IdentitySession) => void;
    state.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    expect(state.getSession).toHaveBeenCalledTimes(1);
    expect(state.after).toHaveBeenCalledTimes(1);
    resolveSession(session());
    await finishSightings();
    expect(state.emit).toHaveBeenCalledTimes(1);
  });

  it('does not let remembered account/subject state suppress a different identity pair', async () => {
    state.getSession
      .mockResolvedValueOnce(
        session({ userId: 'old-native-subject', createdAt: NOW - 2 * WINDOW_MS }),
      )
      .mockResolvedValueOnce(session({ createdAt: NOW - 2 * WINDOW_MS }));

    noteSessionSighting('old-product-account', 'old-native-subject', SESSION, undefined);
    await finishSightings();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledTimes(2);
    expect(state.after).toHaveBeenCalledTimes(2);
    expect(state.set).not.toHaveBeenCalled();
  });

  it('allows a different product mapping to reach the same distributed dedupe decision', async () => {
    state.set.mockResolvedValue(false);

    noteSessionSighting('old-product-account', SUBJECT, SESSION, undefined);
    await finishSightings();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.getSession).toHaveBeenCalledTimes(1);
    expect(state.set.mock.calls.map(([, userId]) => userId)).toEqual([
      'old-product-account',
      ACCOUNT,
    ]);
    expect(state.emit).not.toHaveBeenCalled();
  });

  it('does not look up or announce a credential without a native session', async () => {
    noteSessionSighting(ACCOUNT, SUBJECT, null, undefined);
    await finishSightings();

    expect(state.getSession).not.toHaveBeenCalled();
    expect(state.after).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });

  it('keeps its existing fallback when after is unavailable', async () => {
    state.after.mockImplementation((task) => {
      state.pending.push(task);
      throw new Error('no request context');
    });

    expect(() => noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined)).not.toThrow();
    await finishSightings();
    expect(state.emit).toHaveBeenCalledTimes(1);
  });

  it('does not imply atomic delivery when emission fails after claiming the key', async () => {
    state.set.mockResolvedValueOnce(true).mockResolvedValue(false);
    state.emit.mockRejectedValueOnce(new Error('event write failed'));

    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();
    noteSessionSighting(ACCOUNT, SUBJECT, SESSION, undefined);
    await finishSightings();

    expect(state.set).toHaveBeenCalledTimes(2);
    expect(state.emit).toHaveBeenCalledTimes(1);
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ACCOUNT }),
      '[session-sightings] new sign-in notice failed',
    );
  });
});

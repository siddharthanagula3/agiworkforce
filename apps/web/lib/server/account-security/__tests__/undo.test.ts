import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type Progress = import('../store').UndoCleanupProgress;

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  read: vi.fn(),
  undo: vi.fn(),
  claim: vi.fn(),
  record: vi.fn(),
  end: vi.fn(),
  remember: vi.fn(),
  mobile: vi.fn(),
  identity: vi.fn(),
  revoke: vi.fn(),
  getUser: vi.fn(),
  setPassword: vi.fn(),
  password: vi.fn(),
  respond: vi.fn(),
  event: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),
  logger: { error: vi.fn() },
}));
vi.mock('@/lib/server/identity', async () => ({
  ...(await vi.importActual<IdentityModule>('@/lib/server/identity')),
  getIdentityProvider: mocks.identity,
}));
vi.mock('@/lib/services/identity-events', async () => ({
  ...(await vi.importActual<IdentityEventsModule>('@/lib/services/identity-events')),

  emitIdentitySecurityEvent: mocks.event,
  respondToAccountCompromise: mocks.respond,
}));
vi.mock('../gate', async () => ({
  ...(await vi.importActual<GateModule>('../gate')),
  rememberEnrollment: mocks.remember,
}));
vi.mock('../secrets', async () => ({
  ...(await vi.importActual<SecretsModule>('../secrets')),
  hashUndoToken: mocks.hash,
  newUnusablePassword: mocks.password,
}));
vi.mock('../store', async () => ({
  ...(await vi.importActual<StoreModule>('../store')),
  readEnrollmentUndo: mocks.read,
  undoEnrollment: mocks.undo,
  claimUndoCleanup: mocks.claim,
  recordUndoCleanupStep: mocks.record,
  endUndoCleanup: mocks.end,
}));
vi.mock('@/lib/server/mobile-intent-tokens', async () => ({
  ...(await vi.importActual<MobileIntentTokensModule>('@/lib/server/mobile-intent-tokens')),

  revokeEveryMobileIntentToken: mocks.mobile,
}));

import { turnOffFromEmailLink } from '../undo';
type LoggerModule = typeof import('@/lib/logger');
type IdentityModule = typeof import('@/lib/server/identity');
type IdentityEventsModule = typeof import('@/lib/services/identity-events');
type GateModule = typeof import('../gate');
type SecretsModule = typeof import('../secrets');
type StoreModule = typeof import('../store');
type MobileIntentTokensModule = typeof import('@/lib/server/mobile-intent-tokens');

const db = {} as DatabaseAdapter;
const request = new Request(
  'https://example.test/api/account-security/enrollment/undo',
) as NextRequest;
const identity = {
  revokeSession: mocks.revoke,
  getUser: mocks.getUser,
  setPassword: mocks.setPassword,
};
const containedResponse = {
  responseId: 'response-fixture',
  sessionsRevoked: 2,
  sessionsFailed: 0,
  deviceCredentialsRevoked: 1,
  passwordResetRequired: true,
  supportPath: '/support',
};
const context =
  'Advanced Account Security was turned off from the emailed link. Review your sign-in methods and active sessions. Account recovery may need further attention.';
const unfinished = /part of the cleanup did not finish/;

interface Store {
  open: boolean;
  record: { progress: Progress; leased: boolean } | null;
}

let store: Store;

function installStore(): void {
  store = { open: true, record: null };
  mocks.read.mockImplementation(async () =>
    store.open ? { userId: 'user-fixture', enrolledSessionId: 'session-fixture' } : null,
  );
  mocks.undo.mockImplementation(async () => {
    if (!store.open) return false;
    store.open = false;
    store.record = { progress: { enrolledSessionId: 'session-fixture' }, leased: false };
    return true;
  });
  mocks.claim.mockImplementation(async () => {
    if (!store.record) return { status: 'none' };
    if (store.record.leased) return { status: 'busy' };
    store.record.leased = true;
    return { status: 'claimed', userId: 'user-fixture', progress: { ...store.record.progress } };
  });
  mocks.record.mockImplementation(async (_db: unknown, input: { settled: Progress }) => {
    if (!store.record) return false;
    Object.assign(store.record.progress, input.settled);
    return true;
  });
  mocks.end.mockImplementation(async (_db: unknown, input: { finished: boolean }) => {
    if (!store.record) return;
    store.record.leased = false;
    if (input.finished) store.record = null;
  });
}

// Mocked dependencies characterize call order, receipt fields and the durable step record, not provider or database behavior.
describe('turnOffFromEmailLink with a durable cleanup record', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installStore();
    mocks.hash.mockReturnValue('undo-hash-fixture');
    mocks.remember.mockResolvedValue(undefined);
    mocks.mobile.mockResolvedValue(undefined);
    mocks.identity.mockReturnValue(identity);
    mocks.revoke.mockResolvedValue(undefined);
    mocks.getUser.mockResolvedValue({ passwordEnabled: true });
    mocks.password.mockReturnValue('unusable-password-fixture');
    mocks.setPassword.mockResolvedValue(undefined);
    mocks.respond.mockResolvedValue(containedResponse);
    mocks.event.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    'finishes every step in order for passwordReset=%s and clears the record',
    async (passwordEnabled) => {
      mocks.getUser.mockResolvedValue({ passwordEnabled });

      await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
        sessionsSignedOut: 3,
        passwordReset: passwordEnabled,
      });

      expect(mocks.event).toHaveBeenCalledExactlyOnceWith(db, {
        userId: 'user-fixture',
        event: 'advanced_security_disabled',
        subjectRef: expect.any(String),
        context,
        request,
        detail: { source: 'email_link', deleted: 1 },
      });
      expect(context).not.toMatch(/every session|everyone|password was reset|choose a new/i);
      expect(mocks.respond).toHaveBeenCalledWith(db, identity, {
        userId: 'user-fixture',
        trigger: 'reported',
        request,
      });
      expect(mocks.read).toHaveBeenCalledWith(db, 'undo-hash-fixture');
      expect(mocks.undo).toHaveBeenCalledWith(db, {
        userId: 'user-fixture',
        tokenHash: 'undo-hash-fixture',
      });
      expect(mocks.claim).toHaveBeenCalledWith(db, {
        tokenHash: 'undo-hash-fixture',
        leaseSeconds: expect.any(Number),
      });
      expect(mocks.remember).toHaveBeenCalledWith('user-fixture', null);
      expect(mocks.mobile).toHaveBeenCalledWith('user-fixture');
      expect(mocks.revoke).toHaveBeenCalledWith('session-fixture');
      if (passwordEnabled) {
        expect(mocks.setPassword).toHaveBeenCalledWith('user-fixture', 'unusable-password-fixture');
      } else {
        expect(mocks.setPassword).not.toHaveBeenCalled();
        expect(mocks.password).not.toHaveBeenCalled();
      }
      const steps = [
        mocks.hash,
        mocks.read,
        mocks.undo,
        mocks.claim,
        mocks.remember,
        mocks.mobile,
        mocks.identity,
        mocks.revoke,
        mocks.getUser,
        ...(passwordEnabled ? [mocks.password, mocks.setPassword] : []),
        mocks.respond,
        mocks.event,
        mocks.end,
      ];
      const order = steps.map((step) => step.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a! - b!));
      expect(mocks.end).toHaveBeenCalledWith(db, {
        userId: 'user-fixture',
        tokenHash: 'undo-hash-fixture',
        finished: true,
      });
      expect(store.record).toBeNull();
    },
  );

  it('keeps the unfinished record when a mandatory step rejects and still attempts the rest', async () => {
    mocks.mobile.mockRejectedValue(new Error('mobile failed'));

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
      unfinished,
    );

    expect(mocks.remember).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.setPassword).toHaveBeenCalledTimes(1);
    expect(mocks.respond).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
    expect(store.record).toEqual({
      leased: false,
      progress: {
        enrolledSessionId: 'session-fixture',
        enrollmentForgotten: true,
        enrollingSession: 'ended',
        password: 'reset',
        containment: { sessionsRevoked: 2, deviceCredentialsRevoked: 1 },
        notified: true,
      },
    });
  });

  it('finishes only the unfinished steps when the link is opened again', async () => {
    mocks.mobile.mockRejectedValueOnce(new Error('mobile failed'));
    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
      unfinished,
    );
    vi.clearAllMocks();
    mocks.hash.mockReturnValue('undo-hash-fixture');

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 3,
      passwordReset: true,
    });

    expect(mocks.undo).not.toHaveBeenCalled();
    expect(mocks.mobile).toHaveBeenCalledTimes(1);
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.setPassword).not.toHaveBeenCalled();
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(store.record).toBeNull();
  });

  it('never repeats a password reset that already succeeded', async () => {
    mocks.respond.mockRejectedValueOnce(new Error('containment failed'));
    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
      unfinished,
    );
    expect(mocks.setPassword).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ detail: { source: 'email_link', deleted: 0 } }),
    );

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 3,
      passwordReset: true,
    });

    expect(mocks.setPassword).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.respond).toHaveBeenCalledTimes(2);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it('returns the best-effort provider failures honestly and retries them on the next open', async () => {
    mocks.revoke.mockRejectedValueOnce(new Error('session provider failed'));
    mocks.setPassword.mockRejectedValueOnce(new Error('password provider failed'));
    mocks.respond.mockResolvedValue({ ...containedResponse, sessionsRevoked: 0 });

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 0,
      passwordReset: false,
    });
    expect(mocks.event).toHaveBeenCalledWith(db, expect.objectContaining({ context }));
    expect(store.record?.progress).not.toHaveProperty('enrollingSession');
    expect(store.record?.progress).not.toHaveProperty('password');
    expect(mocks.end).toHaveBeenCalledWith(db, expect.objectContaining({ finished: false }));

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 1,
      passwordReset: true,
    });
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
    expect(mocks.setPassword).toHaveBeenCalledTimes(2);
    expect(mocks.respond).toHaveBeenCalledTimes(1);
    expect(store.record).toBeNull();
  });

  it('leaves containment unfinished when the sweep could not end every session', async () => {
    mocks.respond.mockResolvedValueOnce({ ...containedResponse, sessionsFailed: 1 });

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 3,
      passwordReset: true,
    });
    expect(store.record?.progress).not.toHaveProperty('containment');

    await turnOffFromEmailLink(db, 'undo-token-fixture', request);
    expect(mocks.respond).toHaveBeenCalledTimes(2);
    expect(store.record).toBeNull();
  });

  it('releases the lease when the identity provider cannot be created', async () => {
    mocks.identity.mockImplementation(() => {
      throw new Error('identity unavailable');
    });

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
      'identity unavailable',
    );
    expect(store.record?.leased).toBe(false);
    expect(store.record?.progress).toMatchObject({
      enrollmentForgotten: true,
      mobileIntentsRevoked: true,
    });
  });

  it('refuses a second opener while the first is still finishing the cleanup', async () => {
    mocks.undo.mockImplementationOnce(async () => {
      store.open = false;
      store.record = { progress: { enrolledSessionId: 'session-fixture' }, leased: true };
      return false;
    });

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
      /already being finished/,
    );
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it.each(['missing', 'used'] as const)(
    'stops before cleanup for a %s token receipt',
    async (state) => {
      if (state === 'missing') store.open = false;
      else mocks.claim.mockResolvedValue({ status: 'none' });

      await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
        /expired or was already used/,
      );
      expect(mocks.remember).not.toHaveBeenCalled();
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.event).not.toHaveBeenCalled();
      expect(mocks.end).not.toHaveBeenCalled();
    },
  );
});

type CompleteMockModule0 = typeof import('../store');

type RetainedMockModule0 = typeof import('@/lib/logger');

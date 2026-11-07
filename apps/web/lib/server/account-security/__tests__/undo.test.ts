import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  read: vi.fn(),
  undo: vi.fn(),
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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: mocks.identity }));
vi.mock('@/lib/services/identity-events', () => ({
  emitIdentitySecurityEvent: mocks.event,
  respondToAccountCompromise: mocks.respond,
}));
vi.mock('../gate', () => ({ rememberEnrollment: mocks.remember }));
vi.mock('../secrets', () => ({ hashUndoToken: mocks.hash, newUnusablePassword: mocks.password }));
vi.mock('../store', () => ({ readEnrollmentUndo: mocks.read, undoEnrollment: mocks.undo }));
vi.mock('@/lib/server/mobile-intent-tokens', () => ({
  revokeEveryMobileIntentToken: mocks.mobile,
}));

import { turnOffFromEmailLink } from '../undo';

const db = {} as DatabaseAdapter;
const request = new Request(
  'https://example.test/api/account-security/enrollment/undo',
) as NextRequest;
const identity = {
  revokeSession: mocks.revoke,
  getUser: mocks.getUser,
  setPassword: mocks.setPassword,
};
const partialResponse = {
  responseId: 'response-fixture',
  sessionsRevoked: 2,
  sessionsFailed: 1,
  deviceCredentialsRevoked: 1,
  passwordResetRequired: true,
  supportPath: '/support',
};
const context =
  'Advanced Account Security was turned off from the emailed link. Review your sign-in methods and active sessions. Account recovery may need further attention.';

// Mocked dependencies characterize existing call order and receipt fields, not recovery or provider identity correctness.
describe('turnOffFromEmailLink presentation with unchanged service operations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hash.mockReturnValue('undo-hash-fixture');
    mocks.read.mockResolvedValue({ userId: 'user-fixture', enrolledSessionId: 'session-fixture' });
    mocks.undo.mockResolvedValue(true);
    mocks.remember.mockResolvedValue(undefined);
    mocks.mobile.mockResolvedValue(undefined);
    mocks.identity.mockReturnValue(identity);
    mocks.revoke.mockResolvedValue(undefined);
    mocks.getUser.mockResolvedValue({ passwordEnabled: true });
    mocks.password.mockReturnValue('unusable-password-fixture');
    mocks.setPassword.mockResolvedValue(undefined);
    mocks.respond.mockResolvedValue(partialResponse);
    mocks.event.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    'keeps the event bounded for passwordReset=%s and a partial sweep',
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
      expect(mocks.hash).toHaveBeenCalledWith('undo-token-fixture');
      expect(mocks.read).toHaveBeenCalledWith(db, 'undo-hash-fixture');
      expect(mocks.undo).toHaveBeenCalledWith(db, {
        userId: 'user-fixture',
        tokenHash: 'undo-hash-fixture',
      });
      expect(mocks.remember).toHaveBeenCalledWith('user-fixture', null);
      expect(mocks.mobile).toHaveBeenCalledWith('user-fixture');
      expect(mocks.revoke).toHaveBeenCalledWith('session-fixture');
      expect(mocks.getUser).toHaveBeenCalledWith('user-fixture');
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
        mocks.remember,
        mocks.mobile,
        mocks.identity,
        mocks.revoke,
        mocks.getUser,
        ...(passwordEnabled ? [mocks.password, mocks.setPassword] : []),
        mocks.respond,
        mocks.event,
      ];
      const order = steps.map((step) => step.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a! - b!));
    },
  );

  it('retains the existing best-effort provider failure receipt without a recovery promise', async () => {
    mocks.revoke.mockRejectedValue(new Error('session provider failed'));
    mocks.setPassword.mockRejectedValue(new Error('password provider failed'));
    mocks.respond.mockResolvedValue({ ...partialResponse, sessionsRevoked: 0 });

    await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).resolves.toEqual({
      sessionsSignedOut: 0,
      passwordReset: false,
    });
    expect(mocks.event).toHaveBeenCalledWith(db, expect.objectContaining({ context }));
  });

  it.each(['remember', 'mobile', 'respond'] as const)(
    'does not emit success after %s rejects after token consumption',
    async (step) => {
      const error = new Error(`${step} failed`);
      mocks[step].mockRejectedValue(error);

      await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toBe(error);

      expect(mocks.undo).toHaveBeenCalledTimes(1);
      expect(mocks.event).not.toHaveBeenCalled();
      expect(mocks.undo.mock.invocationCallOrder[0]).toBeLessThan(
        mocks[step].mock.invocationCallOrder[0]!,
      );
      if (step === 'remember') expect(mocks.mobile).not.toHaveBeenCalled();
      if (step !== 'respond') {
        expect(mocks.identity).not.toHaveBeenCalled();
        expect(mocks.respond).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['missing', 'used'] as const)(
    'stops before cleanup for a %s token receipt',
    async (state) => {
      if (state === 'missing') mocks.read.mockResolvedValue(null);
      else mocks.undo.mockResolvedValue(false);

      await expect(turnOffFromEmailLink(db, 'undo-token-fixture', request)).rejects.toThrow(
        /expired or was already used/,
      );
      expect(mocks.remember).not.toHaveBeenCalled();
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.event).not.toHaveBeenCalled();
    },
  );
});

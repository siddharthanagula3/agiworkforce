import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type StoreModule = typeof import('../store');

type Staged = { staged?: Array<() => void> };

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  record: vi.fn(),
  take: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
  forget: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/seo/site', () => ({ SITE_URL: 'https://example.test', SITE_NAME: 'Test' }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: vi.fn(() => ({})),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/server/refresh-token-family', () => ({
  revokeEveryDeviceRefreshCredential: vi.fn(),
}));
vi.mock('@/lib/server/session-revocation', () => ({ revokeEveryOtherSession: vi.fn() }));
vi.mock('@/lib/server/step-up-auth', () => ({ requireStepUp: vi.fn() }));
vi.mock('@/lib/services/identity-events', () => ({ emitIdentitySecurityEvent: mocks.event }));
vi.mock('@/lib/services/notification-email-service', () => ({
  sendAccountSecurityCodeEmail: vi.fn(),
  sendAccountSecurityEnabledEmail: vi.fn(),
}));
vi.mock('../gate', () => ({
  forgetSessionVerification: mocks.forget,
  rememberEnrollment: vi.fn(),
  sessionVerifiedUntil: vi.fn(),
  verificationLifetimeSeconds: vi.fn(() => 60),
}));
vi.mock('../store', async (importOriginal) => ({
  ...(await importOriginal<StoreModule>()),
  finishRecovery: mocks.finish,
  recordSessionVerification: mocks.record,
  takeCompletedHandoff: mocks.take,
}));

import { completeHandoff, completeRecovery, type AccountSecurityCaller } from '../service';
import { codeChallengeFor, hashHandoffCode } from '../secrets';

const request = new NextRequest('https://example.test/api/account-security/recovery');

// This model checks that the two writes share one commit; it is not PostgreSQL isolation evidence.
function fixture() {
  const state = { holdOpen: true, verified: false, handoffOpen: true, failVerification: false };
  const commit = (db: unknown, write: () => void) => {
    const staged = (db as Staged).staged;
    if (staged) staged.push(write);
    else write();
  };
  const db = {
    transaction: vi.fn(async (run: (tx: DatabaseAdapter) => Promise<unknown>) => {
      const tx = { staged: [] as Array<() => void> };
      const result = await run(tx as unknown as DatabaseAdapter);
      tx.staged.forEach((write) => write());
      return result;
    }),
  } as unknown as DatabaseAdapter;
  mocks.finish.mockImplementation(async (target: unknown) => {
    if (!state.holdOpen) return false;
    commit(target, () => {
      state.holdOpen = false;
    });
    return true;
  });
  mocks.record.mockImplementation(async (target: unknown) => {
    if (state.failVerification) throw new Error('connection reset');
    commit(target, () => {
      state.verified = true;
    });
    return 1_800_000_000_000;
  });
  const caller: AccountSecurityCaller = {
    db,
    userId: 'user-1',
    sessionId: 'session-1',
  } as AccountSecurityCaller;
  return { state, caller };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recovery completion', () => {
  it('keeps the matured hold when the session verification cannot be recorded', async () => {
    const { state, caller } = fixture();
    state.failVerification = true;

    await expect(completeRecovery(caller, request)).rejects.toThrow('connection reset');

    expect(state.holdOpen).toBe(true);
    expect(state.verified).toBe(false);
    expect(mocks.event).not.toHaveBeenCalled();

    state.failVerification = false;
    await expect(completeRecovery(caller, request)).resolves.toEqual(expect.any(String));
    expect(state.holdOpen).toBe(false);
    expect(state.verified).toBe(true);
  });

  it('refuses without recording a verification when no matured hold belongs to the session', async () => {
    const { state, caller } = fixture();
    state.holdOpen = false;

    await expect(completeRecovery(caller, request)).rejects.toThrow(
      'Recovery can be completed only from the device that started it',
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(state.verified).toBe(false);
  });

  it('announces the verification only after both writes commit', async () => {
    const { state, caller } = fixture();

    await completeRecovery(caller, request);

    expect(state.verified).toBe(true);
    expect(mocks.forget).toHaveBeenCalledWith('session-1');
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'account_security_session_verified' }),
    );
  });
});

describe('handoff completion', () => {
  const CODE = 'handoff-code';
  const VERIFIER = 'handoff-verifier-with-enough-entropy-0123456789';
  const input = { handoff: 'handoff-token', code: CODE, codeVerifier: VERIFIER };

  function takeFrom(state: { handoffOpen: boolean }) {
    mocks.take.mockImplementation(async (target: unknown) => {
      if (!state.handoffOpen) return null;
      commitClose(target, state);
      return { codeHash: hashHandoffCode(CODE), codeChallenge: codeChallengeFor(VERIFIER) };
    });
  }
  function commitClose(target: unknown, state: { handoffOpen: boolean }) {
    const staged = (target as Staged).staged;
    const close = () => {
      state.handoffOpen = false;
    };
    if (staged) staged.push(close);
    else close();
  }

  it('leaves the handoff open when the session verification cannot be recorded', async () => {
    const { state, caller } = fixture();
    takeFrom(state);
    state.failVerification = true;

    await expect(completeHandoff(caller, input, request)).rejects.toThrow('connection reset');

    expect(state.handoffOpen).toBe(true);
    expect(state.verified).toBe(false);
  });

  it('still burns the handoff when the code does not match, without granting access', async () => {
    const { state, caller } = fixture();
    takeFrom(state);

    await expect(
      completeHandoff(caller, { ...input, code: 'wrong-code' }, request),
    ).rejects.toThrow('This sign-in could not be confirmed');

    expect(state.handoffOpen).toBe(false);
    expect(state.verified).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

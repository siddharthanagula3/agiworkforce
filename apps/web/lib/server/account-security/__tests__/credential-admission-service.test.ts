import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ACCOUNT_SECURITY_CREDENTIALS_PATH,
  ACCOUNT_SECURITY_POLICY,
} from '@agiworkforce/cloud-contracts/account-security';
import type { EnrollmentState, StoredCredential } from '../store';

type StoreModule = typeof import('../store');
type WebauthnModule = typeof import('../webauthn');

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  promote: vi.fn(),
  arm: vi.fn(),
  proof: vi.fn(),
  code: vi.fn(),
  assertion: vi.fn(),
  event: vi.fn(),
  audit: vi.fn(),
  remember: vi.fn(),
  revokeDevices: vi.fn(),
  revokeSessions: vi.fn(),
  email: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),
  logger: { error: vi.fn() },
}));
vi.mock('@/lib/seo/site', async () => ({
  ...(await vi.importActual<SiteModule>('@/lib/seo/site')),
  SITE_URL: 'https://example.test',
  SITE_NAME: 'Test',
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/server/identity', async () => ({
  ...(await vi.importActual<IdentityModule>('@/lib/server/identity')),

  getIdentityProvider: vi.fn(() => ({})),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(async () => ({
    primaryEmail: 'owner@example.test',
    primaryEmailVerification: 'verified',
  })),
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),
  getNeonDb: vi.fn(() => ({})),
}));
vi.mock('@/lib/server/refresh-token-family', async () => ({
  ...(await vi.importActual<RefreshTokenFamilyModule>('@/lib/server/refresh-token-family')),

  revokeEveryDeviceRefreshCredential: mocks.revokeDevices,
}));
vi.mock('@/lib/server/session-revocation', async () => ({
  ...(await vi.importActual<SessionRevocationModule>('@/lib/server/session-revocation')),

  revokeEveryOtherSession: mocks.revokeSessions,
}));
vi.mock('@/lib/server/step-up-auth', async () => ({
  ...(await vi.importActual<StepUpAuthModule>('@/lib/server/step-up-auth')),
  requireStepUp: mocks.proof,
}));
vi.mock('@/lib/services/identity-events', async () => ({
  ...(await vi.importActual<IdentityEventsModule>('@/lib/services/identity-events')),
  emitIdentitySecurityEvent: mocks.event,
}));
vi.mock('@/lib/services/notification-email-service', async () => ({
  ...(await vi.importActual<NotificationEmailServiceModule>(
    '@/lib/services/notification-email-service',
  )),

  sendAccountSecurityCodeEmail: vi.fn(),
  sendAccountSecurityEnabledEmail: mocks.email,
}));
vi.mock('../gate', async () => ({
  ...(await vi.importActual<GateModule>('../gate')),

  forgetSessionVerification: vi.fn(),
  rememberEnrollment: mocks.remember,
  sessionVerifiedUntil: vi.fn(),
  verificationLifetimeSeconds: vi.fn(() => 60),
}));
vi.mock('../store', async (importOriginal) => ({
  ...(await importOriginal<StoreModule>()),
  lockEnrollment: mocks.lock,
  listCredentials: mocks.list,
  deleteCredential: mocks.remove,
  promotePendingRecoveryKeys: mocks.promote,
  armEnrollmentUndo: mocks.arm,
  readOrganizationControl: vi.fn(async () => ({ provisioned: false, claimed_domain: false })),
  signInAddressChangedSince: vi.fn(async () => false),
  takeChallenge: vi.fn(async () => 'challenge'),
  recordCredentialUse: vi.fn(async () => true),
  takeEnrollmentCode: mocks.code,
  recordSessionVerification: vi.fn(async () => Date.now() + 60_000),
}));
vi.mock('../webauthn', async (importOriginal) => ({
  ...(await importOriginal<WebauthnModule>()),
  verifyAssertion: mocks.assertion,
}));

import { enrollAccountSecurity, removeCredential, type AccountSecurityCaller } from '../service';
import { meetsEnrollmentRequirement } from '../webauthn';
type LoggerModule = typeof import('@/lib/logger');
type SiteModule = typeof import('@/lib/seo/site');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type IdentityModule = typeof import('@/lib/server/identity');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type RefreshTokenFamilyModule = typeof import('@/lib/server/refresh-token-family');
type SessionRevocationModule = typeof import('@/lib/server/session-revocation');
type StepUpAuthModule = typeof import('@/lib/server/step-up-auth');
type IdentityEventsModule = typeof import('@/lib/services/identity-events');
type NotificationEmailServiceModule = typeof import('@/lib/services/notification-email-service');
type GateModule = typeof import('../gate');

function credential(id: string, portable = true): StoredCredential {
  return {
    id,
    credentialId: `credential-${id}`,
    publicKey: 'public-key',
    signCount: 0,
    transports: ['internal'],
    deviceType: portable ? 'multiDevice' : 'singleDevice',
    backedUp: portable,
    name: id,
    createdAt: 1,
    lastUsedAt: null,
  };
}
function methods(extra = 0): StoredCredential[] {
  return Array.from({ length: ACCOUNT_SECURITY_POLICY.minimumSignInMethods + extra }, (_, i) =>
    credential(`key-${i}`),
  );
}
const request = new NextRequest('https://example.test/api/account-security/credentials/key-0');
const input = { emailCode: '123456', response: {}, recoveryBatchId: 'b'.repeat(43) };

// This serialized in-memory model checks service admission, not PostgreSQL lock/isolation behavior.
function fixture(enrolled = true, initial = methods(1)) {
  const state = {
    credentials: initial,
    enrolledAt: enrolled ? 1 : (null as number | null),
    armed: false,
    active: false,
    locked: false,
    committed: 0,
    beforeLock: undefined as (() => void) | undefined,
    failDelete: false,
    failArm: false,
    failCommit: false,
    trace: [] as string[],
  };
  const tx = {
    transaction: vi.fn(() => {
      throw new Error('nested transaction');
    }),
  } as unknown as DatabaseAdapter;
  let queue = Promise.resolve();
  const db = {
    query: vi.fn(async () => [{ email: 'owner@example.test', changed_recently: false }]),
    execute: vi.fn(async () => 1),
    transaction: vi.fn(async (work: (connection: DatabaseAdapter) => Promise<unknown>) => {
      const predecessor = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await predecessor;
      state.beforeLock?.();
      state.beforeLock = undefined;
      const saved = {
        credentials: [...state.credentials],
        enrolledAt: state.enrolledAt,
        armed: state.armed,
      };
      state.active = true;
      state.trace.push('begin');
      try {
        const result = await work(tx);
        if (state.failCommit) throw new Error('commit failed');
        state.committed++;
        state.trace.push('commit');
        return result;
      } catch (error) {
        Object.assign(state, saved);
        state.trace.push('rollback');
        throw error;
      } finally {
        state.active = false;
        state.locked = false;
        release();
      }
    }),
  } as unknown as DatabaseAdapter;
  const caller = { db, userId: 'user-1', sessionId: 'session-1' } as AccountSecurityCaller;
  function locked(connection: DatabaseAdapter) {
    expect(connection).toBe(tx);
    expect(state.active && state.locked).toBe(true);
  }
  mocks.lock.mockImplementation(async (connection, userId) => {
    expect(connection).toBe(tx);
    expect(userId).toBe(caller.userId);
    expect(state.active).toBe(true);
    state.locked = true;
    state.trace.push('lock');
    return {
      enrolledAt: state.enrolledAt,
      recoveryKeysRemaining: 0,
      pendingRecoveryKeysExpireAt: null,
      recovery: null,
    } satisfies EnrollmentState;
  });
  mocks.list.mockImplementation(async (connection, userId) => {
    expect(userId).toBe(caller.userId);
    if (connection === tx) locked(connection);
    else expect(connection).toBe(db);
    state.trace.push(connection === tx ? 'locked-list' : 'early-list');
    return [...state.credentials];
  });
  mocks.proof.mockImplementation(async (requirement) => {
    locked(tx);
    expect(requirement).toEqual({
      userId: caller.userId,
      action: 'account_security.change',
      resourceId: expect.any(String),
      request,
      endpoint: ACCOUNT_SECURITY_CREDENTIALS_PATH,
    });
    state.trace.push('proof');
  });
  mocks.remove.mockImplementation(async (connection, userId, id) => {
    locked(connection);
    expect(userId).toBe(caller.userId);
    state.trace.push('delete');
    if (state.failDelete) return false;
    const found = state.credentials.some((item) => item.id === id);
    state.credentials = state.credentials.filter((item) => item.id !== id);
    return found;
  });
  mocks.assertion.mockImplementation(async ({ credentials }) => ({
    credential: credentials[0],
    signCount: 1,
  }));
  mocks.code.mockImplementation(async () => {
    state.trace.push('code');
    return true;
  });
  mocks.promote.mockImplementation(async (connection, receipt) => {
    locked(connection);
    expect(receipt).toEqual({
      userId: caller.userId,
      sessionId: caller.sessionId,
      mode: 'enroll',
      batchId: input.recoveryBatchId,
    });
    state.trace.push('promote');
    if (state.enrolledAt !== null) return null;
    state.enrolledAt = 2;
    return 2;
  });
  mocks.arm.mockImplementation(async (connection) => {
    locked(connection);
    state.trace.push('arm');
    if (state.failArm) return null;
    state.armed = true;
    return Date.now() + 60_000;
  });
  mocks.event.mockImplementation(async () => {
    expect(state.committed).toBeGreaterThan(0);
  });
  return { state, caller, tx, db };
}
function noPostCommitEffects() {
  for (const mock of [
    mocks.event,
    mocks.remember,
    mocks.revokeDevices,
    mocks.revokeSessions,
    mocks.email,
  ])
    expect(mock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env['CSRF_SECRET'] = 'credential-admission-fixture-secret-long-enough';
  mocks.revokeDevices.mockResolvedValue(0);
  mocks.revokeSessions.mockResolvedValue({
    ended: [],
    alreadyGone: [],
    failed: [],
    incomplete: false,
  });
  mocks.email.mockResolvedValue({ delivered: true });
});

describe('locked credential removal admission', () => {
  it('uses freshly locked enrolled state and target-bound proof before listing or deletion', async () => {
    const { state, caller } = fixture(false);
    state.beforeLock = () => {
      state.enrolledAt = 1;
    };
    await removeCredential(caller, 'key-0', request);
    expect(mocks.proof).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'key-0' }));
    expect(state.trace).toEqual(['begin', 'lock', 'proof', 'locked-list', 'delete', 'commit']);
    expect(mocks.event).toHaveBeenCalledWith(
      caller.db,
      expect.objectContaining({
        event: 'advanced_security_key_removed',
        subjectRef: 'key-0',
        context: 'Name: key-0.',
      }),
    );
  });

  it('allows removal without proof only when locked state is unenrolled', async () => {
    const { state, caller } = fixture(true, [credential('key-0')]);
    state.beforeLock = () => {
      state.enrolledAt = null;
    };
    await removeCredential(caller, 'key-0', request);
    expect(mocks.proof).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'account_security_credential_removed' }),
    );
  });

  it('propagates target-mismatched proof refusal without listing, deletion or removal events', async () => {
    const { state, caller } = fixture();
    mocks.proof.mockImplementationOnce(async ({ resourceId }) => {
      expect(state.active && state.locked).toBe(true);
      expect(resourceId).toBe('key-1');
      throw new Error('subject_mismatch');
    });
    await expect(removeCredential(caller, 'key-1', request)).rejects.toThrow('subject_mismatch');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    noPostCommitEffects();
  });

  it.each(['key-0', 'key-1'])(
    'serializes overlapping removal of key-0 and %s against current methods',
    async (second) => {
      const { state, caller } = fixture();
      const results = await Promise.allSettled([
        removeCredential(caller, 'key-0', request),
        removeCredential(caller, second, request),
      ]);
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
      expect(state.credentials).toHaveLength(ACCOUNT_SECURITY_POLICY.minimumSignInMethods);
      expect(meetsEnrollmentRequirement(state.credentials)).toBe(true);
      expect(mocks.remove).toHaveBeenCalledTimes(1);
      expect(mocks.event).toHaveBeenCalledTimes(1);
      expect(mocks.lock).toHaveBeenCalledTimes(2);
    },
  );

  it('retains the last portable method even when enough nonportable methods remain', async () => {
    const current = methods(1).map((item, index) => credential(item.id, index === 0));
    const { caller } = fixture(true, current);
    await expect(removeCredential(caller, 'key-0', request)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    noPostCommitEffects();
  });

  it('rolls a staged deletion back on commit failure without success audit or event', async () => {
    const { state, caller } = fixture();
    state.failCommit = true;
    await expect(removeCredential(caller, 'key-0', request)).rejects.toThrow('commit failed');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(state.credentials.some((item) => item.id === 'key-0')).toBe(true);
    expect(state.trace.slice(-2)).toEqual(['delete', 'rollback']);
    expect(mocks.audit).not.toHaveBeenCalled();
    noPostCommitEffects();
  });

  it('fails closed on a missing target or failed delete and emits no removal event', async () => {
    const { state, caller } = fixture();
    await expect(removeCredential(caller, 'missing', request)).rejects.toMatchObject({
      statusCode: 404,
    });
    state.failDelete = true;
    await expect(removeCredential(caller, 'key-0', request)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(state.credentials).toHaveLength(ACCOUNT_SECURITY_POLICY.minimumSignInMethods + 1);
    expect(state.committed).toBe(0);
    noPostCommitEffects();
  });
});

describe('locked enrollment promotion admission', () => {
  it.each(['count', 'portability', 'asserted-method'] as const)(
    'rechecks %s after consuming assertion and code but before promotion',
    async (change) => {
      const { state, caller, db } = fixture(false);
      state.beforeLock = () => {
        if (change === 'count') state.credentials = [credential('key-0')];
        if (change === 'portability')
          state.credentials = methods().map((item) => credential(item.id, false));
        if (change === 'asserted-method')
          state.credentials = methods().map((item) => credential(`replacement-${item.id}`));
      };
      await expect(enrollAccountSecurity(caller, db, input, request)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mocks.assertion).toHaveBeenCalledTimes(1);
      expect(mocks.code).toHaveBeenCalledTimes(1);
      expect(state.trace.indexOf('code')).toBeLessThan(state.trace.indexOf('lock'));
      expect(state.trace).toContain('locked-list');
      expect(mocks.promote).not.toHaveBeenCalled();
      expect(mocks.arm).not.toHaveBeenCalled();
      noPostCommitEffects();
    },
  );

  it('refuses enrollment if a participating removal commits after early proofs and before admission', async () => {
    const { state, caller, db } = fixture(false, methods());
    mocks.code.mockImplementationOnce(async () => {
      state.trace.push('code');
      await removeCredential(caller, 'key-0', request);
      return true;
    });
    await expect(enrollAccountSecurity(caller, db, input, request)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.credentials.some((item) => item.id === 'key-0')).toBe(false);
    expect(state.enrolledAt).toBeNull();
    expect(mocks.lock).toHaveBeenCalledTimes(2);
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.proof).not.toHaveBeenCalled();
    noPostCommitEffects();
  });

  it('promotes and arms in one owned transaction and reports admitted rather than early count', async () => {
    const { state, caller, db, tx } = fixture(false);
    state.beforeLock = () => {
      state.credentials = methods(2);
    };
    await enrollAccountSecurity(caller, db, input, request);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.transaction).not.toHaveBeenCalled();
    expect(state.trace.slice(-5)).toEqual(['lock', 'locked-list', 'promote', 'arm', 'commit']);
    expect(mocks.event).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        event: 'advanced_security_enabled',
        detail: expect.objectContaining({
          count: ACCOUNT_SECURITY_POLICY.minimumSignInMethods + 2,
        }),
      }),
    );
    expect(state.enrolledAt).toBe(2);
    expect(state.armed).toBe(true);
  });

  it('rolls back admission when the recovery batch cannot be promoted', async () => {
    const { state, caller, db } = fixture(false);
    mocks.promote.mockResolvedValueOnce(null);
    await expect(enrollAccountSecurity(caller, db, input, request)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('new email code'),
    });
    expect(state.committed).toBe(0);
    expect(state.trace.at(-1)).toBe('rollback');
    expect(mocks.arm).not.toHaveBeenCalled();
    noPostCommitEffects();
  });

  it('rolls promotion back if undo arming fails without postcommit side effects', async () => {
    const { state, caller, db } = fixture(false);
    state.failArm = true;
    await expect(enrollAccountSecurity(caller, db, input, request)).rejects.toThrow('not armed');
    expect(state.enrolledAt).toBeNull();
    expect(state.armed).toBe(false);
    expect(state.trace.slice(-3)).toEqual(['promote', 'arm', 'rollback']);
    noPostCommitEffects();
  });
});

type CompleteMockModule0 = typeof import('@/lib/server/session-revocation');

type RetainedMockModule0 = typeof import('@/lib/logger');

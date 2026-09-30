import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class TicketNotFoundError extends Error {
    constructor() {
      super('No such ticket');
      this.name = 'TicketNotFoundError';
    }
  }
  return {
    TicketNotFoundError,
    requireCsrfToken: vi.fn(),
    withRateLimit: vi.fn(),
    getClerkAuthUser: vi.fn(),
    assertAccountActive: vi.fn(),
    readTicketForStaff: vi.fn(),
    readEnrolledAt: vi.fn(),
    removeSecondFactor: vi.fn(),
    addEmailAddress: vi.fn(),
    getUser: vi.fn(),
    emitIdentitySecurityEvent: vi.fn(),
    setPrimaryEmailAddress: vi.fn(),
    revokeEveryOtherSession: vi.fn(),
    finishIntentRevocation: vi.fn(),
    recordAuditEvent: vi.fn(),
    query: vi.fn(),
  };
});

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(async () => null),
  getIdentityProvider: () => ({
    removeSecondFactor: mocks.removeSecondFactor,
    addEmailAddress: mocks.addEmailAddress,
    getUser: mocks.getUser,
    setPrimaryEmailAddress: mocks.setPrimaryEmailAddress,
  }),
}));
vi.mock('@/lib/services/identity-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/identity-events')>()),
  emitIdentitySecurityEvent: mocks.emitIdentitySecurityEvent,
}));
vi.mock('@/lib/support/tickets/service', () => ({
  EmptyEscalationSummaryError: class EmptyEscalationSummaryError extends Error {},
  InvalidTicketTransitionError: class InvalidTicketTransitionError extends Error {},
  MAX_ESCALATION_SUMMARY_CHARS: vi.fn(),
  MAX_TICKETS_LISTED: vi.fn(),
  MAX_TICKET_MESSAGE_CHARS: vi.fn(),
  MAX_TICKET_SUBJECT_CHARS: vi.fn(),
  TicketClosedError: class TicketClosedError extends Error {},
  escalateTicket: vi.fn(),
  listStaffTickets: vi.fn(),
  listTickets: vi.fn(),
  moveTicket: vi.fn(),
  readEscalations: vi.fn(),
  readTicket: vi.fn(),
  replyToTicket: vi.fn(),
  replyToTicketAsStaff: vi.fn(),
  TicketNotFoundError: mocks.TicketNotFoundError,
  readTicketForStaff: mocks.readTicketForStaff,
  openTicket: vi.fn(),
}));
vi.mock('@/lib/server/account-security/store', () => ({
  armEnrollmentUndo: vi.fn(),
  cancelRecovery: vi.fn(),
  clearEnrollment: vi.fn(),
  completeHandoffAssertion: vi.fn(),
  createHandoff: vi.fn(),
  deleteCredential: vi.fn(),
  finishRecovery: vi.fn(),
  insertCredential: vi.fn(),
  listCredentials: vi.fn(),
  promotePendingRecoveryKeys: vi.fn(),
  readEnrollment: vi.fn(),
  readEnrollmentUndo: vi.fn(),
  readOpenHandoff: vi.fn(),
  readOrganizationControl: vi.fn(),
  readSessionVerification: vi.fn(),
  recordCredentialUse: vi.fn(),
  recordSessionVerification: vi.fn(),
  replaceChallenge: vi.fn(),
  replaceEnrollmentCode: vi.fn(),
  setHandoffChallenge: vi.fn(),
  signInAddressChangedSince: vi.fn(),
  startRecoveryWithKey: vi.fn(),
  storePendingRecoveryKeys: vi.fn(),
  takeChallenge: vi.fn(),
  takeCompletedHandoff: vi.fn(),
  takeEnrollmentCode: vi.fn(),
  undoEnrollment: vi.fn(),
  readEnrolledAt: mocks.readEnrolledAt,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/server/session-revocation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/session-revocation')>()),
  revokeEveryOtherSession: mocks.revokeEveryOtherSession,
  finishIntentRevocation: mocks.finishIntentRevocation,
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/support/handoff/escalation-email', () => ({
  buildEscalationEmail: vi.fn(),
  buildTicketOpenedEmail: vi.fn(),
  sendEscalationEmail: vi.fn(),
  sendTicketOpenedEmail: vi.fn(),
  sendCustomerTicketEmail: vi.fn(),
}));
vi.mock('@/lib/auth/account-status', () => ({
  ACCOUNT_DENIAL_NOTICE: vi.fn(),
  ACCOUNT_STATUSES: vi.fn(),
  LOCKOUT_RECOVERY_PATH: '/auth/reset-password',
  SUSPENSION_APPEAL_PATH: '/appeal',
  effectiveAccountStatus: vi.fn(),
  isAccountStatus: vi.fn(),
  accountAccessDecision: vi.fn(),
}));

import { POST } from '../route';

const TICKET_ID = '44444444-4444-4444-8444-444444444444';
const OPERATOR = 'user_operator';
const CUSTOMER = 'user_customer';

function request(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/support/staff/tickets/${TICKET_ID}/recovery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context(ticketId = TICKET_ID) {
  return { params: Promise.resolve({ ticketId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR, surfaceClass: 'browser' });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.readTicketForStaff.mockResolvedValue({
    ticket: {
      id: TICKET_ID,
      userId: CUSTOMER,
      subject: 'Account recovery request',
      status: 'open',
    },
    replies: [],
  });
  mocks.readEnrolledAt.mockResolvedValue(null);
  mocks.revokeEveryOtherSession.mockResolvedValue({ ended: ['sess_1', 'sess_2'] });
  mocks.finishIntentRevocation.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/support/staff/tickets/[ticketId]/recovery', () => {
  it('refuses a signed-in customer who is not a platform operator, without touching the ticket', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_org_admin', surfaceClass: 'browser' });

    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(404);
    expect(mocks.readTicketForStaff).not.toHaveBeenCalled();
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
  });

  it('refuses an operator id arriving on a developer device token', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR, surfaceClass: 'developer' });

    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(404);
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
  });

  it('answers 401 when there is no session', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized('Sign in'));

    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(401);
    expect(mocks.readTicketForStaff).not.toHaveBeenCalled();
  });

  it('refuses an account with Advanced Account Security on and changes nothing', async () => {
    mocks.readEnrolledAt.mockResolvedValue('2026-09-01T00:00:00.000Z');

    const response = await POST(request({ action: 'remove_second_factor' }), context());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).toContain('Advanced Account Security');
    expect(mocks.readEnrolledAt).toHaveBeenCalledWith(expect.anything(), CUSTOMER);
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
    expect(mocks.revokeEveryOtherSession).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('answers 404 for a ticket id that is not a uuid', async () => {
    const response = await POST(request({ action: 'remove_second_factor' }), context('nope'));

    expect(response.status).toBe(404);
    expect(mocks.readTicketForStaff).not.toHaveBeenCalled();
  });

  it('rejects an unknown action with 400', async () => {
    const response = await POST(request({ action: 'delete_account' }), context());

    expect(response.status).toBe(400);
    expect(mocks.readTicketForStaff).not.toHaveBeenCalled();
  });

  it('answers 404 when the ticket does not exist', async () => {
    mocks.readTicketForStaff.mockRejectedValue(new mocks.TicketNotFoundError());

    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(404);
  });

  it('stops at the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('does not report a finished recovery while an Ask from Siri token may still be live', async () => {
    mocks.finishIntentRevocation.mockResolvedValueOnce(false);
    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(400);
    expect(mocks.finishIntentRevocation).toHaveBeenCalledWith(
      { ended: ['sess_1', 'sess_2'] },
      CUSTOMER,
    );
  });

  it('adds the new sign-in email and makes it primary', async () => {
    mocks.getUser.mockResolvedValue({ emailAddresses: [] });
    mocks.addEmailAddress.mockResolvedValue({ id: 'idn_new', emailAddress: 'new@example.com' });

    const response = await POST(
      request({ action: 'replace_email', email: 'New@Example.com' }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.addEmailAddress).toHaveBeenCalledWith(CUSTOMER, 'new@example.com');
    expect(mocks.setPrimaryEmailAddress).toHaveBeenCalledWith(CUSTOMER, 'idn_new');
    expect(mocks.emitIdentitySecurityEvent).toHaveBeenCalledTimes(1);
  });

  it('reuses the address a failed earlier attempt already added', async () => {
    mocks.getUser.mockResolvedValue({
      emailAddresses: [{ id: 'idn_new', emailAddress: 'new@example.com', verified: true }],
    });

    const response = await POST(
      request({ action: 'replace_email', email: 'new@example.com' }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.addEmailAddress).not.toHaveBeenCalled();
    expect(mocks.setPrimaryEmailAddress).toHaveBeenCalledWith(CUSTOMER, 'idn_new');
    expect(mocks.emitIdentitySecurityEvent).not.toHaveBeenCalled();
  });

  it('removes the second factor for an operator, ends sessions and audits under the operator', async () => {
    const response = await POST(request({ action: 'remove_second_factor' }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessionsEnded: 2 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.readTicketForStaff).toHaveBeenCalledWith(TICKET_ID, OPERATOR);
    expect(mocks.removeSecondFactor).toHaveBeenCalledWith(CUSTOMER);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        eventType: 'account_recovery_completed',
        detail: expect.objectContaining({ resourceId: CUSTOMER }),
      }),
    );
  });
});

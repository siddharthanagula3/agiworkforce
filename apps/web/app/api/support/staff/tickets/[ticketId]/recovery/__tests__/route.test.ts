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
    setPrimaryEmailAddress: vi.fn(),
    revokeEveryOtherSession: vi.fn(),
    recordAuditEvent: vi.fn(),
    query: vi.fn(),
  };
});

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityUser: vi.fn(async () => null),
  getIdentityProvider: () => ({
    removeSecondFactor: mocks.removeSecondFactor,
    addEmailAddress: mocks.addEmailAddress,
    setPrimaryEmailAddress: mocks.setPrimaryEmailAddress,
  }),
}));
vi.mock('@/lib/support/tickets/service', () => ({
  TicketNotFoundError: mocks.TicketNotFoundError,
  readTicketForStaff: mocks.readTicketForStaff,
  openTicket: vi.fn(),
}));
vi.mock('@/lib/server/account-security/store', () => ({ readEnrolledAt: mocks.readEnrolledAt }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/server/session-revocation', () => ({
  revokeEveryOtherSession: mocks.revokeEveryOtherSession,
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/support/handoff/escalation-email', () => ({ sendCustomerTicketEmail: vi.fn() }));
vi.mock('@/lib/auth/account-status', () => ({ accountAccessDecision: vi.fn() }));

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  caller: { current: { userId: 'user_operator' } as Record<string, unknown> },
  assertAccountActive: vi.fn(async () => undefined),
  requireCsrfToken: vi.fn(async () => null as unknown),
  withRateLimit: vi.fn(async () => null as unknown),
  recordAuditEvent: vi.fn(async () => undefined),
  listStaffTickets: vi.fn(),
  readTicketForStaff: vi.fn(),
  replyToTicketAsStaff: vi.fn(),
}));

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: async () => mocks.caller.current,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/support/tickets/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/support/tickets/service')>()),
  listStaffTickets: mocks.listStaffTickets,
  readTicketForStaff: mocks.readTicketForStaff,
  replyToTicketAsStaff: mocks.replyToTicketAsStaff,
}));

import { NextRequest } from 'next/server';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { TicketClosedError } from '@/lib/support/tickets/service';
import { GET as listRoute } from '../route';
import { GET as readRoute, POST as replyRoute } from '../[ticketId]/route';

const OPERATOR = 'user_operator';
const CUSTOMER = 'user_customer';
const TICKET_ID = '0b4a4c1e-6f3b-4c0a-9f36-6b3e1f2a7c55';
const BASE = 'https://agiworkforce.com/api/support/staff/tickets';

const TICKET = {
  id: TICKET_ID,
  subject: 'Export never arrives',
  message: 'No email came.',
  status: 'in_progress',
  priority: 'normal',
  supportTier: null,
  handoffSessionId: null,
  diagnostics: null,
  createdAt: '2026-09-21T09:00:00.000Z',
  updatedAt: '2026-09-21T09:05:00.000Z',
  resolvedAt: null,
  userId: CUSTOMER,
  email: 'customer@example.com',
};
const THREAD = {
  ticket: TICKET,
  replies: [
    {
      id: 'reply-1',
      ticketId: TICKET_ID,
      message: 'Re-queued.',
      isStaff: true,
      createdAt: '2026-09-21T09:05:00.000Z',
    },
  ],
};

const context = (ticketId = TICKET_ID) => ({ params: Promise.resolve({ ticketId }) });

function reply(body: unknown, ticketId = TICKET_ID): NextRequest {
  return new NextRequest(`${BASE}/${ticketId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('staff support ticket routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, OPERATOR);
    mocks.caller.current = { userId: OPERATOR };
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.listStaffTickets.mockResolvedValue({ tickets: [TICKET], nextOffset: null });
    mocks.readTicketForStaff.mockResolvedValue(THREAD);
    mocks.replyToTicketAsStaff.mockResolvedValue(THREAD);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('for anyone who is not a platform operator', () => {
    beforeEach(() => {
      mocks.caller.current = { userId: CUSTOMER };
    });

    it('answers 404 to the queue and never reads it', async () => {
      const response = await listRoute(new NextRequest(BASE));

      expect(response.status).toBe(404);
      expect(mocks.listStaffTickets).not.toHaveBeenCalled();
    });

    it('answers 404 to a thread and never reads it', async () => {
      const response = await readRoute(new NextRequest(`${BASE}/${TICKET_ID}`), context());

      expect(response.status).toBe(404);
      expect(mocks.readTicketForStaff).not.toHaveBeenCalled();
    });

    it('answers 404 to a reply and stores nothing', async () => {
      const response = await replyRoute(reply({ reply: 'Resolved.', resolve: true }), context());

      expect(response.status).toBe(404);
      expect(mocks.replyToTicketAsStaff).not.toHaveBeenCalled();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });

    it('answers 404 to an operator id carried by a developer token', async () => {
      mocks.caller.current = { userId: OPERATOR, surfaceClass: 'developer' };

      const response = await replyRoute(reply({ reply: 'Resolved.' }), context());

      expect(response.status).toBe(404);
      expect(mocks.replyToTicketAsStaff).not.toHaveBeenCalled();
    });

    it('answers 404 to everyone when the operator allowlist is unset', async () => {
      mocks.caller.current = { userId: OPERATOR };
      vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, '');

      const response = await listRoute(new NextRequest(BASE));

      expect(response.status).toBe(404);
      expect(mocks.listStaffTickets).not.toHaveBeenCalled();
    });
  });

  it('lists the queue for an operator and records the access', async () => {
    const response = await listRoute(new NextRequest(`${BASE}?offset=25`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tickets: [TICKET], nextOffset: null });
    expect(mocks.listStaffTickets).toHaveBeenCalledWith({ staffUserId: OPERATOR, offset: 25 });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        eventType: 'data_accessed',
        detail: expect.objectContaining({ resourceType: 'support_ticket', status: 'listed' }),
      }),
    );
  });

  it('refuses an offset that is not a whole number', async () => {
    const response = await listRoute(new NextRequest(`${BASE}?offset=-3`));

    expect(response.status).toBe(400);
    expect(mocks.listStaffTickets).not.toHaveBeenCalled();
  });

  it('reads a thread as the operator and records whose ticket it was', async () => {
    const response = await readRoute(new NextRequest(`${BASE}/${TICKET_ID}`), context());

    expect(response.status).toBe(200);
    expect(mocks.readTicketForStaff).toHaveBeenCalledWith(TICKET_ID, OPERATOR);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          resourceId: TICKET_ID,
          targetUserId: CUSTOMER,
          status: 'read',
        }),
      }),
    );
  });

  it('stores a reply as the operator who wrote it, and records it', async () => {
    const response = await replyRoute(
      reply({ reply: '  Fixed on our side.  ', resolve: true }),
      context(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(THREAD);
    expect(mocks.replyToTicketAsStaff).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      staffUserId: OPERATOR,
      message: 'Fixed on our side.',
      resolve: true,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        eventType: 'data_accessed',
        detail: expect.objectContaining({ targetUserId: CUSTOMER, status: 'replied' }),
      }),
    );
  });

  it('leaves the status alone unless the operator asks to resolve', async () => {
    await replyRoute(reply({ reply: 'Which workspace?' }), context());

    expect(mocks.replyToTicketAsStaff).toHaveBeenCalledWith(
      expect.objectContaining({ resolve: false }),
    );
  });

  it('stops at CSRF before writing anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await replyRoute(reply({ reply: 'x' }), context());

    expect(response.status).toBe(403);
    expect(mocks.replyToTicketAsStaff).not.toHaveBeenCalled();
  });

  it('refuses an empty reply before it reaches the service', async () => {
    const response = await replyRoute(reply({ reply: '   ' }), context());

    expect(response.status).toBe(400);
    expect(mocks.replyToTicketAsStaff).not.toHaveBeenCalled();
  });

  it('answers 404 for a ticket id that is not an id', async () => {
    const response = await replyRoute(
      reply({ reply: 'x' }, 'not-a-ticket'),
      context('not-a-ticket'),
    );

    expect(response.status).toBe(404);
    expect(mocks.replyToTicketAsStaff).not.toHaveBeenCalled();
  });

  it('tells the operator a closed ticket takes no replies', async () => {
    mocks.replyToTicketAsStaff.mockRejectedValue(new TicketClosedError());

    const response = await replyRoute(reply({ reply: 'Late answer.' }), context());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).toContain('This ticket is closed, so it takes no more replies.');
  });
});

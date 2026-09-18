import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  requireCsrfToken: vi.fn(async () => null as unknown),
  withRateLimit: vi.fn(async () => null as unknown),
  escalateTicket: vi.fn(),
  readEscalations: vi.fn(),
}));

vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/support/tickets/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/support/tickets/service')>(
    '@/lib/support/tickets/service',
  );
  return {
    ...actual,
    escalateTicket: mocks.escalateTicket,
    readEscalations: mocks.readEscalations,
  };
});

import { GET, POST } from '../[ticketId]/escalate/route';
import { TicketClosedError, TicketNotFoundError } from '@/lib/support/tickets/service';
import { createError } from '@/lib/errors';

const TICKET_ID = '0b4a4c1e-6f3b-4c0a-9f36-6b3e1f2a7c55';
const ESCALATION = {
  id: 'esc_1',
  ticketId: TICKET_ID,
  referenceId: 'ESC-1',
  severity: 'p1',
  summary: 'Enterprise tenant cannot sign in',
  escalatedByUserId: 'user_ops',
  tracker: 'on-call',
  pagedAt: '2026-09-18T09:00:00.000Z',
  pageOutcome: 'paged',
  responders: ['oncall@example.com'],
  resolvedAt: null,
  createdAt: '2026-09-18T09:00:00.000Z',
};

function post(body: unknown): Request {
  return new Request(`https://agiworkforce.com/api/support/tickets/${TICKET_ID}/escalate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ ticketId: TICKET_ID }) };

describe('support ticket escalation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_ops' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.escalateTicket.mockResolvedValue(ESCALATION);
    mocks.readEscalations.mockResolvedValue([ESCALATION]);
  });

  it('answers 404 to anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));
    const response = await POST(post({ summary: 'x' }) as never, context);
    expect(response.status).toBe(404);
    expect(mocks.escalateTicket).not.toHaveBeenCalled();
  });

  it('escalates as the operator who asked and answers 201', async () => {
    const response = await POST(
      post({ summary: 'Enterprise tenant cannot sign in', tracker: 'on-call' }) as never,
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.escalateTicket).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      escalatedByUserId: 'user_ops',
      summary: 'Enterprise tenant cannot sign in',
      tracker: 'on-call',
    });
    await expect(response.json()).resolves.toEqual({ escalation: ESCALATION });
  });

  it('refuses an unknown tracker before it reaches the service', async () => {
    const response = await POST(post({ summary: 'x', tracker: 'slack' }) as never, context);
    expect(response.status).toBe(400);
    expect(mocks.escalateTicket).not.toHaveBeenCalled();
  });

  it('stops at CSRF before writing anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(post({ summary: 'x' }) as never, context);
    expect(response.status).toBe(403);
    expect(mocks.escalateTicket).not.toHaveBeenCalled();
  });

  it('translates service refusals into client errors', async () => {
    mocks.escalateTicket.mockRejectedValueOnce(new TicketNotFoundError());
    expect((await POST(post({ summary: 'x' }) as never, context)).status).toBe(404);
    mocks.escalateTicket.mockRejectedValueOnce(new TicketClosedError());
    expect((await POST(post({ summary: 'x' }) as never, context)).status).toBe(400);
  });

  it('lists a ticket escalations for an operator', async () => {
    const response = await GET(
      new Request(`https://agiworkforce.com/api/support/tickets/${TICKET_ID}/escalate`) as never,
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ escalations: [ESCALATION] });
    expect(mocks.readEscalations).toHaveBeenCalledWith(TICKET_ID);
  });
});

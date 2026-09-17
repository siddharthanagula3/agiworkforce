import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  requireCsrfToken: vi.fn(async () => null as unknown),
  withRateLimit: vi.fn(async () => null as unknown),
  openTicket: vi.fn(),
  listTickets: vi.fn(),
  readTicket: vi.fn(),
  replyToTicket: vi.fn(),
  moveTicket: vi.fn(),
  normalizeDiagnostics: vi.fn(() => null),
}));

vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/support/diagnostics/schema', () => ({
  normalizeDiagnostics: mocks.normalizeDiagnostics,
}));
vi.mock('@/lib/support/tickets/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/support/tickets/service')>(
    '@/lib/support/tickets/service',
  );
  return {
    ...actual,
    openTicket: mocks.openTicket,
    listTickets: mocks.listTickets,
    readTicket: mocks.readTicket,
    replyToTicket: mocks.replyToTicket,
    moveTicket: mocks.moveTicket,
  };
});

import { GET as listTicketsRoute, POST as createTicketRoute } from '../route';
import { GET as readTicketRoute, PATCH as patchTicketRoute } from '../[ticketId]/route';
import { TicketClosedError, TicketNotFoundError } from '@/lib/support/tickets/service';

const TICKET = {
  id: '0b4a4c1e-6f3b-4c0a-9f36-6b3e1f2a7c55',
  subject: 'Invoice doubled',
  status: 'open',
  priority: 'normal',
};

function post(body: unknown): Request {
  return new Request('https://agiworkforce.com/api/support/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown): Request {
  return new Request(`https://agiworkforce.com/api/support/tickets/${TICKET.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ ticketId: TICKET.id }) };

describe('support ticket routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_1', email: 'a@example.com' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.listTickets.mockResolvedValue([TICKET]);
    mocks.openTicket.mockResolvedValue(TICKET);
    mocks.readTicket.mockResolvedValue({ ticket: TICKET, replies: [] });
    mocks.normalizeDiagnostics.mockReturnValue(null);
  });

  it('lists only the caller own tickets', async () => {
    const response = await listTicketsRoute(
      new Request('https://agiworkforce.com/api/support/tickets') as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.listTickets).toHaveBeenCalledWith('user_1');
  });

  it('answers 201 with the created ticket', async () => {
    const response = await createTicketRoute(
      post({ subject: 'Invoice doubled', message: 'twice what it should be' }) as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ticket: TICKET });
  });

  it('refuses a body with no message before it reaches the service', async () => {
    const response = await createTicketRoute(post({ subject: 'Invoice doubled' }) as never);

    expect(response.status).toBe(400);
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('stops at CSRF before writing anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await createTicketRoute(post({ subject: 'a', message: 'b' }) as never);

    expect(response.status).toBe(403);
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  /**
   * A client can send anything under `diagnostics`. The route must not hand it
   * to the service unvalidated, whatever the collector claims to have done.
   */
  it('validates a diagnostics bundle rather than passing it through', async () => {
    await createTicketRoute(
      post({ subject: 'a', message: 'b', diagnostics: { surface: 'toaster' } }) as never,
    );

    const call = mocks.normalizeDiagnostics.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    const [raw, serverFacts] = call;
    expect(raw).toEqual({ surface: 'toaster' });
    // The build and the environment are server facts; a browser that guessed at
    // them would report the guess, so the route supplies them.
    expect(Object.keys(serverFacts).sort()).toEqual(['deployEnv', 'releaseSha']);
    const passed = mocks.openTicket.mock.calls[0]?.[0] as { diagnostics: unknown };
    expect(passed.diagnostics).toBeNull();
  });

  it('answers 404 for a ticket that is not the caller own', async () => {
    mocks.readTicket.mockRejectedValue(new TicketNotFoundError());

    const response = await readTicketRoute(
      new Request(`https://agiworkforce.com/api/support/tickets/${TICKET.id}`) as never,
      context as never,
    );

    expect(response.status).toBe(404);
  });

  it('tells a caller what to do instead when the ticket is closed', async () => {
    mocks.replyToTicket.mockRejectedValue(new TicketClosedError());

    const response = await patchTicketRoute(
      patch({ reply: 'still broken' }) as never,
      context as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/Raise a new one/u);
  });

  it('refuses a patch that sends both a status and a reply', async () => {
    const response = await patchTicketRoute(
      patch({ status: 'closed', reply: 'and also this' }) as never,
      context as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.moveTicket).not.toHaveBeenCalled();
    expect(mocks.replyToTicket).not.toHaveBeenCalled();
  });

  it('moves a ticket when the patch carries a status alone', async () => {
    mocks.moveTicket.mockResolvedValue({ ...TICKET, status: 'closed' });

    const response = await patchTicketRoute(patch({ status: 'closed' }) as never, context as never);

    expect(response.status).toBe(200);
    expect(mocks.moveTicket).toHaveBeenCalledWith({
      ticketId: TICKET.id,
      userId: 'user_1',
      to: 'closed',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

import SupportTicketQueuePanel from './SupportTicketQueuePanel';

const TICKET = {
  id: '0b4a4c1e-6f3b-4c0a-9f36-6b3e1f2a7c55',
  subject: 'Export never arrives',
  message: 'I asked for an export three days ago and no email came.',
  status: 'open',
  priority: 'high',
  supportTier: 'gold',
  handoffSessionId: null,
  diagnostics: null,
  createdAt: '2026-09-21T09:00:00.000Z',
  updatedAt: '2026-09-21T09:00:00.000Z',
  resolvedAt: null,
  userId: 'user_customer',
  email: 'customer@example.com',
};

const CUSTOMER_REPLY = {
  id: 'reply-1',
  ticketId: TICKET.id,
  message: 'Still nothing this morning.',
  isStaff: false,
  createdAt: '2026-09-21T09:30:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function call(index: number): { url: string; init: RequestInit } {
  const [url, init] = mocks.fetch.mock.calls[index] ?? [];
  return { url: String(url), init: (init ?? {}) as RequestInit };
}

describe('SupportTicketQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading the queue before the list settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<SupportTicketQueuePanel />);

    expect(screen.getByText('Reading the ticket queue…')).toBeInTheDocument();
  });

  it('says so when no ticket is waiting', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ tickets: [], nextOffset: null }));
    render(<SupportTicketQueuePanel />);

    expect(await screen.findByText(/No ticket is waiting/)).toBeInTheDocument();
    expect(call(0).url).toBe('/api/support/staff/tickets?offset=0');
  });

  it('shows a failed load as an alert that can be retried', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ error: { message: 'Not found.' } }, 404));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    render(<SupportTicketQueuePanel />);

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /Export never arrives/ })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an answer without a ticket list as a failed load, not an empty queue', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({}));
    render(<SupportTicketQueuePanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The ticket queue could not be loaded.',
    );
    expect(screen.queryByText(/No ticket is waiting/)).not.toBeInTheDocument();
  });

  it('lists each ticket with its priority, severity and support tier', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    render(<SupportTicketQueuePanel />);

    const row = await screen.findByRole('button', { name: /Export never arrives/ });
    expect(row).toHaveTextContent('high (P1, gold)');
    expect(row).toHaveTextContent('Open');
    expect(screen.queryByRole('button', { name: 'Show older tickets' })).not.toBeInTheDocument();
  });

  it('pages to older tickets from the offset the queue returned', async () => {
    const user = userEvent.setup();
    const older = { ...TICKET, id: '1b4a4c1e-6f3b-4c0a-9f36-6b3e1f2a7c55', subject: 'Older one' };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: 25 }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [older], nextOffset: null }));
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: 'Show older tickets' }));

    expect(await screen.findByRole('button', { name: /Older one/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Export never arrives/ })).toBeVisible();
    expect(call(1).url).toBe('/api/support/staff/tickets?offset=25');
    expect(screen.queryByRole('button', { name: 'Show older tickets' })).not.toBeInTheDocument();
  });

  it('opens a thread with who raised it and what they said since', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [CUSTOMER_REPLY] }));
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));

    expect(await screen.findByText(CUSTOMER_REPLY.message)).toBeVisible();
    expect(screen.getByText('user_customer')).toBeVisible();
    expect(screen.getByText('customer@example.com')).toBeVisible();
    expect(call(1).url).toBe(`/api/support/staff/tickets/${TICKET.id}`);
  });

  it('shows the diagnostics the ticket carries, and says when it carries none', async () => {
    const user = userEvent.setup();
    const diagnosed = {
      ...TICKET,
      diagnostics: {
        collectedAt: '2026-09-21T08:59:00.000Z',
        surface: 'web',
        appVersion: null,
        releaseSha: 'abc1234',
        deployEnv: 'production',
        platform: 'MacIntel',
        locale: 'en-US',
        timeZone: 'America/Chicago',
        viewport: { width: 1440, height: 900 },
        online: true,
        pagePath: '/settings/account',
        conversationId: null,
        recentEvents: [
          { at: '2026-09-21T08:58:00.000Z', kind: 'request_failed', message: 'export 504' },
        ],
      },
    };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [diagnosed], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: diagnosed, replies: [] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.click(await screen.findByText('Diagnostics attached to the ticket'));

    expect(screen.getByText(/release: abc1234/)).toBeVisible();
    expect(screen.getByText(/\[request_failed\] export 504/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Back to the queue' }));
    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));

    expect(await screen.findByText('No diagnostics were attached to this ticket.')).toBeVisible();
  });

  it('sends a reply with the CSRF token and says where the customer reads it', async () => {
    const user = userEvent.setup();
    const answered = {
      ticket: { ...TICKET, status: 'resolved' },
      replies: [
        CUSTOMER_REPLY,
        { ...CUSTOMER_REPLY, id: 'reply-2', isStaff: true, message: 'Re-queued, fixed.' },
      ],
    };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [CUSTOMER_REPLY] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse(answered, 201));
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Reply to the customer' }),
      'Re-queued, fixed.',
    );
    await user.click(screen.getByRole('checkbox', { name: /Mark resolved/ }));
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(await screen.findByText('Re-queued, fixed.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('it is not emailed to them');
    expect(screen.getByText('Resolved')).toBeVisible();
    const { url, init } = call(2);
    expect(url).toBe(`/api/support/staff/tickets/${TICKET.id}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token');
    expect(JSON.parse(String(init.body))).toEqual({ reply: 'Re-queued, fixed.', resolve: true });
  });

  it('keeps the draft and shows why when a reply is refused', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(
        { error: { message: 'This ticket is closed, so it takes no more replies.' } },
        400,
      ),
    );
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    const box = await screen.findByRole('textbox', { name: 'Reply to the customer' });
    await user.type(box, 'Late answer.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This ticket is closed, so it takes no more replies.');
    expect(box).toHaveValue('Late answer.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers no reply form on a closed ticket', async () => {
    const user = userEvent.setup();
    const closed = { ...TICKET, status: 'closed' };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [closed], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: closed, replies: [] }));
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));

    expect(await screen.findByText(/takes no more replies/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument();
  });

  it('goes back to the queue with the ticket as the reply left it', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET], nextOffset: null }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({ ticket: { ...TICKET, status: 'in_progress' }, replies: [] }, 201),
    );
    render(<SupportTicketQueuePanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Reply to the customer' }),
      'On it.',
    );
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    await user.click(screen.getByRole('button', { name: 'Back to the queue' }));

    expect(await screen.findByRole('button', { name: /Export never arrives/ })).toHaveTextContent(
      'In progress',
    );
  });
});

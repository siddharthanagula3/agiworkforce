import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: async () => ({}) }));

import { SupportTicketsPanel } from '../SupportTicketsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const TICKET = {
  id: 'ticket-1',
  subject: 'Export never arrives',
  message: 'I asked for an export three days ago and no email came.',
  status: 'resolved',
  priority: 'normal',
  supportTier: null,
  handoffSessionId: null,
  diagnostics: null,
  createdAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-16T10:00:00.000Z',
  resolvedAt: '2026-09-16T10:00:00.000Z',
};

const REPLY = {
  id: 'reply-1',
  ticketId: TICKET.id,
  message: 'We re-queued it, it should land within the hour.',
  isStaff: true,
  createdAt: '2026-09-16T09:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function urlOf(call: unknown[] | undefined): string {
  return String(call?.[0]);
}

describe('SupportTicketsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading before the list settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<SupportTicketsPanel />);

    expect(screen.getByText('Reading your tickets…')).toBeInTheDocument();
  });

  it('says an account with no tickets has none, rather than staying blank', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ tickets: [] }));
    render(<SupportTicketsPanel />);

    expect(await screen.findByText(/have not raised a ticket yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raise a ticket' })).toBeInTheDocument();
  });

  it('surfaces a failed list as an alert with a way back', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: { message: 'Denied' } }, 403));
    render(<SupportTicketsPanel />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('opens the thread for the ticket that was chosen', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [REPLY] }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));

    expect(await screen.findByText(REPLY.message)).toBeInTheDocument();
    expect(urlOf(mocks.fetch.mock.calls[1])).toBe('/api/support/tickets/ticket-1');
  });

  it('warns that replying to a resolved ticket puts it back in the queue', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));

    expect(await screen.findByText(/puts it back in the queue/)).toBeInTheDocument();
  });

  it('sends a reply and shows the reopened ticket it comes back as', async () => {
    const user = userEvent.setup();
    const reopened = { ...TICKET, status: 'in_progress' };
    const mine = { ...REPLY, id: 'reply-2', isStaff: false, message: 'Still nothing.' };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: reopened, replies: [mine] }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Reply' }), 'Still nothing.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(await screen.findByText('Still nothing.')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();

    const [url, init] = mocks.fetch.mock.calls[2] ?? [];
    expect(String(url)).toBe('/api/support/tickets/ticket-1');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ reply: 'Still nothing.' });
  });

  it('asks before closing a ticket, and names what closing costs', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.click(await screen.findByRole('button', { name: 'Close ticket' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/cannot be reopened/)).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('closes the ticket once the confirmation is accepted', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [TICKET] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: TICKET, replies: [] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: { ...TICKET, status: 'closed' } }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: /Export never arrives/ }));
    await user.click(await screen.findByRole('button', { name: 'Close ticket' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close ticket' }));

    await waitFor(() => expect(screen.getByText('Closed')).toBeInTheDocument());
    expect(JSON.parse(String((mocks.fetch.mock.calls[2]?.[1] as RequestInit).body))).toEqual({
      status: 'closed',
    });
    expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument();
  });

  it('raises a new ticket and opens the thread it was given', async () => {
    const user = userEvent.setup();
    const fresh = { ...TICKET, id: 'ticket-2', subject: 'Billing looks wrong', status: 'open' };
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ tickets: [] }));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: fresh }, 201));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ticket: fresh, replies: [] }));
    render(<SupportTicketsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Raise a ticket' }));
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Billing looks wrong');
    await user.type(screen.getByRole('textbox', { name: 'What happened' }), 'Charged twice.');
    await user.click(screen.getByRole('button', { name: 'Raise ticket' }));

    await waitFor(() =>
      expect(urlOf(mocks.fetch.mock.calls[2])).toBe('/api/support/tickets/ticket-2'),
    );
    const created = JSON.parse(String((mocks.fetch.mock.calls[1]?.[1] as RequestInit).body));
    expect(created.subject).toBe('Billing looks wrong');
    expect(created.diagnostics).toBeTruthy();
  });
});

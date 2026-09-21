import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: vi.fn(async () => []) }) }));

const store = vi.hoisted(() => ({
  insertTicket: vi.fn(),
  listTicketsForUser: vi.fn(),
  getTicketForUser: vi.fn(),
  listRepliesForTicket: vi.fn(),
  insertReply: vi.fn(),
  updateTicketStatus: vi.fn(),
  getTicketForStaff: vi.fn(),
  startTicketForStaff: vi.fn(),
  insertEscalation: vi.fn(),
  listEscalationsForTicket: vi.fn(),
  listStaffQueue: vi.fn(),
  getStaffTicket: vi.fn(),
  listStaffTicketReplies: vi.fn(),
  insertStaffReply: vi.fn(),
  moveTicketAsStaff: vi.fn(),
}));
vi.mock('../store', () => store);

const priority = vi.hoisted(() => ({ resolveSupportPriority: vi.fn() }));
vi.mock('@/lib/support/handoff/priority', () => priority);

import {
  InvalidTicketTransitionError,
  MAX_TICKET_MESSAGE_CHARS,
  TicketClosedError,
  TicketNotFoundError,
  moveTicket,
  openTicket,
  readTicket,
  replyToTicket,
} from '../service';
import { canTransition } from '../types';

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    subject: 'Invoice doubled',
    message: 'My invoice is twice what it should be.',
    status: 'open',
    priority: 'normal',
    supportTier: null,
    handoffSessionId: null,
    diagnostics: null,
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('openTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', '');
    priority.resolveSupportPriority.mockResolvedValue({ priority: 'normal', supportTier: null });
    store.insertTicket.mockImplementation(async (input: Record<string, unknown>) =>
      ticket({ priority: input['priority'], supportTier: input['supportTier'] }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('gives a ticket the same priority the escalation queue would give it', async () => {
    priority.resolveSupportPriority.mockResolvedValue({
      priority: 'urgent',
      supportTier: 'platinum',
    });

    const created = await openTicket({
      userId: 'user_1',
      name: 'a@example.com',
      email: 'a@example.com',
      subject: 'Invoice doubled',
      message: 'My invoice is twice what it should be.',
    });

    expect(created.ticket.priority).toBe('urgent');
    expect(created.ticket.supportTier).toBe('platinum');
  });

  it('redacts a credential a user pasted into the ticket body', async () => {
    await openTicket({
      userId: 'user_1',
      name: 'a@example.com',
      email: 'a@example.com',
      subject: 'Auth broken',
      message: 'It fails with Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123',
    });

    const written = store.insertTicket.mock.calls[0]?.[0] as { message: string };
    expect(written.message).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    expect(written.message).toContain('[redacted:');
  });

  it('truncates an oversized body rather than refusing the ticket', async () => {
    await openTicket({
      userId: 'user_1',
      name: 'a@example.com',
      email: 'a@example.com',
      subject: 'Long',
      message: 'x'.repeat(MAX_TICKET_MESSAGE_CHARS * 2),
    });

    const written = store.insertTicket.mock.calls[0]?.[0] as { message: string };
    expect(written.message.length).toBeLessThanOrEqual(MAX_TICKET_MESSAGE_CHARS + 20);
  });
});

describe('openTicket tells the support team', () => {
  const resend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', resend);
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('AGI_SUPPORT_FROM_EMAIL', 'support@agiworkforce.com');
    vi.stubEnv('AGI_SUPPORT_FALLBACK_EMAIL', 'queue@agiworkforce.com');
    priority.resolveSupportPriority.mockResolvedValue({ priority: 'high', supportTier: 'gold' });
    store.insertTicket.mockImplementation(async (input: Record<string, unknown>) =>
      ticket({
        subject: input['subject'],
        message: input['message'],
        priority: input['priority'],
        supportTier: input['supportTier'],
      }),
    );
    resend.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-1' }),
      text: async () => '',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function open(message = 'My invoice is twice what it should be.') {
    return openTicket({
      userId: 'user_1',
      name: 'a@example.com',
      email: 'a@example.com',
      subject: 'Invoice doubled',
      message,
    });
  }

  function sentMail(): { to: string[]; subject: string; text: string } {
    const init = resend.mock.calls[0]?.[1] as RequestInit;
    return JSON.parse(String(init.body)) as { to: string[]; subject: string; text: string };
  }

  it('emails the support inbox with the ticket, its severity, the account and the queue link', async () => {
    const opened = await open();

    expect(opened.staffNotified).toBe(true);
    expect(resend).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.to).toEqual(['queue@agiworkforce.com']);
    expect(mail.subject).toContain('P1');
    expect(mail.subject).toContain('Invoice doubled');
    expect(mail.text).toContain('Ticket: ticket-1');
    expect(mail.text).toContain('Priority: high (p1)');
    expect(mail.text).toContain('Account: user_1');
    expect(mail.text).toContain('/operator#support');
    expect(mail.text).not.toContain('a@example.com');
  });

  it('never mails a credential the customer pasted', async () => {
    await open('It fails with Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123');

    expect(sentMail().text).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
  });

  it('keeps the ticket and reports it unsent when email is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const opened = await open();

    expect(opened.ticket.id).toBe('ticket-1');
    expect(opened.staffNotified).toBe(false);
    expect(resend).not.toHaveBeenCalled();
  });

  it('keeps the ticket and reports it unsent when the mail provider refuses', async () => {
    resend.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () => 'domain not verified',
    });

    const opened = await open();

    expect(opened.ticket.id).toBe('ticket-1');
    expect(opened.staffNotified).toBe(false);
  });

  it('keeps the ticket when the network drops the mail', async () => {
    resend.mockRejectedValue(new Error('socket hang up'));

    const opened = await open();

    expect(opened.staffNotified).toBe(false);
    expect(store.insertTicket).toHaveBeenCalledTimes(1);
  });
});

describe('canTransition', () => {
  /**
   * A ticket whose status walks backwards makes every time-to-resolution number
   * meaningless, so closed is terminal and reopening is a new ticket.
   */
  it('treats closed as terminal', () => {
    expect(canTransition('closed', 'open')).toBe(false);
    expect(canTransition('closed', 'in_progress')).toBe(false);
  });

  it('lets a resolved ticket close or go back into progress, and nothing else', () => {
    expect(canTransition('resolved', 'closed')).toBe(true);
    expect(canTransition('resolved', 'in_progress')).toBe(true);
    expect(canTransition('resolved', 'open')).toBe(false);
  });

  it('is not a transition when nothing changes', () => {
    expect(canTransition('open', 'open')).toBe(false);
  });
});

describe('readTicket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a ticket that is not the caller own, the same way as one that does not exist', async () => {
    store.getTicketForUser.mockResolvedValue(null);
    await expect(readTicket('ticket-1', 'user_2')).rejects.toBeInstanceOf(TicketNotFoundError);
  });
});

describe('replyToTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.insertReply.mockResolvedValue({
      id: 'reply-1',
      ticketId: 'ticket-1',
      message: 'still broken',
      isStaff: false,
      createdAt: '2026-09-17T11:00:00.000Z',
    });
    store.listRepliesForTicket.mockResolvedValue([]);
  });

  it('refuses a reply on a closed ticket', async () => {
    store.getTicketForUser.mockResolvedValue(ticket({ status: 'closed' }));

    await expect(
      replyToTicket({ ticketId: 'ticket-1', userId: 'user_1', message: 'still broken' }),
    ).rejects.toBeInstanceOf(TicketClosedError);
    expect(store.insertReply).not.toHaveBeenCalled();
  });

  /**
   * Answering "did this fix it?" with "no" has to put the ticket back in the
   * queue. Leaving it resolved hides the person from the queue they need.
   */
  it('reopens a resolved ticket when the customer replies', async () => {
    store.getTicketForUser.mockResolvedValue(ticket({ status: 'resolved' }));
    store.updateTicketStatus.mockResolvedValue(ticket({ status: 'in_progress' }));

    await replyToTicket({ ticketId: 'ticket-1', userId: 'user_1', message: 'still broken' });

    expect(store.updateTicketStatus).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      userId: 'user_1',
      from: 'resolved',
      to: 'in_progress',
    });
  });

  it('does not touch the status of a ticket that is already open', async () => {
    store.getTicketForUser.mockResolvedValue(ticket({ status: 'open' }));

    await replyToTicket({ ticketId: 'ticket-1', userId: 'user_1', message: 'more detail' });

    expect(store.updateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('moveTicket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a transition the lifecycle does not allow', async () => {
    store.getTicketForUser.mockResolvedValue(ticket({ status: 'closed' }));

    await expect(
      moveTicket({ ticketId: 'ticket-1', userId: 'user_1', to: 'open' }),
    ).rejects.toBeInstanceOf(InvalidTicketTransitionError);
    expect(store.updateTicketStatus).not.toHaveBeenCalled();
  });

  /**
   * The store's update carries `and status = $3`. When it matches nothing the
   * row moved under us, which is a race to report rather than one to retry into.
   */
  it('reports a lost race instead of retrying into it', async () => {
    store.getTicketForUser.mockResolvedValue(ticket({ status: 'open' }));
    store.updateTicketStatus.mockResolvedValue(null);

    await expect(
      moveTicket({ ticketId: 'ticket-1', userId: 'user_1', to: 'resolved' }),
    ).rejects.toBeInstanceOf(InvalidTicketTransitionError);
  });
});

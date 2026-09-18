import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));
vi.mock('../store', () => store);

const priority = vi.hoisted(() => ({ resolveSupportPriority: vi.fn() }));
vi.mock('@/lib/support/handoff/priority', () => priority);

const incident = vi.hoisted(() => ({ notifyIncident: vi.fn() }));
vi.mock('@/lib/server/incident/dispatch', () => incident);

import {
  EmptyEscalationSummaryError,
  TicketClosedError,
  TicketNotFoundError,
  escalateTicket,
  readEscalations,
} from '../service';
import { pagesOnCall, severityForPriority } from '../types';

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    subject: 'Every completion fails with 502',
    message: 'Nothing sends since 09:00.',
    status: 'open',
    priority: 'urgent',
    supportTier: 'platinum',
    handoffSessionId: null,
    diagnostics: null,
    createdAt: '2026-09-18T09:10:00.000Z',
    updatedAt: '2026-09-18T09:10:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('severity is read off the ticket, not off the form', () => {
  it('maps every contracted priority onto one severity', () => {
    expect(severityForPriority('urgent')).toBe('p0');
    expect(severityForPriority('high')).toBe('p1');
    expect(severityForPriority('normal')).toBe('p2');
    expect(severityForPriority('low')).toBe('p3');
  });

  it('pages only for p0 and p1', () => {
    expect(pagesOnCall('p0')).toBe(true);
    expect(pagesOnCall('p1')).toBe(true);
    expect(pagesOnCall('p2')).toBe(false);
    expect(pagesOnCall('p3')).toBe(false);
  });
});

describe('escalateTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.getTicketForStaff.mockResolvedValue(ticket());
    store.startTicketForStaff.mockResolvedValue(ticket({ status: 'in_progress' }));
    store.insertEscalation.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'escalation-1',
      resolvedAt: null,
      createdAt: '2026-09-18T09:12:00.000Z',
      ...input,
    }));
    incident.notifyIncident.mockResolvedValue({
      level: 'primary',
      notified: ['oncall-a'],
      delivery: 'delivered',
      paged: 'paged',
      channel: 'paged',
    });
  });

  it('pages on-call for a p0 and records who was told', async () => {
    const escalation = await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Gateway returns 502 for every model on this account.',
    });

    expect(incident.notifyIncident).toHaveBeenCalledTimes(1);
    const notification = incident.notifyIncident.mock.calls[0]![0];
    expect(notification.severity).toBe('critical');
    expect(notification.key).toBe('support-ticket:ticket-1');
    expect(notification.source).toBe('support-ticket-escalation');
    expect(notification.subject).toContain('P0');

    expect(escalation.severity).toBe('p0');
    expect(escalation.tracker).toBe('on-call');
    expect(escalation.pageOutcome).toBe('paged');
    expect(escalation.responders).toEqual(['oncall-a']);
    expect(escalation.pagedAt).not.toBeNull();
    expect(escalation.referenceId).toMatch(/^AGI-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/u);
  });

  it('pages on-call for a p1 at warning severity', async () => {
    store.getTicketForStaff.mockResolvedValue(ticket({ priority: 'high' }));

    const escalation = await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Attachments fail to upload for this workspace only.',
    });

    expect(incident.notifyIncident.mock.calls[0]![0].severity).toBe('warning');
    expect(escalation.severity).toBe('p1');
  });

  it('files a p2 to engineering without waking anyone', async () => {
    store.getTicketForStaff.mockResolvedValue(ticket({ priority: 'normal', supportTier: null }));

    const escalation = await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Export produces a CSV with the wrong column order.',
    });

    expect(incident.notifyIncident).not.toHaveBeenCalled();
    expect(escalation.severity).toBe('p2');
    expect(escalation.tracker).toBe('support-engineering');
    expect(escalation.pagedAt).toBeNull();
    expect(escalation.pageOutcome).toBeNull();
    expect(escalation.responders).toEqual([]);
  });

  it('moves an open ticket into progress so it leaves the unattended queue', async () => {
    await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Gateway returns 502 for every model.',
    });
    expect(store.startTicketForStaff).toHaveBeenCalledWith('ticket-1');
  });

  it('leaves a ticket already in progress alone', async () => {
    store.getTicketForStaff.mockResolvedValue(ticket({ status: 'in_progress' }));
    await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Gateway returns 502 for every model.',
    });
    expect(store.startTicketForStaff).not.toHaveBeenCalled();
  });

  it('redacts a secret pasted into the summary', async () => {
    const escalation = await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Customer pasted sk-abcdefghijklmnopqrstuvwxyz0123456789 into the composer.',
    });
    expect(escalation.summary).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('refuses a ticket that does not exist', async () => {
    store.getTicketForStaff.mockResolvedValue(null);
    await expect(
      escalateTicket({ ticketId: 'nope', escalatedByUserId: 'staff-1', summary: 'x' }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
    expect(store.insertEscalation).not.toHaveBeenCalled();
  });

  it('refuses a closed ticket', async () => {
    store.getTicketForStaff.mockResolvedValue(ticket({ status: 'closed' }));
    await expect(
      escalateTicket({ ticketId: 'ticket-1', escalatedByUserId: 'staff-1', summary: 'x' }),
    ).rejects.toBeInstanceOf(TicketClosedError);
    expect(incident.notifyIncident).not.toHaveBeenCalled();
  });

  it('refuses an escalation with nothing in it', async () => {
    await expect(
      escalateTicket({ ticketId: 'ticket-1', escalatedByUserId: 'staff-1', summary: '   ' }),
    ).rejects.toBeInstanceOf(EmptyEscalationSummaryError);
    expect(store.insertEscalation).not.toHaveBeenCalled();
  });

  it('never claims a page that the dispatcher could not deliver', async () => {
    incident.notifyIncident.mockResolvedValue({
      level: 'primary',
      notified: [],
      delivery: 'undeliverable',
      paged: 'unconfigured',
      channel: 'unconfigured',
    });

    const escalation = await escalateTicket({
      ticketId: 'ticket-1',
      escalatedByUserId: 'staff-1',
      summary: 'Gateway returns 502 for every model.',
    });
    expect(escalation.pageOutcome).toBe('unconfigured');
  });

  it('reads back every escalation raised from a ticket', async () => {
    store.listEscalationsForTicket.mockResolvedValue([{ id: 'escalation-1' }]);
    await expect(readEscalations('ticket-1')).resolves.toEqual([{ id: 'escalation-1' }]);
    expect(store.listEscalationsForTicket).toHaveBeenCalledWith('ticket-1');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Row = Record<string, unknown>;

const tables = vi.hoisted(() => ({
  tickets: [] as Record<string, unknown>[],
  replies: [] as Record<string, unknown>[],
  clock: 0,
  ids: 0,
}));

function nextId(): string {
  tables.ids += 1;
  return `00000000-0000-4000-8000-${String(tables.ids).padStart(12, '0')}`;
}

function nextInstant(): string {
  tables.clock += 1;
  return new Date(Date.UTC(2026, 8, 21, 9, 0, tables.clock)).toISOString();
}

function whereClause(sql: string): string {
  const match = /\bwhere\b([\s\S]*?)(?:\border by\b|\blimit\b|\breturning\b|$)/iu.exec(sql);
  return match?.[1]?.trim() ?? '';
}

function holds(conjunct: string, row: Row, params: unknown[]): boolean {
  const clause = conjunct.trim().replace(/\s+/gu, ' ');
  const allowlisted = /^\$(\d+)::text = any\(\$(\d+)::text\[\]\)$/u.exec(clause);
  if (allowlisted) {
    const actor = params[Number(allowlisted[1]) - 1];
    return (params[Number(allowlisted[2]) - 1] as unknown[]).includes(actor);
  }
  const inList = /^((?:\w+\.)?\w+) = any\(\$(\d+)(?:::text\[\])?\)$/u.exec(clause);
  if (inList) {
    return (params[Number(inList[2]) - 1] as unknown[]).includes(row[inList[1]!]);
  }
  const equals = /^((?:\w+\.)?\w+) = \$(\d+)$/u.exec(clause);
  if (equals) return row[equals[1]!] === params[Number(equals[2]) - 1];
  throw new Error(`The fake database does not understand the predicate "${clause}"`);
}

function matches(sql: string, row: Row, params: unknown[]): boolean {
  const where = whereClause(sql);
  if (!where) return true;
  return where.split(/\band\b/iu).every((conjunct) => holds(conjunct, row, params));
}

function aliased(row: Row, alias: string): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [`${alias}.${key}`, value]));
}

function ticketOf(ticketId: unknown): Row | undefined {
  return tables.tickets.find((ticket) => ticket['id'] === ticketId);
}

function run(sql: string, params: unknown[]): Row[] {
  const statement = sql.replace(/\s+/gu, ' ').trim();

  if (/^insert into public\.support_tickets\b/iu.test(statement)) {
    const at = nextInstant();
    const row: Row = {
      id: nextId(),
      user_id: params[0],
      name: params[1],
      email: params[2],
      subject: params[3],
      message: params[4],
      status: 'open',
      priority: params[5],
      support_tier: params[6],
      handoff_session_id: params[7],
      diagnostics: null,
      created_at: at,
      updated_at: at,
      resolved_at: null,
    };
    tables.tickets.push(row);
    return [row];
  }

  if (/^insert into public\.support_ticket_replies\b/iu.test(statement)) {
    const shape =
      /^insert into public\.support_ticket_replies \(([^)]*)\) select (.*?) (?:from|where) /iu.exec(
        statement,
      );
    const gate =
      /where exists \( select 1 from public\.support_tickets t where (.*) \) returning\b/iu.exec(
        statement,
      ) ?? /from public\.support_tickets t where (.*) returning\b/iu.exec(statement);
    if (!shape?.[1] || !shape[2] || !gate?.[1]) {
      throw new Error(`The fake database does not handle: ${statement}`);
    }
    const predicate = `select 1 where ${gate[1]}`;
    const owner = tables.tickets.find((ticket) =>
      matches(predicate, { ...ticket, ...aliased(ticket, 't') }, params),
    );
    if (!owner) return [];
    const columns = shape[1].split(',').map((column) => column.trim());
    const values = shape[2].split(',').map((token) => {
      const value = token.trim();
      const parameter = /^\$(\d+)$/u.exec(value);
      if (parameter) return params[Number(parameter[1]) - 1];
      const column = /^t\.(\w+)$/u.exec(value);
      if (column) return owner[column[1]!];
      if (value === 'true' || value === 'false') return value === 'true';
      throw new Error(`The fake database does not handle the value ${value}`);
    });
    const row: Row = {
      id: nextId(),
      ...Object.fromEntries(columns.map((column, index) => [column, values[index]])),
      created_at: nextInstant(),
    };
    tables.replies.push(row);
    return [row];
  }

  if (
    /^select .* from public\.support_ticket_replies r join public\.support_tickets t\b/iu.test(
      statement,
    )
  ) {
    return tables.replies
      .map((reply) => ({ reply, ticket: ticketOf(reply['ticket_id']) }))
      .filter(({ reply, ticket }) =>
        ticket
          ? matches(statement, { ...aliased(reply, 'r'), ...aliased(ticket, 't') }, params)
          : false,
      )
      .map(({ reply }) => reply);
  }

  if (/^select .* from public\.support_ticket_replies r\b/iu.test(statement)) {
    return tables.replies.filter((reply) => matches(statement, aliased(reply, 'r'), params));
  }

  if (/^select .* from public\.support_tickets\b/iu.test(statement)) {
    const found = tables.tickets
      .filter((ticket) => matches(statement, ticket, params))
      .sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])));
    const page = /\blimit \$(\d+) offset \$(\d+)/iu.exec(statement);
    if (!page) return found;
    const offset = Number(params[Number(page[2]) - 1]);
    return found.slice(offset, offset + Number(params[Number(page[1]) - 1]));
  }

  if (/^update public\.support_tickets set status = \$(\d+)/iu.test(statement)) {
    const target = Number(/set status = \$(\d+)/iu.exec(statement)![1]) - 1;
    const row = tables.tickets.find((ticket) => matches(statement, ticket, params));
    if (!row) return [];
    const to = params[target];
    row['status'] = to;
    row['updated_at'] = nextInstant();
    row['resolved_at'] = to === 'resolved' || to === 'closed' ? row['updated_at'] : null;
    return [row];
  }

  throw new Error(`The fake database does not handle: ${statement}`);
}

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: async (sql: string, params: unknown[] = []) => run(sql, params) }),
}));

const priority = vi.hoisted(() => ({ resolveSupportPriority: vi.fn() }));
vi.mock('@/lib/support/handoff/priority', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/support/handoff/priority')>()),
  resolveSupportPriority: priority.resolveSupportPriority,
}));

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { insertStaffReply, listStaffQueue } from '../store';
import {
  TicketClosedError,
  TicketNotFoundError,
  listStaffTickets,
  moveTicket,
  openTicket,
  readTicket,
  readTicketForStaff,
  replyToTicket,
  replyToTicketAsStaff,
} from '../service';
import { STAFF_QUEUE_PAGE_SIZE, STAFF_QUEUE_STATUSES } from '../types';

const CUSTOMER = 'user_customer';
const OPERATOR = 'user_operator';

async function raise(subject = 'Export never arrives', userId = CUSTOMER) {
  const opened = await openTicket({
    userId,
    name: 'customer@example.com',
    email: 'customer@example.com',
    subject,
    message: 'I asked for an export three days ago and no email came.',
  });
  return opened.ticket;
}

describe('the staff ticket path', () => {
  beforeEach(() => {
    tables.tickets.length = 0;
    tables.replies.length = 0;
    tables.clock = 0;
    tables.ids = 0;
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, `someone_else,${OPERATOR}`);
    priority.resolveSupportPriority.mockResolvedValue({ priority: 'normal', supportTier: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('puts an operator reply on the customer own thread, marked as the support team', async () => {
    const ticket = await raise();

    await replyToTicketAsStaff({
      ticketId: ticket.id,
      staffUserId: OPERATOR,
      message: 'We re-queued the export; it lands within the hour.',
      resolve: false,
    });
    const seen = await readTicket(ticket.id, CUSTOMER);

    expect(seen.replies).toHaveLength(1);
    expect(seen.replies[0]).toMatchObject({
      message: 'We re-queued the export; it lands within the hour.',
      isStaff: true,
    });
    expect(seen.ticket.status).toBe('in_progress');
  });

  it('marks the customer ticket resolved when the reply answers it', async () => {
    const ticket = await raise();

    await replyToTicketAsStaff({
      ticketId: ticket.id,
      staffUserId: OPERATOR,
      message: 'Fixed on our side.',
      resolve: true,
    });
    const seen = await readTicket(ticket.id, CUSTOMER);

    expect(seen.ticket.status).toBe('resolved');
    expect(seen.ticket.resolvedAt).not.toBeNull();
  });

  it('keeps the customer and the operator on the same thread in order', async () => {
    const ticket = await raise();

    await replyToTicketAsStaff({
      ticketId: ticket.id,
      staffUserId: OPERATOR,
      message: 'Which workspace?',
      resolve: false,
    });
    await replyToTicket({ ticketId: ticket.id, userId: CUSTOMER, message: 'The personal one.' });
    const staffView = await readTicketForStaff(ticket.id, OPERATOR);

    expect(staffView.ticket.userId).toBe(CUSTOMER);
    expect(staffView.ticket.email).toBe('customer@example.com');
    expect(staffView.replies.map((reply) => [reply.isStaff, reply.message])).toEqual([
      [true, 'Which workspace?'],
      [false, 'The personal one.'],
    ]);
  });

  it('refuses the reply of an id that is not on the operator allowlist', async () => {
    const ticket = await raise();

    await expect(
      replyToTicketAsStaff({
        ticketId: ticket.id,
        staffUserId: CUSTOMER,
        message: 'Resolved, trust me.',
        resolve: true,
      }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
    expect(tables.replies).toHaveLength(0);
    expect((await readTicket(ticket.id, CUSTOMER)).ticket.status).toBe('open');
  });

  it('refuses the same write at the SQL, for a caller that skipped the service', async () => {
    const ticket = await raise();

    const stored = await insertStaffReply({
      ticketId: ticket.id,
      staffUserId: CUSTOMER,
      message: 'Written without the operator check.',
    });

    expect(stored).toBeNull();
    expect(tables.replies).toHaveLength(0);
  });

  it('shows nobody the queue when the operator allowlist is unset', async () => {
    await raise();
    vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, '');

    const rows = await listStaffQueue({
      staffUserId: OPERATOR,
      statuses: STAFF_QUEUE_STATUSES,
      limit: 10,
      offset: 0,
    });

    expect(rows).toEqual([]);
  });

  it('refuses a reply on a closed ticket', async () => {
    const ticket = await raise();
    await moveTicket({ ticketId: ticket.id, userId: CUSTOMER, to: 'closed' });

    await expect(
      replyToTicketAsStaff({
        ticketId: ticket.id,
        staffUserId: OPERATOR,
        message: 'Late answer.',
        resolve: false,
      }),
    ).rejects.toBeInstanceOf(TicketClosedError);
    expect(tables.replies).toHaveLength(0);
  });

  it('lists what is waiting on the team newest first, a page at a time', async () => {
    const raised = [];
    for (let index = 0; index < STAFF_QUEUE_PAGE_SIZE + 2; index += 1) {
      raised.push(await raise(`Ticket ${index}`, `user_${index}`));
    }
    const answered = raised[raised.length - 1]!;
    await replyToTicketAsStaff({
      ticketId: answered.id,
      staffUserId: OPERATOR,
      message: 'Done.',
      resolve: true,
    });

    const first = await listStaffTickets({ staffUserId: OPERATOR, offset: 0 });
    const second = await listStaffTickets({
      staffUserId: OPERATOR,
      offset: first.nextOffset ?? -1,
    });

    expect(first.tickets).toHaveLength(STAFF_QUEUE_PAGE_SIZE);
    expect(first.tickets[0]?.subject).toBe(`Ticket ${STAFF_QUEUE_PAGE_SIZE}`);
    expect(first.nextOffset).toBe(STAFF_QUEUE_PAGE_SIZE);
    expect(second.tickets.map((ticket) => ticket.subject)).toEqual(['Ticket 0']);
    expect(second.nextOffset).toBeNull();
    const listed = [...first.tickets, ...second.tickets].map((ticket) => ticket.id);
    expect(listed).not.toContain(answered.id);
  });
});

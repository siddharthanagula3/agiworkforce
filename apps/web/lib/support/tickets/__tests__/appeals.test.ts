import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getNeonDb: () => ({ query: vi.fn(async () => []) }),
}));
vi.mock('@/lib/support/handoff/escalation-email', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  sendCustomerTicketEmail: vi.fn(),
}));

const service = vi.hoisted(() => ({
  findLatestTicket: vi.fn(),
  openTicket: vi.fn(),
  readTicket: vi.fn(),
  replyToTicket: vi.fn(),
}));
vi.mock('../service', () => service);

import { APPEAL_TICKET_SUBJECT } from '@agiworkforce/cloud-contracts/support';
import { readLatestAppeal } from '../appeals';

const APPEAL = { id: 'appeal-1', subject: APPEAL_TICKET_SUBJECT, status: 'resolved' };

describe('readLatestAppeal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('finds the appeal by its own subject rather than inside a window of recent tickets', async () => {
    service.findLatestTicket.mockResolvedValue(APPEAL);
    service.readTicket.mockResolvedValue({ ticket: APPEAL, replies: [] });

    await expect(readLatestAppeal('user_1')).resolves.toEqual({ ticket: APPEAL, replies: [] });
    expect(service.findLatestTicket).toHaveBeenCalledWith('user_1', APPEAL_TICKET_SUBJECT);
    expect(service.readTicket).toHaveBeenCalledWith('appeal-1', 'user_1');
  });

  it('says there is no appeal when the account never raised one', async () => {
    service.findLatestTicket.mockResolvedValue(null);

    await expect(readLatestAppeal('user_1')).resolves.toBeNull();
    expect(service.readTicket).not.toHaveBeenCalled();
  });
});

type ImportedModule2 = typeof import('@/lib/logger');
type ImportedModule1 = typeof import('@/lib/server/neon-db');
type ImportedModule0 = typeof import('@/lib/support/handoff/escalation-email');

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: mocks.query }),
}));

import { readOpenDataRightsRequests } from './data-rights-requests';

interface Row {
  reference: string;
  user_id: string | null;
  contact_email: string;
  request_type: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

function row(reference: string, createdAt: string): Row {
  return {
    reference,
    user_id: null,
    contact_email: 'subject@example.test',
    request_type: 'access',
    details: null,
    status: 'received',
    created_at: createdAt,
    resolved_at: null,
  };
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe('the open data rights queue', () => {
  it('gives every open request a statutory due date', async () => {
    mocks.query.mockResolvedValue([row('DPDP-AAAAAAAAAA', '2026-01-15T00:00:00.000Z')]);

    const [request] = await readOpenDataRightsRequests(100, new Date('2026-02-05T00:00:00.000Z'));

    expect(request?.deadline.dueAt).toBe('2026-02-15T00:00:00.000Z');
    expect(request?.deadline.daysRemaining).toBe(10);
    expect(request?.deadline.overdue).toBe(false);
  });

  it('flags a request whose clock has run out', async () => {
    mocks.query.mockResolvedValue([row('DPDP-BBBBBBBBBB', '2026-01-01T00:00:00.000Z')]);

    const [request] = await readOpenDataRightsRequests(100, new Date('2026-03-01T00:00:00.000Z'));

    expect(request?.deadline.overdue).toBe(true);
    expect(request?.deadline.daysRemaining).toBeLessThan(0);
  });

  it('returns the queue oldest due first, whatever order the rows arrive in', async () => {
    mocks.query.mockResolvedValue([
      row('DPDP-NEWEST0000', '2026-03-01T00:00:00.000Z'),
      row('DPDP-OLDEST0000', '2026-01-01T00:00:00.000Z'),
      row('DPDP-MIDDLE0000', '2026-02-01T00:00:00.000Z'),
    ]);

    const queue = await readOpenDataRightsRequests(100, new Date('2026-03-02T00:00:00.000Z'));

    expect(queue.map((request) => request.reference)).toEqual([
      'DPDP-OLDEST0000',
      'DPDP-MIDDLE0000',
      'DPDP-NEWEST0000',
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/neon-db');

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: () => ({ query: mocks.query }),
}));

import {
  DataRightsSubmissionConflictError,
  createDataRightsRequest,
  readOpenDataRightsRequests,
  referenceForSubmission,
} from './data-rights-requests';

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

describe('reading a later window of the open queue', () => {
  it('passes the offset through and orders ties by id so windows do not overlap', async () => {
    mocks.query.mockResolvedValue([]);

    await readOpenDataRightsRequests(100, new Date('2026-03-02T00:00:00.000Z'), 100);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('order by created_at asc, id asc');
    expect(sql).toContain('offset $2');
    expect(params).toEqual([100, 100]);
  });
});

describe('recording a request once per submission', () => {
  const TOKEN = '8c1f6a52-3d0e-4b0a-9a53-6a2f0c1d7e11';
  const input = {
    userId: null,
    contactEmail: 'subject@example.test',
    requestType: 'access' as const,
    details: null,
    submissionToken: TOKEN,
  };

  it('derives the same reference from the same token', () => {
    expect(referenceForSubmission(TOKEN)).toBe(referenceForSubmission(TOKEN));
    expect(referenceForSubmission(TOKEN)).toMatch(/^DPDP-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(referenceForSubmission(TOKEN)).not.toBe(
      referenceForSubmission('11111111-3d0e-4b0a-9a53-6a2f0c1d7e11'),
    );
  });

  it('reports a first write as new', async () => {
    mocks.query.mockResolvedValueOnce([
      row(referenceForSubmission(TOKEN), '2026-03-01T00:00:00.000Z'),
    ]);

    const created = await createDataRightsRequest(input);

    expect(created.replayed).toBe(false);
    expect(mocks.query.mock.calls[0]?.[1]?.[0]).toBe(referenceForSubmission(TOKEN));
  });

  it('returns the stored request instead of inserting a second one on replay', async () => {
    const stored = row(referenceForSubmission(TOKEN), '2026-03-01T00:00:00.000Z');
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);

    const created = await createDataRightsRequest(input);

    expect(created.replayed).toBe(true);
    expect(created.reference).toBe(referenceForSubmission(TOKEN));
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('refuses a token that was used for a different request', async () => {
    const stored = {
      ...row(referenceForSubmission(TOKEN), '2026-03-01T00:00:00.000Z'),
      request_type: 'erasure',
    };
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);

    await expect(createDataRightsRequest(input)).rejects.toBeInstanceOf(
      DataRightsSubmissionConflictError,
    );
  });
});

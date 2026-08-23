import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mockQuery }) }));

import { readOperatorOverview } from '@/features/admin/services/operator-metrics';

const missingTable = () =>
  Object.assign(new Error('relation "public.beta_applications" does not exist'), { code: '42P01' });

beforeEach(() => {
  vi.clearAllMocks();
});

// Every other panel on the operator dashboard answers a question that has
// nothing to do with beta applications. One unapplied migration must not take
// the founder's whole dashboard down.
describe('operator overview tolerates an unmigrated beta table', () => {
  it('still returns the rest of the dashboard', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('beta_applications')) throw missingTable();
      if (sql.includes('users_total')) {
        return [
          {
            users_total: '10',
            users_7: '2',
            users_30: '5',
            feedback_total: '3',
            feedback_7: '1',
          },
        ];
      }
      return [];
    });

    const overview = await readOperatorOverview();

    expect(overview).toBeDefined();
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('beta_applications'));
  });

  it('does not swallow a real database failure as a pending migration', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('beta_applications')) {
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      }
      if (sql.includes('users_total')) {
        return [
          {
            users_total: '10',
            users_7: '2',
            users_30: '5',
            feedback_total: '3',
            feedback_7: '1',
          },
        ];
      }
      return [];
    });

    await expect(readOperatorOverview()).rejects.toThrow('connection terminated');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  failure: null as Error | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/data-region', () => ({ managedCloudDataRegion: () => 'us' }));
vi.mock('../flag-evaluation-service', () => ({
  evaluateFlagsForSubject: async (...args: unknown[]) => {
    state.calls.push(args);
    if (state.failure) throw state.failure;
    return {};
  },
}));

const { readUsagePromotionsOn } = await import('../usage-promotions-gate');

beforeEach(() => {
  state.calls = [];
  state.failure = null;
});

describe('usage promotions switch', () => {
  it('reads the flag failing closed', async () => {
    await readUsagePromotionsOn('user-1', 'pro');
    const [subject, options] = state.calls[0]!;
    expect(subject).toMatchObject({ userId: 'user-1', plan: 'pro' });
    expect(options).toMatchObject({ failClosed: true });
  });

  it('reads off when the flag store cannot be read', async () => {
    state.failure = new Error('override read failed');
    await expect(readUsagePromotionsOn('user-1', 'pro')).resolves.toBe(false);
  });
});

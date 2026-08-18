import { beforeEach, describe, expect, it, vi } from 'vitest';

const navMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

const authMocks = vi.hoisted(() => ({ auth: vi.fn(async () => ({ userId: 'user_1' })) }));

vi.mock('next/navigation', () => navMocks);
vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMocks.auth() }));
vi.mock('./UpgradeOrderScreen', () => ({
  UpgradeOrderScreen: ({ plan, billingInterval }: Record<string, string>) => (
    <div data-testid="order-screen" data-plan={plan} data-interval={billingInterval} />
  ),
}));

import UpgradePlanPage from './page';

function open(plan: string, interval?: string) {
  return UpgradePlanPage({
    params: Promise.resolve({ plan }),
    searchParams: Promise.resolve(interval ? { interval } : {}),
  });
}

describe('/upgrade/[plan] guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.auth.mockResolvedValue({ userId: 'user_1' });
  });

  it('refuses Team rather than rendering an order screen that bills one seat', async () => {
    // Team is priced per seat, and the seat count and interval are chosen on
    // /pricing. This screen has no picker for either, so rendering it would
    // silently sell a single monthly seat.
    await expect(open('team')).rejects.toThrow('REDIRECT:/pricing');
  });

  it('404s a plan that is not on the individual upgrade ladder', async () => {
    await expect(open('bogus')).rejects.toThrow('NOT_FOUND');
  });

  it('sends a signed-out visitor to log in and back to the plan they picked', async () => {
    authMocks.auth.mockResolvedValue({ userId: null } as never);

    await expect(open('max_15x')).rejects.toThrow(
      'REDIRECT:/login?redirectTo=%2Fupgrade%2Fmax_15x',
    );
  });

  it('prices yearly only when the caller asked for it', async () => {
    const yearly = await open('pro', 'yearly');
    expect(yearly.props.children.props.billingInterval).toBe('yearly');

    // An unrecognised interval must fall back to monthly rather than reaching
    // Stripe as an unpriced value.
    const bogus = await open('pro', 'quarterly');
    expect(bogus.props.children.props.billingInterval).toBe('monthly');
  });
});

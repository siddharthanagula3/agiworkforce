import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenBalanceDisplay } from './TokenBalanceDisplay';

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: { id: 'user_1' } }),
}));

vi.mock('@agiworkforce/ui', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => vi.restoreAllMocks());

describe('TokenBalanceDisplay', () => {
  it('shows only percentage and reset information', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        plan_tier: 'pro',
        usage_percentage: 40,
        usage_reset_at: '2026-08-01T00:00:00.000Z',
        period_start: '2026-07-01T00:00:00.000Z',
        period_end: '2026-08-01T00:00:00.000Z',
        subscription_status: 'active',
      }),
    } as Response);

    render(<TokenBalanceDisplay />);

    expect(await screen.findByText('40% used')).toBeTruthy();
    expect(screen.getByText('60% remaining')).toBeTruthy();
    expect(screen.getByText(/resets/i)).toBeTruthy();
    expect(screen.queryByText(/\$6\.00|\$10\.00/)).toBeNull();
    expect(screen.queryByText(/credit balance/i)).toBeNull();
  });
});

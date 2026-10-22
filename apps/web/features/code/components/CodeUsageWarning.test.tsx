import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_USAGE_LIMIT_NEAR_HEADLINE } from '@agiworkforce/types';
import { CODE_COPY } from '../code-surface';
import { CodeUsageWarning } from './CodeComposer';

const push = vi.fn();
const openUpgrade = vi.fn();
let usage: Record<string, unknown> | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/code',
}));

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useManagedUsageSummary: () => ({ usage, loading: false, refresh: vi.fn() }),
}));

vi.mock('@shared/lib/app-commands', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openUpgrade: (navigate: (href: string) => void) => openUpgrade(navigate),
}));

const RESET_AT = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

function summary(weeklyPercent: number, planTier: string) {
  return {
    plan_tier: planTier,
    usage_percentage: 10,
    session_usage_percentage: 10,
    weekly_usage_percentage: weeklyPercent,
    weekly_reset_at: RESET_AT,
    flagship_weekly_usage_percentage: null,
  };
}

describe('CodeUsageWarning', () => {
  beforeEach(() => {
    openUpgrade.mockReset();
    usage = null;
  });

  it('stays hidden while usage is comfortable', () => {
    usage = summary(20, 'pro');
    render(<CodeUsageWarning />);
    expect(screen.queryByTestId('usage-warning-banner')).toBeNull();
  });

  it('warns near the binding limit with its reset time, and Upgrade opens the plan flow', async () => {
    const user = userEvent.setup();
    usage = summary(90, 'pro');
    render(<CodeUsageWarning />);

    const banner = screen.getByTestId('usage-warning-banner');
    expect(banner).toHaveAttribute('data-bucket', 'weekly');
    expect(banner).toHaveTextContent(/Resets/);

    await user.click(screen.getByRole('button', { name: 'Get more usage' }));
    expect(openUpgrade).toHaveBeenCalledTimes(1);
  });

  it('shows a Free plan only the Upgrade action and no meter', () => {
    usage = summary(90, 'free');
    render(<CodeUsageWarning />);

    const banner = screen.getByTestId('usage-warning-banner');
    expect(banner).toHaveTextContent(FREE_USAGE_LIMIT_NEAR_HEADLINE);
    expect(banner).not.toHaveTextContent('%');
    expect(screen.getByRole('button', { name: CODE_COPY.upgradeAction })).toBeInTheDocument();
  });

  it('closes on dismiss', async () => {
    const user = userEvent.setup();
    usage = summary(90, 'pro');
    render(<CodeUsageWarning />);

    await user.click(screen.getByRole('button', { name: 'Dismiss usage warning' }));
    expect(screen.queryByTestId('usage-warning-banner')).toBeNull();
  });
});

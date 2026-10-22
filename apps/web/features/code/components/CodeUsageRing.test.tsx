import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CODE_COPY } from '../code-surface';
import { UsageRing } from './CodeComposer';

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

function summary(planTier: string) {
  return {
    plan_tier: planTier,
    usage_percentage: 64,
    session_usage_percentage: 64,
    session_reset_at: RESET_AT,
    weekly_usage_percentage: 41,
    weekly_reset_at: RESET_AT,
    flagship_weekly_usage_percentage: null,
  };
}

async function openRing() {
  const user = userEvent.setup();
  render(<UsageRing contextTokens={null} contextWindow={null} />);
  await user.click(screen.getByRole('button', { name: CODE_COPY.usageMenu }));
  return user;
}

describe('UsageRing', () => {
  beforeEach(() => {
    openUpgrade.mockReset();
    usage = null;
  });

  it('shows a paid plan its meters with reset times', async () => {
    usage = summary('pro');
    await openRing();

    expect(await screen.findByText(CODE_COPY.planUsage)).toBeInTheDocument();
    expect(screen.getByText(CODE_COPY.usageSession)).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText(CODE_COPY.usageWeekly)).toBeInTheDocument();
    expect(screen.getByText(CODE_COPY.usageDetail)).toBeInTheDocument();
  });

  it('shows a Free plan only Upgrade, never a meter or a percentage', async () => {
    usage = summary('free');
    const user = await openRing();

    const upgrade = await screen.findByRole('button', { name: CODE_COPY.upgradeAction });
    expect(screen.queryByText(CODE_COPY.planUsage)).toBeNull();
    expect(screen.queryByText(CODE_COPY.usageSession)).toBeNull();
    expect(screen.queryByText(CODE_COPY.usageDetail)).toBeNull();
    expect(document.body).not.toHaveTextContent('%');

    await user.click(upgrade);
    expect(openUpgrade).toHaveBeenCalledTimes(1);
  });

  it('shows no meter when the plan is not one it recognises', async () => {
    usage = summary('mystery');
    await openRing();

    expect(await screen.findByText(CODE_COPY.usageUnavailable)).toBeInTheDocument();
    expect(screen.queryByText(CODE_COPY.usageSession)).toBeNull();
    expect(screen.queryByRole('button', { name: CODE_COPY.upgradeAction })).toBeNull();
    expect(document.body).not.toHaveTextContent('%');
  });
});

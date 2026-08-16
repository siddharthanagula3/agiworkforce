import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openExternalUrl } from '../../utils/navigation';
import { useAuthStore } from '../../stores/auth';
import { PlansModal } from './PlansModal';

const billingMocks = vi.hoisted(() => ({
  openBillingPortal: vi.fn(),
  refreshUserData: vi.fn(),
}));

vi.mock('./PlanCard', () => ({
  PlanCard: ({
    tier,
    isCurrentPlan,
    actionDisabled,
    actionDisabledReason,
    onCtaClick,
  }: {
    tier: string;
    isCurrentPlan: boolean;
    actionDisabled?: boolean;
    actionDisabledReason?: string;
    onCtaClick: (tier: string) => void;
  }) => (
    <div data-testid={`plan-${tier}`}>
      {isCurrentPlan ? 'current' : 'not-current'}
      <button
        type="button"
        data-testid={`cta-${tier}`}
        disabled={actionDisabled}
        title={actionDisabledReason}
        onClick={() => onCtaClick(tier)}
      >
        cta
      </button>
    </div>
  ),
}));

vi.mock('../../utils/navigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/stripeCheckout', () => ({
  openBillingPortal: billingMocks.openBillingPortal,
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    refreshUserData: billingMocks.refreshUserData,
  },
}));

vi.mock('./DesktopUpgradeConfirmDialog', () => ({
  DesktopUpgradeConfirmDialog: ({ request }: { request: { tier: string } | null }) =>
    request ? <div data-testid="upgrade-confirm">{request.tier}</div> : null,
}));

describe('PlansModal account plan ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingMocks.openBillingPortal.mockResolvedValue(null);
    billingMocks.refreshUserData.mockResolvedValue(undefined);
    useAuthStore.setState({
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
      subscriptionSource: 'stripe',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('marks the backend-owned account plan as current', () => {
    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-pro')).toHaveTextContent(/current/);
    expect(screen.getByTestId('plan-byok')).toHaveTextContent(/not-current/);
  });

  it('maps the canonical local-only account tier to the Local plan', () => {
    useAuthStore.setState({ plan: 'local-only', planDisplayName: 'Local Mode' });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-local')).toHaveTextContent(/current/);
    expect(screen.getByTestId('plan-byok')).toHaveTextContent(/not-current/);
  });

  it('shows the managed Cloud Free tier as the current account plan', () => {
    useAuthStore.setState({ plan: 'free', planDisplayName: 'Free' });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-free')).toHaveTextContent(/current/);
    expect(screen.getByTestId('plan-local')).toHaveTextContent(/not-current/);
    expect(screen.getByTestId('plan-byok')).toHaveTextContent(/not-current/);
  });

  it('does not pretend BYOK is current while account plan sync is unresolved', () => {
    useAuthStore.setState({ plan: null, planDisplayName: undefined });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/checking your current cloud plan/i);
    expect(screen.getByTestId('plan-free')).toHaveTextContent(/not-current/);
    expect(screen.getByTestId('plan-basic')).toHaveTextContent(/not-current/);
    expect(screen.getByTestId('plan-max')).toHaveTextContent(/not-current/);

    fireEvent.click(screen.getByTestId('cta-pro'));
    expect(screen.queryByTestId('upgrade-confirm')).toBeNull();
    expect(screen.getByText(/current cloud plan is still loading/i)).toBeInTheDocument();
  });

  it('lets Radix own the accessible title and description ids', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<PlansModal open onOpenChange={vi.fn()} />);

    const diagnostics = [...error.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(diagnostics).not.toMatch(/requires a `DialogTitle`|Missing `Description`/);

    error.mockRestore();
    warn.mockRestore();
  });
});

describe('PlansModal paid-plan CTA routing (public alpha — no waitlist)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      plan: 'byok',
      planDisplayName: 'Local Mode + BYOK',
      subscriptionStatus: 'none',
      subscriptionFetchStatus: 'succeeded',
      subscriptionSource: 'none',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the Basic tier in the desktop plan list (Basic is cross-surface)', () => {
    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-basic')).toBeInTheDocument();
    expect(screen.getByTestId('plan-pro')).toBeInTheDocument();
    expect(screen.getByTestId('plan-max')).toBeInTheDocument();
  });

  it.each(['pro', 'max'] as const)(
    'opens the in-app upgrade confirmation for the %s CTA',
    (tier) => {
      const onOpenChange = vi.fn();
      render(<PlansModal open onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByTestId(`cta-${tier}`));

      expect(screen.getByTestId('upgrade-confirm')).toHaveTextContent(tier);
      expect(openExternalUrl).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    },
  );

  it('does nothing for free tiers (no browser open, modal stays)', () => {
    const onOpenChange = vi.fn();
    render(<PlansModal open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByTestId('cta-local'));
    fireEvent.click(screen.getByTestId('cta-byok'));

    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('never routes paid CTAs to invite/waitlist UI', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<PlansModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('cta-pro'));
    fireEvent.click(screen.getByTestId('cta-max'));

    const waitlistDispatches = dispatchSpy.mock.calls.filter(([event]) => {
      const detail = (event as CustomEvent).detail as { type?: string } | undefined;
      return detail?.type === 'open-cloud-waitlist';
    });
    expect(waitlistDispatches).toHaveLength(0);
    expect(screen.queryByText(/waitlist/i)).toBeNull();
    expect(screen.queryByText(/invite code/i)).toBeNull();

    dispatchSpy.mockRestore();
  });

  it('disables every paid Stripe action for an Apple-owned active subscription', () => {
    useAuthStore.setState({
      plan: 'pro',
      planDisplayName: 'Pro',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
      subscriptionSource: 'apple',
    });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Billing owner: Apple')).toBeInTheDocument();
    expect(screen.getByTestId('cta-basic')).toBeDisabled();
    expect(screen.getByTestId('cta-max')).toBeDisabled();
    expect(screen.getByTestId('cta-max').getAttribute('title')).toMatch(/Apple/i);
    fireEvent.click(screen.getByTestId('cta-max'));
    expect(screen.queryByTestId('upgrade-confirm')).toBeNull();
    expect(billingMocks.openBillingPortal).not.toHaveBeenCalled();
  });

  it('starts a new checkout flow instead of opening Stripe portal after an Apple plan ends', () => {
    useAuthStore.setState({
      plan: 'pro',
      planDisplayName: 'Pro',
      subscriptionStatus: 'canceled',
      subscriptionFetchStatus: 'succeeded',
      subscriptionSource: 'apple',
    });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('cta-basic'));
    expect(screen.getByTestId('upgrade-confirm')).toHaveTextContent('basic');
    expect(billingMocks.openBillingPortal).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_APP_URL } from '../../api/config';
import { openExternalUrl } from '../../utils/navigation';
import { useAuthStore } from '../../stores/auth';
import { PlansModal } from './PlansModal';

vi.mock('./PlanCard', () => ({
  PlanCard: ({
    tier,
    isCurrentPlan,
    onCtaClick,
  }: {
    tier: string;
    isCurrentPlan: boolean;
    onCtaClick: (tier: string) => void;
  }) => (
    <div data-testid={`plan-${tier}`}>
      {isCurrentPlan ? 'current' : 'not-current'}
      <button type="button" data-testid={`cta-${tier}`} onClick={() => onCtaClick(tier)}>
        cta
      </button>
    </div>
  ),
}));

vi.mock('../../utils/navigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

describe('PlansModal account plan ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
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
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('hides the mobile-only Basic tier from the desktop plan list', () => {
    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId('plan-basic')).toBeNull();
    expect(screen.getByTestId('plan-pro')).toBeInTheDocument();
    expect(screen.getByTestId('plan-max')).toBeInTheDocument();
  });

  it.each(['pro', 'max'] as const)(
    'opens the web pricing page (canonical checkout surface) for the %s CTA and closes the modal',
    (tier) => {
      const onOpenChange = vi.fn();
      render(<PlansModal open onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByTestId(`cta-${tier}`));

      expect(openExternalUrl).toHaveBeenCalledWith(`${WEB_APP_URL}/pricing`);
      expect(onOpenChange).toHaveBeenCalledWith(false);
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
    // The footer's "no invite needed" copy is fine; waitlist/invite-code
    // gating UI is not.
    expect(screen.queryByText(/waitlist/i)).toBeNull();
    expect(screen.queryByText(/invite code/i)).toBeNull();

    dispatchSpy.mockRestore();
  });
});

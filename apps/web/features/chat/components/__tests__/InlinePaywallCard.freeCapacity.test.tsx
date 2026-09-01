import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InlinePaywallCard } from '../InlinePaywallCard';
import type { FreeCapacityRecovery, RequiredTier, UserTier } from '../InlinePaywallCard';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const RETRY_AT = '2026-09-01T12:00:45.000Z';

const SERVER_MESSAGE =
  'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.';

function makeProps(freeCapacity: Partial<FreeCapacityRecovery> = {}) {
  return {
    feature: 'rolling_capacity' as const,
    currentTier: 'free' as UserTier,
    requiredTier: 'basic' as RequiredTier,
    reason: SERVER_MESSAGE,
    freeCapacity: { retryAt: RETRY_AT, byokHref: '/byok', onRetry: vi.fn(), ...freeCapacity },
    onUpgrade: vi.fn(),
    onDismiss: vi.fn(),
  };
}

function retryButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /try again/i }) as HTMLButtonElement;
}

describe('InlinePaywallCard · free capacity variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not blame the reader for a limit they never reached', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    expect(screen.getByRole('heading')).toHaveTextContent('No free capacity right now');
    expect(screen.queryByText(/you have reached/i)).toBeNull();
    expect(screen.queryByText(/have used your capacity/i)).toBeNull();
  });

  it('offers the wait, the upgrade and the key, and nothing else', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    expect(retryButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade to/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use your own key' })).toHaveAttribute('href', '/byok');
    expect(screen.getByRole('button', { name: 'Try later' })).toBeInTheDocument();
  });

  it('holds the retry closed until the instant the server named', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    expect(retryButton()).toBeDisabled();
    expect(retryButton()).toHaveTextContent('Try again in 45s');
  });

  it('counts the wait down while the card is on screen', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(retryButton()).toHaveTextContent('Try again in 15s');
    expect(retryButton()).toBeDisabled();
  });

  it('opens the retry once the wait is over and resends the failed turn', () => {
    const onRetry = vi.fn();
    render(<InlinePaywallCard {...makeProps({ onRetry })} />);

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    const button = retryButton();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Try again');
    expect(button).not.toHaveTextContent(/in \d/);

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not fire the resend while the pool is still busy', () => {
    const onRetry = vi.fn();
    render(<InlinePaywallCard {...makeProps({ onRetry })} />);

    fireEvent.click(retryButton());
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('degrades to an open retry when the server named no instant', () => {
    render(<InlinePaywallCard {...makeProps({ retryAt: undefined })} />);

    expect(retryButton()).toBeEnabled();
    expect(retryButton()).toHaveTextContent('Try again');
  });

  it('degrades to an open retry when the instant has already passed', () => {
    vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'));
    render(<InlinePaywallCard {...makeProps()} />);

    expect(retryButton()).toBeEnabled();
  });

  // The lane can hand back a quota window hours out. Waiting is not the advice
  // then, and a button held shut that long is a dead control.
  it('does not hold the retry shut for a deadline hours away', () => {
    const onRetry = vi.fn();
    render(<InlinePaywallCard {...makeProps({ retryAt: '2026-09-01T16:00:00.000Z', onRetry })} />);

    const button = retryButton();
    expect(button).toBeEnabled();
    expect(button).not.toHaveTextContent(/in \d/);

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the key CTA when the server offered no destination', () => {
    render(<InlinePaywallCard {...makeProps({ byokHref: undefined })} />);

    expect(screen.queryByRole('link', { name: 'Use your own key' })).toBeNull();
  });

  it('renders the server prose and never the payload that carried it', () => {
    const { container } = render(<InlinePaywallCard {...makeProps()} />);

    expect(screen.getByText(SERVER_MESSAGE)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/free_capacity_unavailable/);
    expect(container.textContent).not.toMatch(/insufficient_quota/);
    expect(container.textContent).not.toMatch(/retry_at|"action"|\{|\}/);
  });

  it('does not advertise a tier badge for a refusal upgrading is only one answer to', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    expect(screen.queryByText('BASIC')).toBeNull();
  });

  it('drops the upgrade CTA when there is no plan left to sell', () => {
    render(<InlinePaywallCard {...makeProps()} currentTier="enterprise" showUpgradeCta={false} />);

    expect(screen.queryByRole('button', { name: /upgrade to/i })).toBeNull();
    expect(retryButton()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use your own key' })).toBeInTheDocument();
  });
});

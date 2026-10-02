import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { InlinePaywallCard } from '../InlinePaywallCard';
import type { FreeLimitRecovery, RequiredTier, UserTier } from '../InlinePaywallCard';

const REASON =
  'Qwen Fixture Max has reached its free limit. Its free allowance from Fixture Cloud is shared by everyone and does not renew, so this is not a limit on your account. Choose Qwen Fixture Plus or another free model, then send your message again.';

function makeProps(freeLimit: Partial<FreeLimitRecovery> = {}, resetLabel = '') {
  return {
    feature: 'model_access' as const,
    currentTier: 'free' as UserTier,
    requiredTier: 'basic' as RequiredTier,
    reason: REASON,
    resetLabel,
    freeLimit: {
      modelName: 'Qwen Fixture Max',
      reason: 'allowance_used' as const,
      alternativeModel: { id: 'fixture-alternative', name: 'Qwen Fixture Plus' },
      onSwitchModel: vi.fn(),
      ...freeLimit,
    },
    onUpgrade: vi.fn(),
    onDismiss: vi.fn(),
  };
}

describe('InlinePaywallCard · free limit variant', () => {
  it('names the model whose free limit was reached', () => {
    render(<InlinePaywallCard {...makeProps()} />);

    expect(screen.getByRole('heading')).toHaveTextContent(
      'Free limit reached for Qwen Fixture Max',
    );
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('switches to the free model the server named in one click', () => {
    const props = makeProps();
    render(<InlinePaywallCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Qwen Fixture Plus' }));

    expect(props.freeLimit.onSwitchModel).toHaveBeenCalledWith('fixture-alternative');
  });

  it('keeps the upgrade path and a way to put the card aside', () => {
    const props = makeProps();
    render(<InlinePaywallCard {...props} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^Upgrade to ${getBillingPlanPricing('basic').label}`),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(props.onUpgrade).toHaveBeenCalledOnce();
    expect(props.onDismiss).toHaveBeenCalledOnce();
  });

  it.each([
    ['an allowance that does not renew', { reason: 'allowance_used' as const }, '', 'Not now'],
    ['an offer that has ended', { reason: 'allowance_ended' as const }, '', 'Not now'],
    ['a shared pool that refills', { reason: 'shared_pool_used' as const }, '', 'Try later'],
    [
      'an allowance with a known reset',
      { reason: 'allowance_used' as const },
      'Resets in 3 hr',
      'Try later',
    ],
  ])('offers to try later only when waiting helps: %s', (_label, freeLimit, reset, dismiss) => {
    render(<InlinePaywallCard {...makeProps(freeLimit, reset)} />);

    expect(screen.getByRole('button', { name: dismiss })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: dismiss === 'Not now' ? 'Try later' : 'Not now' }),
    ).toBeNull();
  });

  it('states when the limit resets only when a time is known', () => {
    const { rerender } = render(<InlinePaywallCard {...makeProps({}, 'Resets in 3 hr')} />);
    expect(screen.getByText('Resets in 3 hr')).toBeInTheDocument();

    rerender(<InlinePaywallCard {...makeProps()} />);
    expect(screen.queryByText(/resets/i)).toBeNull();
  });

  it('offers no switch when there is no free model to switch to', () => {
    render(<InlinePaywallCard {...makeProps({ alternativeModel: undefined })} />);

    expect(screen.queryByRole('button', { name: /^Switch to/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('says an ended free offer has ended rather than been used up', () => {
    render(<InlinePaywallCard {...makeProps({ reason: 'allowance_ended' })} />);

    expect(screen.getByRole('heading')).toHaveTextContent(
      'The free offer for Qwen Fixture Max has ended',
    );
  });

  it('never shows provider payloads, error prefixes or a plan badge on the limit card', () => {
    const { container } = render(<InlinePaywallCard {...makeProps()} />);
    const text = container.textContent ?? '';

    for (const marker of ['{', '}', 'Error:', 'provider error', 'AllocationQuota']) {
      expect(text).not.toContain(marker);
    }
    expect(screen.getByRole('heading').textContent).toBe('Free limit reached for Qwen Fixture Max');
  });
});

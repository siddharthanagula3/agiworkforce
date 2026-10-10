import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FREE_MODEL_PROMOTION_PATH } from '@agiworkforce/cloud-contracts';
import { modelsById, type ModelMetadata } from '@agiworkforce/types';

import { useBillingStore } from '@shared/stores/web-auth-store';
import { FreeModelPromotionNotice } from '../FreeModelPromotionNotice';

const PROMOTED = Object.values(modelsById).find(
  (model: ModelMetadata) => model.provider === 'anthropic' && model.qualityTier === 'fast',
) as ModelMetadata;
const ENDS_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
const ENDS_ON = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(new Date(ENDS_AT));

function signedInOn(tier: string): void {
  useBillingStore.setState({
    user: { id: 'user_free_1' },
    subscription: {
      tier: tier as never,
      display_name: tier,
      status: 'active',
      current_period_end: null,
      plan_name: tier,
    },
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
  });
}

const fetchPromotion = vi.fn((url: string) =>
  Promise.resolve(
    url === FREE_MODEL_PROMOTION_PATH
      ? new Response(JSON.stringify({ promotion: { modelId: PROMOTED.id, endsAt: ENDS_AT } }))
      : new Response(null, { status: 404 }),
  ),
);

beforeEach(() => {
  window.localStorage.clear();
  fetchPromotion.mockClear();
  vi.stubGlobal('fetch', fetchPromotion);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  useBillingStore.setState({ user: null, subscription: null, initialized: false, isLoading: true });
});

describe('the free model promotion notice', () => {
  it('names the model and the date, and says it lasts while capacity does, never unlimited', async () => {
    signedInOn('free');
    render(<FreeModelPromotionNotice />);

    const notice = await screen.findByTestId('free-model-promotion-notice');
    expect(notice.textContent).toBe(
      `${PROMOTED.name} free until ${ENDS_ON}, while promotional capacity lasts.`,
    );
    expect(notice.textContent?.toLowerCase()).not.toContain('unlimited');
  });

  it('stays dismissed for the account that dismissed it', async () => {
    signedInOn('free');
    const { unmount } = render(<FreeModelPromotionNotice />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Dismiss the free model promotion notice' }),
    );
    expect(screen.queryByTestId('free-model-promotion-notice')).toBeNull();
    unmount();

    render(<FreeModelPromotionNotice />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('free-model-promotion-notice')).toBeNull();
  });

  it('is never shown to a paid plan, which does not even ask for the offer', () => {
    signedInOn('pro');
    render(<FreeModelPromotionNotice />);

    expect(screen.queryByTestId('free-model-promotion-notice')).toBeNull();
    expect(fetchPromotion).not.toHaveBeenCalled();
  });
});

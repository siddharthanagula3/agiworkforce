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
const MONTH_NAME = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

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
  it('names the model and says it is free for a limited time, with no date, never unlimited', async () => {
    signedInOn('free');
    render(<FreeModelPromotionNotice />);

    const notice = await screen.findByTestId('free-model-promotion-notice');
    expect(notice.textContent).toBe(`${PROMOTED.name} is free for a limited time.`);
    expect(notice.textContent).not.toMatch(MONTH_NAME);
    expect(notice.textContent).not.toMatch(ISO_DATE);
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

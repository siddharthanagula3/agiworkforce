import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@shared/config/llm');
type ScanModule1 = typeof import('zustand/middleware');

type PromotionTestModule0 = typeof import('@shared/stores/model-store');
type PromotionTestModule1 = typeof import('@shared/stores/web-auth-store');
type PromotionTestModule2 = typeof import('@shared/stores/web-chat-store');
type PromotionTestModule3 = typeof import('@features/chat/lib/use-model-favourites');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}));
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FREE_MODEL_PROMOTION_PATH } from '@agiworkforce/cloud-contracts';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const sel = vi.hoisted(() => ({ id: 'fixture-free-router' }));
const billing = vi.hoisted(() => ({ tier: 'free' }));

const MODELS = vi.hoisted(() => [
  {
    id: 'fixture-free-router',
    name: 'Free Router Fixture',
    provider: 'OpenRouter',
    providerKey: 'open_router',
    description: 'For quick answers',
  },
  {
    id: 'fixture-promoted',
    name: 'Promoted Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Fast and capable',
  },
  {
    id: 'fixture-paid',
    name: 'Paid Fixture',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'For hard problems',
  },
]);

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: ['fixture-free-router'],
  FREE_TRIAL_MODEL: 'fixture-free-router',
}));

vi.mock('@shared/stores/model-store', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModelId: sel.id,
      setSelectedModelId: (id: string) => {
        sel.id = id;
      },
      getSelectedModel: () => MODELS.find((m) => m.id === sel.id) ?? MODELS[0],
    }),
  AVAILABLE_MODELS: MODELS,
  findSelectableModel: (id: string) => MODELS.find((model) => model.id === id) ?? null,
  isSelectableModelId: (id: string) => MODELS.some((model) => model.id === id),
}));

vi.mock('@shared/stores/web-auth-store', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: { tier: billing.tier },
      user: { id: 'account-1' },
      initialized: true,
      isLoading: false,
      error: null,
    }),
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isModelAllowedForTier: (id: string, tier: string) =>
    tier !== 'free' || id === 'fixture-free-router',
  getBestAutoModeForTier: () => 'fixture-free-router',
}));

vi.mock('@shared/stores/web-chat-store', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule2>()),
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeConversationId: null, conversations: [], messages: [] }),
}));

vi.mock('@features/chat/lib/use-model-catalogue', () => ({
  useModelCatalogue: () => ({
    status: 'ready',
    entries: [],
    developers: [],
    count: 0,
    planLabel: 'Free',
    retry: () => undefined,
  }),
}));

vi.mock('@features/chat/lib/use-model-favourites', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule3>()),
  useModelFavourites: () => ({ favouriteModelIds: [], toggleFavourite: vi.fn() }),
}));

vi.mock('./StyleSelector', () => ({ StyleSelector: () => <div /> }));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<ScanModule1>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

import { ComposerFooter } from '../ComposerFooter';

const ENDS_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
const ENDS_ON = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(new Date(ENDS_AT));

const openPicker = () => {
  render(<ComposerFooter />);
  fireEvent.click(screen.getByRole('button', { name: /, change model$/ }));
  return screen.getByRole('dialog', { name: 'Models' });
};

describe('ComposerFooter · free model promotion', () => {
  beforeEach(() => {
    sel.id = 'fixture-free-router';
    billing.tier = 'free';
    window.localStorage.clear();
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url === FREE_MODEL_PROMOTION_PATH
          ? new Response(
              JSON.stringify({ promotion: { modelId: 'fixture-promoted', endsAt: ENDS_AT } }),
            )
          : new Response(null, { status: 403 }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('makes the promoted model the Free default once the offer has been read', async () => {
    render(<ComposerFooter />);

    await waitFor(() => expect(sel.id).toBe('fixture-promoted'));
  });

  it('labels the promoted model with its end date and lets a Free account pick it', async () => {
    sel.id = 'fixture-paid';
    const dialog = openPicker();

    const row = await within(dialog).findByRole('button', {
      name: `Promoted Fixture - Free until ${ENDS_ON}`,
    });
    expect(within(row).getByText(`Free until ${ENDS_ON}`)).toBeInTheDocument();
    fireEvent.click(row);

    expect(sel.id).toBe('fixture-promoted');
  });

  it('leaves the account on the plan model it moved back to', async () => {
    window.localStorage.setItem(
      `agi.free-model-promotion.default.fixture-promoted.${ENDS_AT}`,
      'account-1',
    );

    render(<ComposerFooter />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /, change model$/ })).toBeInTheDocument(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sel.id).toBe('fixture-free-router');
  });
});

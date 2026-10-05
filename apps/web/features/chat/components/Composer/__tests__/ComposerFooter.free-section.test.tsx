import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@shared/config/llm');
type ScanModule1 = typeof import('zustand/middleware');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}));
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FREE_QUOTA_CATALOGUE_PATH } from '@agiworkforce/cloud-contracts';
import { getProviderOfferings, providerOfferingLabel } from '@agiworkforce/types';
import type { FreeQuotaCatalogue, FreeQuotaStatus } from '@/features/models/lib/free-quota-types';

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
]);

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: ['fixture-free-router'],
  FREE_TRIAL_MODEL: 'fixture-free-router',
}));

vi.mock('@shared/stores/model-store', () => ({
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

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: { tier: billing.tier },
      initialized: true,
      isLoading: false,
      error: null,
    }),
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isModelAllowedForTier: () => true,
  getBestAutoModeForTier: () => 'fixture-free-router',
}));

vi.mock('@shared/stores/web-chat-store', () => ({
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

vi.mock('@features/chat/lib/use-model-favourites', () => ({
  useModelFavourites: () => ({ favouriteModelIds: [], toggleFavourite: vi.fn() }),
}));

vi.mock('./StyleSelector', () => ({ StyleSelector: () => <div /> }));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<ScanModule1>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

import { ComposerFooter } from '../ComposerFooter';

const chatKeys = Object.entries(getProviderOfferings())
  .filter(([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat')
  .map(([key]) => key);
const READY_KEY = chatKeys[0]!;
const UNAVAILABLE_KEY = chatKeys.find(
  (key) => providerOfferingLabel(key)!.family !== providerOfferingLabel(READY_KEY)!.family,
)!;
const READY_NAME = providerOfferingLabel(READY_KEY)!.displayName;
const UNAVAILABLE_NAME = providerOfferingLabel(UNAVAILABLE_KEY)!.displayName;

function catalogue(entries: Array<[string, FreeQuotaStatus]>): FreeQuotaCatalogue {
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: entries.length,
    reportedUnavailable: 0,
    models: entries.map(([key, status]) => {
      const offering = getProviderOfferings()[key]!;
      return {
        key,
        displayName: offering.displayName,
        providerModelId: offering.providerModelId,
        category: offering.category,
        limit: null,
        unit: null,
        consumedApproximate: null,
        expiresOn: null,
        status,
      };
    }),
  };
}

function stubFreeCatalogue(quota: Promise<Response>) {
  vi.stubGlobal('fetch', (url: string) =>
    url === FREE_QUOTA_CATALOGUE_PATH
      ? quota
      : Promise.resolve(new Response(null, { status: 403 })),
  );
}

const openPicker = () => {
  render(<ComposerFooter />);
  fireEvent.click(screen.getByRole('button', { name: /, change model$/ }));
  return screen.getByRole('dialog', { name: 'Models' });
};

async function walkTo(target: () => HTMLElement | null) {
  for (let step = 0; step < 20 && document.activeElement !== target(); step += 1) {
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  }
  await waitFor(() => expect(document.activeElement).toBe(target()));
}

describe('ComposerFooter · free section', () => {
  beforeEach(() => {
    sel.id = 'fixture-free-router';
    billing.tier = 'free';
    stubFreeCatalogue(
      Promise.resolve(
        new Response(
          JSON.stringify(
            catalogue([
              [READY_KEY, 'ready'],
              [UNAVAILABLE_KEY, 'unavailable'],
            ]),
          ),
        ),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the picker open and explains why when an unavailable model is clicked', async () => {
    const dialog = openPicker();
    await within(dialog).findByRole('button', { name: READY_NAME });

    fireEvent.click(within(dialog).getByRole('button', { name: /Unavailable/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: UNAVAILABLE_NAME }));

    expect(screen.getByRole('dialog', { name: 'Models' })).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        `${UNAVAILABLE_NAME} from Fixture Cloud is not available right now.`,
        {
          exact: false,
        },
      ),
    ).toHaveAttribute('role', 'status');
    expect(sel.id).toBe('fixture-free-router');
  });

  it('lets arrow keys reach an unavailable model and Enter explain it', async () => {
    const user = userEvent.setup();
    const dialog = openPicker();
    await within(dialog).findByRole('button', { name: READY_NAME });
    const disclosure = () => within(dialog).getByRole('button', { name: /Unavailable/ });

    await walkTo(disclosure);
    await user.keyboard('{Enter}');
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true');

    const unavailable = () => within(dialog).queryByRole('button', { name: UNAVAILABLE_NAME });
    await walkTo(unavailable);
    expect(unavailable()).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Models' })).toBeInTheDocument();
    expect(
      within(dialog).getByText(`${UNAVAILABLE_NAME} from Fixture Cloud`, { exact: false }),
    ).toHaveAttribute('role', 'status');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /, change model$/ }));
  });

  it('lets a paid account type in the free model search without opening the full catalogue', async () => {
    billing.tier = 'max_15x';
    const imageKeys = Object.entries(getProviderOfferings())
      .filter(
        ([, offering]) =>
          offering.category === 'image' && offering.quotaProbeProtocol === 'image-sync',
      )
      .map(([key]) => key);
    const family = providerOfferingLabel(imageKeys[0]!)!.family;
    stubFreeCatalogue(
      Promise.resolve(
        new Response(
          JSON.stringify(
            catalogue(
              imageKeys
                .filter((key) => providerOfferingLabel(key)!.family === family)
                .map((key): [string, FreeQuotaStatus] => [key, 'ready']),
            ),
          ),
        ),
      ),
    );
    const user = userEvent.setup();
    const dialog = openPicker();
    fireEvent.click(await within(dialog).findByRole('button', { name: /More models/ }));
    const search = within(dialog).getByRole('searchbox', { name: 'Search free models' });

    await user.type(search, 'q');

    expect(search).toHaveValue('q');
    expect(
      within(dialog).queryByRole('textbox', { name: 'Search models' }),
    ).not.toBeInTheDocument();
  });

  it('draws the free models focus ring on the free default model row too', async () => {
    const dialog = openPicker();
    const freeModel = await within(dialog).findByRole('button', { name: READY_NAME });
    const defaultRow = within(dialog).getByRole('button', { name: /Free Router Fixture/ });

    for (const row of [defaultRow, freeModel]) {
      expect(row).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-inset',
        'focus-visible:ring-[var(--chat-focus-ring)]',
      );
    }
  });

  it('shows the rest of the picker while the free models are still loading', () => {
    stubFreeCatalogue(new Promise<Response>(() => undefined));
    const dialog = openPicker();

    expect(within(dialog).getByText('Checking free models…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Free Router Fixture/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /All models/ })).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useModelStore } from '@shared/stores/model-store';
import {
  FREE_MODEL_PROMOTION_PATH,
  WEB_SEARCH_ALLOWANCE_PATH,
} from '@agiworkforce/cloud-contracts';
import { MODEL_FAMILY_REGISTRY } from '@agiworkforce/types';
import promotionConfig from '@/config/free-model-promotion.json';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

const PROMOTED_MODEL = Object.values(MODEL_FAMILY_REGISTRY).find(
  (family) =>
    family.provider === promotionConfig.provider && family.tier === promotionConfig.modelFamilyTier,
)?.activeModelId as string;

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

function requestedPaths(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url]) => String(url));
}

async function promotionRead() {
  await waitFor(() => expect(requestedPaths()).toContain(FREE_MODEL_PROMOTION_PATH));
  await act(async () => {});
}

const FREE_SEARCH_BANNER = /Your Free plan has used its 20 web searches/;

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
  useBillingStore.setState({
    user: { id: 'free-account' },
    subscription: {
      tier: 'free',
      display_name: 'Free',
      status: 'active',
      current_period_end: null,
      plan_name: 'Free',
    },
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
    featureFlags: { generic_web_search: true },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url) === WEB_SEARCH_ALLOWANCE_PATH) {
        return new Response(
          JSON.stringify({ status: 'exhausted', used: 20, limit: 20, windowDays: 30 }),
        );
      }
      if (String(url) === FREE_MODEL_PROMOTION_PATH) {
        return new Response(
          JSON.stringify({
            promotion: {
              modelId: PROMOTED_MODEL,
              endsAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          }),
        );
      }
      return new Response(JSON.stringify({}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web search on the promoted model for a Free account', () => {
  it('sends the search with no search-limit banner, even with the Free allowance spent', async () => {
    useModelStore.getState().setSelectedModelId(PROMOTED_MODEL);
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" />);
    await promotionRead();

    type('search the internet and tell me the latest news');
    await act(async () => {});
    expect(screen.queryByText(/web search/i)).toBeNull();
    fireEvent.keyDown(input(), { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(FREE_SEARCH_BANNER)).toBeNull();
    expect(requestedPaths()).not.toContain(WEB_SEARCH_ALLOWANCE_PATH);
  });

  it('still applies the Free search allowance on the Free model', async () => {
    useModelStore.getState().setSelectedModelId(FREE_TRIAL_MODEL);
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" />);

    type('search the internet and tell me the latest news');

    expect(await screen.findByText(FREE_SEARCH_BANNER)).toBeTruthy();
  });
});

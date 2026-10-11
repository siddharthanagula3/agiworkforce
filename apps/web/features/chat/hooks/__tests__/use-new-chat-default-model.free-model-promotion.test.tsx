import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultModelFor } from '@agiworkforce/types';

type DefaultModelPreferenceModule = typeof import('@features/chat/lib/default-model-preference');
type PromotionHookModule = typeof import('@features/chat/hooks/use-free-model-promotion');

const state = vi.hoisted(() => ({
  tier: 'free' as string | null,
  savedDefault: null as string | null,
  promotion: null as null | {
    modelId: string;
    endsAt: string;
    webSearchAvailable: boolean;
    webSearchWindowHours: number;
  },
}));

vi.mock('@features/chat/lib/default-model-preference', async (importOriginal) => ({
  ...(await importOriginal<DefaultModelPreferenceModule>()),
  useKnownPlanTier: () => state.tier,
  useDefaultModelPreference: () => ({
    modelId: state.savedDefault,
    status: 'ready',
    error: null,
    saving: false,
    save: async () => undefined,
    retry: () => undefined,
  }),
}));
vi.mock('@features/chat/hooks/use-free-model-promotion', async (importOriginal) => ({
  ...(await importOriginal<PromotionHookModule>()),
  useFreeModelPromotion: () => ({ ready: true, promotion: state.promotion }),
}));

import { useNewChatDefaultModel } from '../use-new-chat-default-model';
import { AVAILABLE_MODELS, useModelStore } from '@shared/stores/model-store';

const FREE_MODEL = getDefaultModelFor('free', 'chat');
const PROMOTED = AVAILABLE_MODELS.find(
  (model) => model.providerKey === 'anthropic' && model.id !== FREE_MODEL,
)!.id;
const ENDS_AT = new Date(Date.now() + 86_400_000).toISOString();

describe('the model a new Free chat opens on', () => {
  beforeEach(() => {
    state.tier = 'free';
    state.savedDefault = FREE_MODEL;
    state.promotion = {
      modelId: PROMOTED,
      endsAt: ENDS_AT,
      webSearchAvailable: true,
      webSearchWindowHours: 24,
    };
    useModelStore.getState().setSelectedModelId(FREE_MODEL);
  });

  afterEach(() => {
    state.promotion = null;
  });

  it('is the promoted model while the promotion runs, over a saved Free default', async () => {
    renderHook(() => useNewChatDefaultModel(null));

    await waitFor(() => expect(useModelStore.getState().selectedModelId).toBe(PROMOTED));
  });

  it('lands on it again for every new chat, after the account picked another model', async () => {
    const { rerender } = renderHook(({ id }) => useNewChatDefaultModel(id), {
      initialProps: { id: null as string | null },
    });
    await waitFor(() => expect(useModelStore.getState().selectedModelId).toBe(PROMOTED));

    useModelStore.getState().setSelectedModelId(FREE_MODEL);
    rerender({ id: 'conversation-1' });
    expect(useModelStore.getState().selectedModelId).toBe(FREE_MODEL);
    rerender({ id: null });

    await waitFor(() => expect(useModelStore.getState().selectedModelId).toBe(PROMOTED));
  });

  it('does not override a choice made inside the same new chat', async () => {
    const { rerender } = renderHook(() => useNewChatDefaultModel(null));
    await waitFor(() => expect(useModelStore.getState().selectedModelId).toBe(PROMOTED));

    useModelStore.getState().setSelectedModelId(FREE_MODEL);
    rerender();

    expect(useModelStore.getState().selectedModelId).toBe(FREE_MODEL);
  });

  it('keeps the plan default once the promotion is over', async () => {
    state.promotion = null;
    renderHook(() => useNewChatDefaultModel(null));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useModelStore.getState().selectedModelId).toBe(FREE_MODEL);
  });
});

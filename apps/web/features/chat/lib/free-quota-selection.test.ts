import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { chatCompletionEndpoint, freeQuotaSelection } from './free-quota-selection';
import {
  findSelectableModel,
  resolveSelectableModelId,
  useModelStore,
} from '@shared/stores/model-store';
import { CreateConversationSchema, CreateMessageSchema } from '@/lib/validations/chat';

const offeringKey = Object.entries(getProviderOfferings()).find(
  ([, entry]) => entry.quotaProbeProtocol === 'chat',
)![0];

afterEach(() => vi.unstubAllEnvs());

describe('free model selection to transport', () => {
  it('preserves the offering key through selection, hydration, and transcript validation', () => {
    vi.stubEnv('NODE_ENV', 'production');
    useModelStore.getState().setSelectedModelId(offeringKey);
    expect(useModelStore.getState().selectedModelId).toBe(offeringKey);
    expect(useModelStore.getState().getSelectedModel().name).toBe(
      getProviderOfferings()[offeringKey]!.displayName,
    );
    expect(resolveSelectableModelId(offeringKey)).toBe(offeringKey);
    expect(CreateConversationSchema.safeParse({ model: offeringKey }).success).toBe(true);
    expect(
      CreateMessageSchema.safeParse({
        role: 'assistant',
        content: 'Verified response',
        model: offeringKey,
      }).success,
    ).toBe(true);
    expect(chatCompletionEndpoint(offeringKey)).toBe('/api/models/free-quota/completions');
  });

  it('never sends a quota offering to paid routing, even when no longer selectable', () => {
    const unsupported = Object.entries(getProviderOfferings()).find(
      ([, entry]) => !entry.quotaProbeProtocol,
    )![0];
    expect(findSelectableModel(unsupported)).toBeNull();
    expect(freeQuotaSelection(unsupported)).toBeNull();
    expect(CreateConversationSchema.safeParse({ model: unsupported }).success).toBe(false);
    expect(chatCompletionEndpoint(unsupported)).toBe('/api/models/free-quota/completions');
    expect(chatCompletionEndpoint(offeringKey)).toBe('/api/models/free-quota/completions');
    expect(chatCompletionEndpoint('auto')).toBe('/api/llm/v1/chat/completions');
  });
});

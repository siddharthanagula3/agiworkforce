import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  chatCompletionEndpoint,
  freeQuotaSelection,
  promotionalChatToolConflict,
} from './free-quota-selection';
import {
  findSelectableModel,
  resolveSelectableModelId,
  useModelStore,
} from '@shared/stores/model-store';
import { CreateConversationSchema, CreateMessageSchema } from '@/lib/validations/chat';

const qwenOfferingKey = Object.entries(getProviderOfferings()).find(
  ([, entry]) => entry.provider === 'qwen' && entry.quotaProbeProtocol === 'chat',
)![0];
const experientialOfferingKey = Object.entries(getProviderOfferings()).find(
  ([, entry]) => entry.provider === 'experientiallabs' && entry.quotaProbeProtocol === 'chat',
)![0];

afterEach(() => vi.unstubAllEnvs());

describe('free model selection to transport', () => {
  it.each([qwenOfferingKey, experientialOfferingKey])(
    'recognizes tool requests unsupported by the exact promotional route %s',
    (offeringKey) => {
      expect(promotionalChatToolConflict(offeringKey, 'Search the web for the IANA page.')).toBe(
        'web_search',
      );
      expect(
        promotionalChatToolConflict(
          offeringKey,
          'Summarize this URL: https://www.iana.org/help/example-domains',
        ),
      ).toBe('web_search');
      expect(promotionalChatToolConflict(offeringKey, 'Run Python to calculate 17 * 19.')).toBe(
        'code_execution',
      );
      expect(promotionalChatToolConflict(offeringKey, 'Do not search the web. Just say hi.')).toBe(
        null,
      );
      expect(promotionalChatToolConflict(offeringKey, 'Say hi.')).toBe(null);
      expect(promotionalChatToolConflict(offeringKey, 'Say hi.', { needsTools: true })).toBe(
        'tools',
      );
      expect(promotionalChatToolConflict('auto', 'Search the web for IANA.')).toBe(null);
    },
  );

  it.each([
    [qwenOfferingKey, '/api/models/free-quota/completions'],
    [experientialOfferingKey, '/api/models/experiential-free/completions'],
  ])(
    'preserves %s through selection, hydration, and transcript validation',
    (offeringKey, endpoint) => {
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
      expect(chatCompletionEndpoint(offeringKey)).toBe(endpoint);
    },
  );

  it('never sends a quota offering to paid routing, even when no longer selectable', () => {
    const unsupported = Object.entries(getProviderOfferings()).find(
      ([, entry]) => !entry.quotaProbeProtocol,
    )![0];
    expect(findSelectableModel(unsupported)).toBeNull();
    expect(freeQuotaSelection(unsupported)).toBeNull();
    expect(CreateConversationSchema.safeParse({ model: unsupported }).success).toBe(false);
    expect(chatCompletionEndpoint(unsupported)).toBe('/api/models/free-quota/completions');
    expect(chatCompletionEndpoint(qwenOfferingKey)).toBe('/api/models/free-quota/completions');
    expect(chatCompletionEndpoint(experientialOfferingKey)).toBe(
      '/api/models/experiential-free/completions',
    );
    expect(chatCompletionEndpoint('auto')).toBe('/api/llm/v1/chat/completions');
  });
});

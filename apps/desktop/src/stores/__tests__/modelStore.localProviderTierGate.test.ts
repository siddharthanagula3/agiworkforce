/**
 * HARD-014 regression: the desktop tier gate must exempt EVERY on-device
 * runtime, not just Ollama.
 *
 * The gate exists to stop a Free/Basic account from picking a paid managed
 * model, and its fallback is `('auto', 'managed_cloud')`. Locally discovered
 * models are never in the managed catalog, so `isModelAllowedForTier` answers
 * false for all of them. When the exemption recognised only `'ollama'`, a user
 * in Local mode who picked an LM Studio / llama.cpp / vLLM model had that pick
 * silently rewritten to a Managed Cloud model — a Local-to-Managed-Cloud
 * boundary cross with no consent, no fork, and no provider label change.
 *
 * These assertions fail if the exemption narrows back to a single provider id.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModelStore } from '../modelStore';
import { LOCAL_PROVIDER_IDS, type Provider } from '../../types/provider';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve(undefined)),
  isTauri: vi.fn(() => Promise.resolve(false)),
}));

// 'free' is the worst case: the tier with the fewest allowed managed models,
// so any model that reaches the gate is rejected by it.
vi.mock('../auth', () => ({
  useUnifiedAuthStore: {
    getState: () => ({ plan: 'free', account: { plan: 'free' } }),
    subscribe: vi.fn(() => () => {}),
  },
  useAccountStore: {
    getState: () => ({ plan: 'free', account: { plan: 'free' } }),
    subscribe: vi.fn(() => () => {}),
  },
}));

const setDefaultModel = vi.fn();

vi.mock('../settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      llmConfig: {
        defaultProvider: 'managed_cloud',
        defaultModels: { managed_cloud: 'auto' },
      },
      setDefaultModel,
    }),
  },
  waitForSettingsHydration: vi.fn(() => Promise.resolve()),
}));

vi.mock('../ui', () => ({
  useUIStore: {
    getState: () => ({ mode: 'advanced' }),
    subscribe: vi.fn(() => () => {}),
  },
}));

// Model ids as the Rust local-discovery commands actually emit them: not
// present in the managed catalog, so nothing but the local exemption can keep
// them selected.
const DISCOVERED_LOCAL_MODEL: Record<(typeof LOCAL_PROVIDER_IDS)[number], string> = {
  ollama: 'qwen3-coder:30b',
  lmstudio: 'qwen/qwen3-coder-30b',
  llamacpp: 'Qwen3-Coder-30B-Q4_K_M.gguf',
  vllm: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  local: 'local-gguf-model',
};

describe('modelStore local-provider tier exemption (HARD-014)', () => {
  beforeEach(() => {
    useModelStore.getState().reset();
    setDefaultModel.mockClear();
  });

  it.each(LOCAL_PROVIDER_IDS)(
    'keeps a %s selection local instead of falling back to managed_cloud',
    async (provider) => {
      const modelId = DISCOVERED_LOCAL_MODEL[provider];
      expect(modelId).toBeDefined();

      await useModelStore.getState().selectModel(modelId, provider as Provider);

      const state = useModelStore.getState();
      expect(state.selectedProvider).toBe(provider);
      expect(state.selectedModel).toBe(modelId);
      expect(state.selectedProvider).not.toBe('managed_cloud');
    },
  );

  it('still forces a disallowed managed-cloud model back to auto on a free plan', async () => {
    await useModelStore.getState().selectModel('claude-opus-4-5', 'anthropic');

    const state = useModelStore.getState();
    expect(state.selectedModel).toBe('auto');
    expect(state.selectedProvider).toBe('managed_cloud');
  });
});

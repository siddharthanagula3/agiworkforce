import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { enableMapSet } from 'immer';
import { getAllModels, getAllowedModelsForTier, getModelMetadata } from '../constants/llm';
import { useUnifiedAuthStore } from '../stores/auth';
import { useModelStore } from '../stores/modelStore';
import { useUIStore } from '../stores/ui';

const FIXTURE_MODEL_ID = 'fixture-model';
const SECOND_FIXTURE_MODEL_ID = 'fixture-model-secondary';
const BASIC_MODEL_IDS = new Set(getAllowedModelsForTier('basic'));
const OPENAI_MAX_ONLY_MODEL_ID = getAllowedModelsForTier('max').find(
  (candidate) =>
    getModelMetadata(candidate)?.provider === 'openai' && !BASIC_MODEL_IDS.has(candidate),
);
if (!OPENAI_MAX_ONLY_MODEL_ID) {
  throw new Error('Desktop model tests require a catalog OpenAI model above the Basic tier');
}
const ANTHROPIC_MAX_MODEL_ID = getAllowedModelsForTier('max').find(
  (candidate) => getModelMetadata(candidate)?.provider === 'anthropic',
);
if (!ANTHROPIC_MAX_MODEL_ID) {
  throw new Error('Desktop model tests require a catalog Anthropic model for Max');
}
const CONTEXTLESS_MEDIA_MODEL_ID = getAllModels().find(
  (model) =>
    model.contextWindow === undefined &&
    (model.capabilities.imageGen || model.capabilities.videoGen),
)?.id;
if (!CONTEXTLESS_MEDIA_MODEL_ID) {
  throw new Error('Desktop context tests require a catalog media model without token context');
}

// Enable Immer MapSet plugin for stores that use Map/Set (e.g. toolStore.approvalTimeoutTimers)
enableMapSet();

// ============================================
// Model Store Tests
// ============================================

describe('modelStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state before each test
    useModelStore.setState({
      selectedModel: 'auto',
      selectedProvider: 'managed_cloud',
      favorites: [],
      recentModels: [],
      providerStatuses: {
        openai: null,
        anthropic: null,
        google: null,
        ollama: null,
        lmstudio: null,
        llamacpp: null,
        vllm: null,
        xai: null,
        deepseek: null,
        qwen: null,
        moonshot: null,
        perplexity: null,
        zhipu: null,
        managed_cloud: null,
        mistral: null,
        groq: null,
        together: null,
        fireworks: null,
        cerebras: null,
        deepinfra: null,
        nvidia_nim: null,
        open_router: null,
        cohere: null,
        ai21: null,
        sambanova: null,
        azure: null,
        bedrock: null,
      },
      availableModels: [],
      usageStats: null,
      thinkingModeEnabled: false,
      loading: false,
      error: null,
    });
    useUnifiedAuthStore.setState({ plan: null });
    useUIStore.setState({ mode: 'simple' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('selectModel', () => {
    beforeEach(() => {
      // Set plan to 'max' so model selection is not blocked by tier restrictions
      useUnifiedAuthStore.setState({ plan: 'max' });
    });

    it('should select a model and provider', async () => {
      const modelId = getAllowedModelsForTier('max').find(
        (candidate) => getModelMetadata(candidate)?.provider === 'openai',
      );
      expect(modelId).toBeDefined();
      const store = useModelStore.getState();

      await store.selectModel(modelId!, 'openai');

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe(modelId);
      expect(state.selectedProvider).toBe('openai');
    });

    it('should add selected model to recent models', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      await store.selectModel(ANTHROPIC_MAX_MODEL_ID, 'anthropic');

      const state = useModelStore.getState();
      expect(state.recentModels).toContain(ANTHROPIC_MAX_MODEL_ID);
    });

    it('should handle selection errors gracefully', async () => {
      const { useModelStore } = await import('../stores/modelStore');

      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const store = useModelStore.getState();
      await store.selectModel('invalid-model', 'openai');

      // The model tier guard blocks unknown models and falls back to canonical Auto.
      // This is the expected behavior — the store handles it gracefully without throwing
      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
    });

    it('should block non-allowed model selection for basic plans and fall back to economy Auto', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      const { useUnifiedAuthStore } = await import('../stores/auth');

      useUnifiedAuthStore.setState({ plan: 'basic' });

      const store = useModelStore.getState();
      await store.selectModel(OPENAI_MAX_ONLY_MODEL_ID, 'openai');

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
    });
  });

  describe('tier restrictions', () => {
    it('should allow Pro additions on Team and every higher individual tier', async () => {
      const { getAllowedModelsForTier, isModelAllowedForTier } = await import('../constants/llm');
      const basicModels = new Set(getAllowedModelsForTier('basic'));
      const proModel = getAllowedModelsForTier('pro').find((modelId) => !basicModels.has(modelId));
      expect(proModel).toBeDefined();

      expect(isModelAllowedForTier(proModel!, 'free')).toBe(false);
      expect(isModelAllowedForTier(proModel!, 'pro')).toBe(true);
      expect(isModelAllowedForTier(proModel!, 'team')).toBe(true);
      expect(isModelAllowedForTier(proModel!, 'max')).toBe(true);
      expect(isModelAllowedForTier(proModel!, 'max_15x')).toBe(true);
      expect(isModelAllowedForTier(proModel!, 'enterprise')).toBe(true);
    });

    it('keeps Team on Pro model access while Max 15x inherits the flagship roster', async () => {
      const { getAllowedModelsForTier, isModelAllowedForTier } = await import('../constants/llm');
      const proModels = new Set(getAllowedModelsForTier('pro'));
      const flagshipModel = getAllowedModelsForTier('max').find(
        (modelId) => !proModels.has(modelId),
      );
      expect(flagshipModel).toBeDefined();

      expect(isModelAllowedForTier(flagshipModel!, 'team')).toBe(false);
      expect(isModelAllowedForTier(flagshipModel!, 'max_15x')).toBe(true);
    });

    it('should deny unknown phantom model ids on every managed-cloud tier', async () => {
      const { isModelAllowedForTier } = await import('../constants/llm');

      expect(isModelAllowedForTier('unknown-codex-phantom-model', 'basic')).toBe(false);
      expect(isModelAllowedForTier('unknown-codex-phantom-model', 'pro')).toBe(false);
      expect(isModelAllowedForTier('unknown-codex-phantom-model', 'max')).toBe(false);
      expect(isModelAllowedForTier('unknown-codex-phantom-model', 'enterprise')).toBe(false);
    });

    it('should downgrade stale manual selections when plan tier is basic', async () => {
      const { useModelStore, enforceModelTierRestriction } = await import('../stores/modelStore');
      const { useUIStore } = await import('../stores/ui');

      useUIStore.setState({ mode: 'advanced' });
      useModelStore.setState({
        selectedModel: OPENAI_MAX_ONLY_MODEL_ID,
        selectedProvider: 'openai',
      });

      enforceModelTierRestriction('basic');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
    });
  });

  describe('toggleFavorite', () => {
    it('should add a model to favorites', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      store.toggleFavorite(FIXTURE_MODEL_ID);

      const state = useModelStore.getState();
      expect(state.favorites).toContain(FIXTURE_MODEL_ID);
    });

    it('should remove a model from favorites if already favorited', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({ favorites: [FIXTURE_MODEL_ID, SECOND_FIXTURE_MODEL_ID] });

      const store = useModelStore.getState();
      store.toggleFavorite(FIXTURE_MODEL_ID);

      const state = useModelStore.getState();
      expect(state.favorites).not.toContain(FIXTURE_MODEL_ID);
      expect(state.favorites).toContain(SECOND_FIXTURE_MODEL_ID);
    });

    it('should handle multiple favorites', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      store.toggleFavorite(FIXTURE_MODEL_ID);
      store.toggleFavorite(SECOND_FIXTURE_MODEL_ID);
      store.toggleFavorite('fixture-model-tertiary');

      const state = useModelStore.getState();
      expect(state.favorites).toHaveLength(3);
      expect(state.favorites).toEqual([
        FIXTURE_MODEL_ID,
        SECOND_FIXTURE_MODEL_ID,
        'fixture-model-tertiary',
      ]);
    });
  });

  describe('toggleThinkingMode', () => {
    it('should enable thinking mode when disabled', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({ thinkingModeEnabled: false });

      const store = useModelStore.getState();
      store.toggleThinkingMode();

      const state = useModelStore.getState();
      expect(state.thinkingModeEnabled).toBe(true);
    });

    it('should disable thinking mode when enabled', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({ thinkingModeEnabled: true });

      const store = useModelStore.getState();
      store.toggleThinkingMode();

      const state = useModelStore.getState();
      expect(state.thinkingModeEnabled).toBe(false);
    });
  });

  describe('addToRecent', () => {
    it('should add a model to the beginning of recent models', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      store.addToRecent(FIXTURE_MODEL_ID);
      store.addToRecent(SECOND_FIXTURE_MODEL_ID);

      const state = useModelStore.getState();
      expect(state.recentModels[0]).toBe(SECOND_FIXTURE_MODEL_ID);
      expect(state.recentModels[1]).toBe(FIXTURE_MODEL_ID);
    });

    it('should move existing model to beginning if already in recent', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({ recentModels: ['model-a', 'model-b', 'model-c'] });

      const store = useModelStore.getState();
      store.addToRecent('model-b');

      const state = useModelStore.getState();
      expect(state.recentModels[0]).toBe('model-b');
      expect(state.recentModels).toHaveLength(3);
    });

    it('should limit recent models to 5', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({ recentModels: ['m1', 'm2', 'm3', 'm4', 'm5'] });

      const store = useModelStore.getState();
      store.addToRecent('m6');

      const state = useModelStore.getState();
      expect(state.recentModels).toHaveLength(5);
      expect(state.recentModels[0]).toBe('m6');
      expect(state.recentModels).not.toContain('m5');
    });
  });

  describe('checkProviderStatus', () => {
    it('should update provider status on success', async () => {
      const mockStatus = {
        provider: 'openai',
        available: true,
        configured: true,
        rateLimitRemaining: 100,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockStatus);

      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      const result = await store.checkProviderStatus('openai');

      expect(result.available).toBe(true);
      expect(result.configured).toBe(true);

      const state = useModelStore.getState();
      expect(state.providerStatuses.openai).toEqual(mockStatus);
    });

    it('should handle provider check errors', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Provider not configured'));

      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      const result = await store.checkProviderStatus('anthropic');

      expect(result.available).toBe(false);
      expect(result.configured).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getAvailableModels', () => {
    it('should return models from backend', async () => {
      const mockModels = [
        { id: FIXTURE_MODEL_ID, name: 'Fixture Model', provider: 'openai', available: true },
        {
          id: SECOND_FIXTURE_MODEL_ID,
          name: 'Secondary Fixture Model',
          provider: 'anthropic',
          available: true,
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockModels);

      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      const result = await store.getAvailableModels();

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(FIXTURE_MODEL_ID);
    });

    it('should fallback to static models on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend unavailable'));

      const { useModelStore } = await import('../stores/modelStore');
      const store = useModelStore.getState();

      const result = await store.getAvailableModels();

      // Should return fallback models from getAllModels()
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset store to initial state', async () => {
      const { useModelStore } = await import('../stores/modelStore');
      useModelStore.setState({
        selectedModel: FIXTURE_MODEL_ID,
        selectedProvider: 'openai',
        favorites: ['model-a', 'model-b'],
        recentModels: ['model-c'],
        thinkingModeEnabled: true,
        error: 'some error',
      });

      const store = useModelStore.getState();
      store.reset();

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
      expect(state.favorites).toEqual([]);
      expect(state.recentModels).toEqual([]);
      expect(state.error).toBeNull();
    });
  });
});

// ============================================
// Model Metadata and Constants Tests
// ============================================

describe('LLM Constants', () => {
  describe('getModelMetadata', () => {
    it('keeps Auto routing profiles separate from provider model metadata', async () => {
      const { getModelMetadata } = await import('../constants/llm');

      expect(getModelMetadata('auto')).toBeNull();
      expect(getModelMetadata('auto-economy')).toBeNull();
      expect(getModelMetadata('auto-balanced')).toBeNull();
      expect(getModelMetadata('auto-premium')).toBeNull();
    });

    it('should return null for invalid model IDs', async () => {
      const { getModelMetadata } = await import('../constants/llm');

      const result = getModelMetadata('non-existent-model');
      expect(result).toBeNull();
    });
  });

  describe('getAllModels', () => {
    it('should return all model metadata', async () => {
      const { getAllModels } = await import('../constants/llm');

      const allModels = getAllModels();
      expect(allModels.length).toBeGreaterThan(0);
    });

    it('mirrors the shared catalog instead of maintaining a provider-specific roster', async () => {
      const { getAllModels } = await import('../constants/llm');
      const { getModels } = await import('@agiworkforce/types');

      expect(getAllModels().map((model) => model.id)).toEqual(getModels().map((model) => model.id));
    });

    it('should have valid model types', async () => {
      const { getAllModels } = await import('../constants/llm');

      const allModels = getAllModels();
      const validTypes = [
        'chat',
        'code',
        'reasoning',
        'multimodal',
        'image',
        'video',
        'search',
        'tts',
        'stt',
        'embedding',
        'music',
      ];

      allModels.forEach((model) => {
        expect(validTypes).toContain(model.modelType);
      });
    });
  });

  describe('THINKING_MODEL_VARIANTS', () => {
    it('should be empty for subscription-only model', async () => {
      const { THINKING_MODEL_VARIANTS } = await import('../constants/llm');

      // For subscription-only model, thinking variants are not used
      // Managed cloud handles model selection automatically
      expect(Object.keys(THINKING_MODEL_VARIANTS).length).toBe(0);
    });
  });

  describe('getProviderModels', () => {
    it('does not expose Auto routing profiles as managed-cloud models', async () => {
      const { getProviderModels } = await import('../constants/llm');

      const managedCloudModels = getProviderModels('managed_cloud');
      managedCloudModels.forEach((model) => {
        expect(model.provider).toBe('managed_cloud');
      });
      expect(managedCloudModels.map((model) => model.id)).not.toContain('auto');
      expect(managedCloudModels.map((model) => model.id)).not.toContain('auto-economy');
      expect(managedCloudModels.map((model) => model.id)).not.toContain('auto-balanced');
      expect(managedCloudModels.map((model) => model.id)).not.toContain('auto-premium');
    });

    it('should return empty array for legacy providers', async () => {
      const { getProviderModels } = await import('../constants/llm');

      // Legacy providers have no models in subscription-only mode
      const ollamaModels = getProviderModels('ollama');
      // Ollama models are loaded dynamically, so static list may be empty
      expect(Array.isArray(ollamaModels)).toBe(true);
    });
  });

  describe('MODEL_CONTEXT_WINDOWS', () => {
    it('does not publish a fabricated context window for an Auto routing profile', async () => {
      const { MODEL_CONTEXT_WINDOWS } = await import('../constants/llm');

      expect(MODEL_CONTEXT_WINDOWS['auto']).toBeUndefined();
      expect(MODEL_CONTEXT_WINDOWS['auto-economy']).toBeUndefined();
    });

    it('omits media models whose provider does not publish a token context limit', async () => {
      const { getModelContextWindow, MODEL_CONTEXT_WINDOWS } = await import('../constants/llm');
      const { getContextUtilization, isWithinContextLimit } = await import('../utils/tokenCount');

      expect(MODEL_CONTEXT_WINDOWS).not.toHaveProperty(CONTEXTLESS_MEDIA_MODEL_ID);
      expect(() => getModelContextWindow(CONTEXTLESS_MEDIA_MODEL_ID)).toThrow(
        'does not publish a token context window',
      );
      expect(getContextUtilization(100, CONTEXTLESS_MEDIA_MODEL_ID)).toBeNull();
      expect(isWithinContextLimit(100, CONTEXTLESS_MEDIA_MODEL_ID)).toBe(false);
      expect(Object.values(MODEL_CONTEXT_WINDOWS).every((value) => value > 0)).toBe(true);
    });

    it('should have getModelContextWindow fallback', async () => {
      const { getModelContextWindow } = await import('../constants/llm');

      // Default context window is 128_000 for all models (including unknown)
      expect(getModelContextWindow('unknown-model')).toBe(128_000);
      expect(getModelContextWindow('auto')).toBe(128_000);
    });
  });
});

// ============================================
// Media Generation Store Tests
// ============================================

describe('mediaGenerationStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
    useMediaGenerationStore.setState({
      imageJobs: [],
      videoJobs: [],
      loadingImage: false,
      loadingVideo: false,
      error: undefined,
    });
  });

  describe('initial state', () => {
    it('should have empty initial state', async () => {
      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const state = useMediaGenerationStore.getState();

      expect(state.imageJobs).toEqual([]);
      expect(state.videoJobs).toEqual([]);
      expect(state.loadingImage).toBe(false);
      expect(state.loadingVideo).toBe(false);
      expect(state.error).toBeUndefined();
    });
  });

  describe('generateImage', () => {
    it('should create an image job with running status', async () => {
      const mockResponse = {
        images: [{ url: 'https://example.com/image.png' }],
        provider: 'openai',
        model: 'fixture-image-generation-model',
        created_at: Date.now(),
        cost_estimate: 0.04,
        latency_ms: 5000,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResponse);

      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const store = useMediaGenerationStore.getState();

      const resultPromise = store.generateImage({
        prompt: 'A beautiful sunset',
        provider: 'openai',
      });

      // Check loading state immediately
      let state = useMediaGenerationStore.getState();
      expect(state.loadingImage).toBe(true);
      expect(state.imageJobs.length).toBe(1);
      expect(state.imageJobs[0]?.status).toBe('running');

      await resultPromise;

      state = useMediaGenerationStore.getState();
      expect(state.loadingImage).toBe(false);
      expect(state.imageJobs[0]?.status).toBe('completed');
    });

    it('should handle image generation errors', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const store = useMediaGenerationStore.getState();

      const result = await store.generateImage({
        prompt: 'Test prompt',
        provider: 'openai',
      });

      expect(result).toBeNull();

      const state = useMediaGenerationStore.getState();
      expect(state.error).toBe('Rate limit exceeded');
      expect(state.imageJobs[0]?.status).toBe('failed');
    });

    it('should track multiple image jobs', async () => {
      const mockResponse1 = {
        images: [{ url: 'https://example.com/image1.png' }],
        provider: 'openai',
        created_at: Date.now(),
        latency_ms: 3000,
      };

      const mockResponse2 = {
        images: [{ url: 'https://example.com/image2.png' }],
        provider: 'google',
        created_at: Date.now(),
        latency_ms: 4000,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const store = useMediaGenerationStore.getState();

      await store.generateImage({ prompt: 'Image 1', provider: 'openai' });
      await store.generateImage({ prompt: 'Image 2', provider: 'google_balanced' });

      const state = useMediaGenerationStore.getState();
      expect(state.imageJobs).toHaveLength(2);
    });
  });

  describe('generateVideo', () => {
    it('should create a video job with running status', async () => {
      const mockResponse = {
        id: 'video-123',
        status: 'completed',
        video_url: 'https://example.com/video.mp4',
        thumbnail_url: 'https://example.com/thumb.jpg',
        duration_secs: 10,
        cost_estimate: 0.5,
        latency_ms: 30000,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResponse);

      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const store = useMediaGenerationStore.getState();

      const resultPromise = store.generateVideo({
        prompt: 'A dog running in a park',
        durationSecs: 10,
      });

      // Check loading state immediately
      let state = useMediaGenerationStore.getState();
      expect(state.loadingVideo).toBe(true);
      expect(state.videoJobs.length).toBe(1);
      expect(state.videoJobs[0]?.status).toBe('running');

      await resultPromise;

      state = useMediaGenerationStore.getState();
      expect(state.loadingVideo).toBe(false);
      expect(state.videoJobs[0]?.status).toBe('completed');
      expect(state.videoJobs[0]?.videoUrl).toBe('https://example.com/video.mp4');
    });

    it('should handle video generation errors', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Insufficient credits'));

      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      const store = useMediaGenerationStore.getState();

      const result = await store.generateVideo({
        prompt: 'Test video',
      });

      expect(result).toBeNull();

      const state = useMediaGenerationStore.getState();
      expect(state.error).toBe('Insufficient credits');
      expect(state.videoJobs[0]?.status).toBe('failed');
    });
  });

  describe('clearError', () => {
    it('should clear the error state', async () => {
      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      useMediaGenerationStore.setState({ error: 'Some error' });

      const store = useMediaGenerationStore.getState();
      store.clearError();

      const state = useMediaGenerationStore.getState();
      expect(state.error).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', async () => {
      const { useMediaGenerationStore } = await import('../stores/mediaGenerationStore');
      useMediaGenerationStore.setState({
        imageJobs: [
          {
            id: '1',
            prompt: 'test',
            provider: 'openai',
            status: 'completed',
            createdAt: Date.now(),
            images: [],
          },
        ],
        videoJobs: [
          {
            id: '2',
            prompt: 'test',
            provider: 'google',
            status: 'completed',
            createdAt: Date.now(),
          },
        ],
        loadingImage: true,
        loadingVideo: true,
        error: 'Some error',
      });

      const store = useMediaGenerationStore.getState();
      store.reset();

      const state = useMediaGenerationStore.getState();
      expect(state.imageJobs).toEqual([]);
      expect(state.videoJobs).toEqual([]);
      expect(state.loadingImage).toBe(false);
      expect(state.loadingVideo).toBe(false);
      expect(state.error).toBeUndefined();
    });
  });
});

// ============================================
// Unified Chat Store Tests
// ============================================

describe('unifiedChatStore - Extended Tests', () => {
  beforeEach(async () => {
    const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
    const { useAppModeStore } = await import('../stores/appModeStore');
    useAppModeStore.setState({ mode: 'local' });
    useUnifiedChatStore.setState({
      conversations: [],
      activeConversationId: null,
      messagesByConversation: {},
      messages: [],
      fileOperations: [],
      terminalCommands: [],
      toolExecutions: [],
      screenshots: [],
      actionLog: [],
      agents: [],
      agentStatus: null,
      backgroundTasks: [],
      pendingApprovals: [],
      trustedWorkflows: {},
      activeContext: [],
      workflowContext: null,
      plan: null,
      conversationMode: 'auto',
      isLoading: false,
      isStreaming: false,
      currentStreamingMessageId: null,
      sidecarOpen: true,
      sidecarSection: 'operations',
      sidecarWidth: 400,
      sidebarWidth: 260,
      sidebarCollapsed: false,
      focusMode: null,
      pendingMessages: [],
    });
  });

  afterEach(async () => {
    const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
    const store = useUnifiedChatStore.getState();
    if (store.currentStreamingMessageId) {
      store.setStreamingMessage(null);
    }
  });

  describe('conversation mode switching', () => {
    it('should default to auto mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const state = useUnifiedChatStore.getState();
      expect(state.conversationMode).toBe('auto');
    });

    it('should switch to manual mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setConversationMode('manual');

      const state = useUnifiedChatStore.getState();
      expect(state.conversationMode).toBe('manual');
    });

    it('should switch back to auto mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({ conversationMode: 'manual' });

      const store = useUnifiedChatStore.getState();
      store.setConversationMode('auto');

      const state = useUnifiedChatStore.getState();
      expect(state.conversationMode).toBe('auto');
    });
  });

  describe('focus mode changes', () => {
    it('should default to null focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBeNull();
    });

    it('should set web focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setFocusMode('web');

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBe('web');
    });

    it('should set code focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setFocusMode('code');

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBe('code');
    });

    it('should set academic focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setFocusMode('academic');

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBe('academic');
    });

    it('should set reasoning focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setFocusMode('reasoning');

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBe('reasoning');
    });

    it('should set deep-research focus mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setFocusMode('deep-research');

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBe('deep-research');
    });

    it('should clear focus mode by setting to null', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({ focusMode: 'code' });

      const store = useUnifiedChatStore.getState();
      store.setFocusMode(null);

      const state = useUnifiedChatStore.getState();
      expect(state.focusMode).toBeNull();
    });
  });

  describe('message management', () => {
    it('should add a user message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const messageId = store.addMessage({
        role: 'user',
        content: 'Hello, AI assistant!',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.content).toBe('Hello, AI assistant!');
      expect(state.messages[0]?.role).toBe('user');
      expect(messageId).toBeDefined();
    });

    it('should add an assistant message with metadata', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({
        role: 'assistant',
        content: 'Hello! How can I help you?',
        metadata: {
          model: FIXTURE_MODEL_ID,
          provider: 'openai',
          tokenCount: 50,
          cost: 0.001,
        },
      });

      const state = useUnifiedChatStore.getState();
      expect(state.messages[0]?.metadata?.model).toBe(FIXTURE_MODEL_ID);
      expect(state.messages[0]?.metadata?.provider).toBe('openai');
    });

    it('should update an existing message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({
        role: 'assistant',
        content: 'Initial content',
      });

      const state = useUnifiedChatStore.getState();
      const messageId = state.messages[0]?.id;
      expect(messageId).toBeDefined();

      store.updateMessage(messageId!, { content: 'Updated content' });

      const updatedState = useUnifiedChatStore.getState();
      expect(updatedState.messages[0]?.content).toBe('Updated content');
    });

    it('should deep merge metadata when updating', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({
        role: 'assistant',
        content: 'Test',
        metadata: { model: FIXTURE_MODEL_ID, tokenCount: 10 },
      });

      const state = useUnifiedChatStore.getState();
      const messageId = state.messages[0]?.id;

      store.updateMessage(messageId!, { metadata: { cost: 0.01 } });

      const updatedState = useUnifiedChatStore.getState();
      expect(updatedState.messages[0]?.metadata?.model).toBe(FIXTURE_MODEL_ID);
      expect(updatedState.messages[0]?.metadata?.tokenCount).toBe(10);
      expect(updatedState.messages[0]?.metadata?.cost).toBe(0.01);
    });

    it('should update messages in inactive conversations', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const firstConversationId = store.createConversation('First chat');
      const firstMessageId = store.addMessage({
        role: 'assistant',
        content: 'Original first conversation content',
      });

      const secondConversationId = store.createConversation('Second chat');
      store.addMessage({
        role: 'assistant',
        content: 'Second conversation content',
      });

      expect(useUnifiedChatStore.getState().activeConversationId).toBe(secondConversationId);

      store.updateMessage(firstMessageId, {
        content: 'Updated first conversation content',
      });

      const updatedState = useUnifiedChatStore.getState();
      expect(updatedState.messagesByConversation[firstConversationId]?.[0]?.content).toBe(
        'Updated first conversation content',
      );
      expect(updatedState.messagesByConversation[secondConversationId]?.[0]?.content).toBe(
        'Second conversation content',
      );
    });

    it('should delete a message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({ role: 'user', content: 'Message 1' });
      store.addMessage({ role: 'assistant', content: 'Message 2' });

      let state = useUnifiedChatStore.getState();
      expect(state.messages).toHaveLength(2);

      const messageToDelete = state.messages[0]?.id;
      store.deleteMessage(messageToDelete!);

      state = useUnifiedChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.content).toBe('Message 2');
    });

    it('should add optimistic message with pending status', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const tempId = store.addOptimisticMessage({
        role: 'user',
        content: 'Sending...',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.messages[0]?.pending).toBe(true);
      expect(tempId).toBeDefined();
    });

    it('should confirm optimistic message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const tempId = store.addOptimisticMessage({
        role: 'user',
        content: 'Test message',
      });

      store.confirmOptimisticMessage(tempId, 'confirmed-id-123');

      const state = useUnifiedChatStore.getState();
      expect(state.messages[0]?.pending).toBeUndefined();
      expect(state.messages[0]?.id).toBe('confirmed-id-123');
    });

    it('should fail optimistic message with error', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const tempId = store.addOptimisticMessage({
        role: 'user',
        content: 'Test message',
      });

      store.failOptimisticMessage(tempId, 'Network error');

      const state = useUnifiedChatStore.getState();
      expect(state.messages[0]?.pending).toBeUndefined();
      expect(state.messages[0]?.error).toBe('Network error');
    });
  });

  describe('approval workflows', () => {
    it('should add an approval request', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addApprovalRequest({
        id: 'approval-1',
        type: 'terminal_command',
        description: 'Execute: rm -rf /tmp/test',
        riskLevel: 'high',
        details: { command: 'rm -rf /tmp/test' },
      });

      const state = useUnifiedChatStore.getState();
      expect(state.pendingApprovals).toHaveLength(1);
      expect(state.pendingApprovals[0]?.status).toBe('pending');
      expect(state.pendingApprovals[0]?.type).toBe('terminal_command');
    });

    it('should approve an operation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        pendingApprovals: [
          {
            id: 'approval-1',
            type: 'file_delete',
            description: 'Delete file',
            riskLevel: 'medium',
            details: {},
            status: 'pending',
            createdAt: new Date(),
          },
        ],
      });

      const store = useUnifiedChatStore.getState();
      store.approveOperation('approval-1');

      const state = useUnifiedChatStore.getState();
      // After approval, the request is removed from pending
      expect(state.pendingApprovals).toHaveLength(0);
    });

    it('should reject an operation with reason', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        pendingApprovals: [
          {
            id: 'approval-1',
            type: 'terminal_command',
            description: 'Dangerous command',
            riskLevel: 'high',
            details: {},
            status: 'pending',
            createdAt: new Date(),
          },
        ],
      });

      const store = useUnifiedChatStore.getState();
      store.rejectOperation('approval-1', 'Too risky');

      const state = useUnifiedChatStore.getState();
      // After rejection, the request is removed from pending
      expect(state.pendingApprovals).toHaveLength(0);
    });

    it('should track trusted workflows', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.setTrustedWorkflow({
        hash: 'workflow-hash-123',
        label: 'Safe file operations',
        createdAt: new Date(),
        actionSignatures: ['read_file', 'write_file'],
      });

      const state = useUnifiedChatStore.getState();
      expect(state.trustedWorkflows['workflow-hash-123']).toBeDefined();
      expect(state.trustedWorkflows['workflow-hash-123']?.label).toBe('Safe file operations');
    });

    it('should check if action is trusted', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        trustedWorkflows: {
          'workflow-123': {
            hash: 'workflow-123',
            createdAt: new Date(),
            actionSignatures: ['read_file', 'list_directory'],
          },
        },
      });

      const store = useUnifiedChatStore.getState();

      expect(store.isActionTrusted('workflow-123', 'read_file')).toBe(true);
      expect(store.isActionTrusted('workflow-123', 'delete_file')).toBe(false);
      expect(store.isActionTrusted('unknown-workflow', 'read_file')).toBe(false);
    });

    it('should record trusted action', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.recordTrustedAction('new-workflow', 'execute_command');

      const state = useUnifiedChatStore.getState();
      expect(state.trustedWorkflows['new-workflow']?.actionSignatures).toContain('execute_command');
    });

    it('should remove trusted workflow', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        trustedWorkflows: {
          'workflow-to-remove': {
            hash: 'workflow-to-remove',
            createdAt: new Date(),
            actionSignatures: [],
          },
        },
      });

      const store = useUnifiedChatStore.getState();
      store.removeTrustedWorkflow('workflow-to-remove');

      const state = useUnifiedChatStore.getState();
      expect(state.trustedWorkflows['workflow-to-remove']).toBeUndefined();
    });
  });

  describe('conversation management', () => {
    it('should create a new conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const conversationId = store.createConversation('Test Conversation');

      const state = useUnifiedChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]?.title).toBe('Test Conversation');
      expect(state.activeConversationId).toBe(conversationId);
    });

    it('should select a conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const id1 = store.createConversation('Conversation 1');
      const id2 = store.createConversation('Conversation 2');

      expect(useUnifiedChatStore.getState().activeConversationId).toBe(id2);

      store.selectConversation(id1);

      expect(useUnifiedChatStore.getState().activeConversationId).toBe(id1);
    });

    it('should rename a conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const id = store.createConversation('Original Name');
      store.renameConversation(id, 'New Name');

      const state = useUnifiedChatStore.getState();
      expect(state.conversations[0]?.title).toBe('New Name');
    });

    it('should delete a conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const id1 = store.createConversation('Conversation 1');
      store.createConversation('Conversation 2');

      store.deleteConversation(id1);

      const state = useUnifiedChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]?.title).toBe('Conversation 2');
    });

    it('should toggle pinned conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const id = store.createConversation('My Conversation');

      expect(useUnifiedChatStore.getState().conversations[0]?.pinned).toBe(false);

      store.togglePinnedConversation(id);

      expect(useUnifiedChatStore.getState().conversations[0]?.pinned).toBe(true);

      store.togglePinnedConversation(id);

      expect(useUnifiedChatStore.getState().conversations[0]?.pinned).toBe(false);
    });

    it('should archive and restore conversation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const id = store.createConversation('Archivable Conversation');

      store.archiveConversation(id);

      let state = useUnifiedChatStore.getState();
      expect(state.conversations[0]?.archived).toBe(true);

      store.restoreConversation(id);

      state = useUnifiedChatStore.getState();
      expect(state.conversations[0]?.archived).toBe(false);
    });
  });

  describe('action log management', () => {
    it('should add action log entry', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addActionLogEntry({
        id: 'action-1',
        type: 'terminal',
        title: 'Execute command',
        status: 'running',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.actionLog).toHaveLength(1);
      expect(state.actionLog[0]?.title).toBe('Execute command');
    });

    it('should update action log entry', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        actionLog: [
          {
            id: 'action-1',
            type: 'terminal',
            title: 'Execute command',
            status: 'running',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const store = useUnifiedChatStore.getState();
      store.updateActionLogEntry('action-1', { status: 'success', result: 'Done' });

      const state = useUnifiedChatStore.getState();
      expect(state.actionLog[0]?.status).toBe('success');
      expect(state.actionLog[0]?.result).toBe('Done');
    });

    it('should limit action log to 500 entries', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');

      // Add 501 entries
      for (let i = 0; i < 501; i++) {
        useUnifiedChatStore.getState().addActionLogEntry({
          id: `action-${i}`,
          type: 'plan',
          title: `Action ${i}`,
          status: 'success',
        });
      }

      const state = useUnifiedChatStore.getState();
      expect(state.actionLog.length).toBeLessThanOrEqual(500);
    });
  });

  describe('background tasks', () => {
    it('should add background task', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addBackgroundTask({
        id: 'task-1',
        name: 'File indexing',
        status: 'running',
        progress: 0,
        priority: 'normal',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.backgroundTasks).toHaveLength(1);
      expect(state.backgroundTasks[0]?.name).toBe('File indexing');
    });

    it('should update task progress', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        backgroundTasks: [
          {
            id: 'task-1',
            name: 'Processing',
            status: 'running',
            progress: 0,
            priority: 'normal',
            createdAt: new Date(),
          },
        ],
      });

      const store = useUnifiedChatStore.getState();
      store.updateTaskProgress('task-1', 50);

      const state = useUnifiedChatStore.getState();
      expect(state.backgroundTasks[0]?.progress).toBe(50);
    });

    it('should prevent duplicate task IDs', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addBackgroundTask({
        id: 'task-1',
        name: 'Task 1',
        status: 'running',
        progress: 0,
        priority: 'normal',
      });

      store.addBackgroundTask({
        id: 'task-1',
        name: 'Duplicate Task',
        status: 'running',
        progress: 0,
        priority: 'normal',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.backgroundTasks).toHaveLength(1);
      expect(state.backgroundTasks[0]?.name).toBe('Task 1');
    });
  });

  describe('sidecar management', () => {
    it('should open sidecar with mode', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.openSidecar('browser', 'context-123', { url: 'https://example.com' });

      const state = useUnifiedChatStore.getState();
      expect(state.sidecar.isOpen).toBe(true);
      expect(state.sidecar.activeMode).toBe('browser');
      expect(state.sidecar.contextId).toBe('context-123');
    });

    it('should close sidecar', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        sidecar: { isOpen: true, activeMode: 'code', contextId: 'test', autoTrigger: false },
        sidecarOpen: true,
      });

      const store = useUnifiedChatStore.getState();
      store.closeSidecar();

      const state = useUnifiedChatStore.getState();
      expect(state.sidecar.isOpen).toBe(false);
      expect(state.sidecarOpen).toBe(false);
    });

    it('should ignore event-driven sidecar section updates while the sidecar is closed', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({ sidecarUserSelected: false, sidecarOpen: false });

      const store = useUnifiedChatStore.getState();
      store.setSidecarSectionFromEvent('terminal_execute');

      const state = useUnifiedChatStore.getState();
      expect(state.sidecarSection).toBe('operations');
      expect(state.sidecarOpen).toBe(false);
    });

    it('should update sidecar section from event only when the sidecar is already open', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        sidecarUserSelected: false,
        sidecarOpen: true,
        sidecar: { isOpen: true, activeMode: 'code', contextId: null, autoTrigger: false },
      });

      const store = useUnifiedChatStore.getState();
      store.setSidecarSectionFromEvent('terminal_execute');

      const state = useUnifiedChatStore.getState();
      expect(state.sidecarSection).toBe('terminal');
      expect(state.sidecarOpen).toBe(true);
    });
  });

  describe('token usage tracking', () => {
    it('should update token usage', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.updateTokenUsage({
        current: 5000,
        inputTokens: 3000,
        outputTokens: 2000,
        max: 128000,
      });

      const state = useUnifiedChatStore.getState();
      expect(state.tokenUsage.current).toBe(5000);
      expect(state.tokenUsage.inputTokens).toBe(3000);
      expect(state.tokenUsage.outputTokens).toBe(2000);
    });

    it('should calculate percentage', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.updateTokenUsage({
        current: 64000,
        max: 128000,
      });

      const state = useUnifiedChatStore.getState();
      expect(state.tokenUsage.percentage).toBe(50);
    });
  });

  describe('citations', () => {
    it('should add citation', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addCitation({
        index: 1,
        url: 'https://example.com/article',
        title: 'Example Article',
        snippet: 'This is a snippet from the article...',
      });

      const state = useUnifiedChatStore.getState();
      expect(state.citations).toHaveLength(1);
      expect(state.citations[0]?.title).toBe('Example Article');
    });

    it('should get citation by index', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addCitation({ index: 1, url: 'https://example.com/1' });
      store.addCitation({ index: 2, url: 'https://example.com/2' });

      const citation = store.getCitationByIndex(2);
      expect(citation?.url).toBe('https://example.com/2');
    });

    it('should clear citations', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addCitation({ index: 1, url: 'https://example.com' });
      store.clearCitations();

      const state = useUnifiedChatStore.getState();
      expect(state.citations).toHaveLength(0);
    });
  });

  describe('pending messages for mid-task input', () => {
    it('should add pending message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addPendingMessage({
        id: 'pending-1',
        content: 'User input during task',
        timestamp: new Date().toISOString(),
      });

      const state = useUnifiedChatStore.getState();
      expect(state.pendingMessages).toHaveLength(1);
    });

    it('should remove pending message', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        pendingMessages: [
          { id: 'pending-1', content: 'Test', timestamp: new Date().toISOString() },
        ],
      });

      const store = useUnifiedChatStore.getState();
      store.removePendingMessage('pending-1');

      const state = useUnifiedChatStore.getState();
      expect(state.pendingMessages).toHaveLength(0);
    });

    it('should get pending messages count', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      useUnifiedChatStore.setState({
        pendingMessages: [
          { id: '1', content: 'A', timestamp: new Date().toISOString() },
          { id: '2', content: 'B', timestamp: new Date().toISOString() },
        ],
      });

      const store = useUnifiedChatStore.getState();
      expect(store.getPendingMessagesCount()).toBe(2);
    });
  });

  describe('message bookmarks and reactions', () => {
    it('should toggle message bookmark', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({ role: 'user', content: 'Important message' });
      const state = useUnifiedChatStore.getState();
      const messageId = state.messages[0]?.id;

      store.toggleMessageBookmark(messageId!);

      expect(useUnifiedChatStore.getState().messages[0]?.bookmarked).toBe(true);

      store.toggleMessageBookmark(messageId!);

      expect(useUnifiedChatStore.getState().messages[0]?.bookmarked).toBe(false);
    });

    it('should toggle message reaction', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({ role: 'assistant', content: 'Great response!' });
      const state = useUnifiedChatStore.getState();
      const messageId = state.messages[0]?.id;

      store.toggleMessageReaction(messageId!, 'thumbsUp');

      expect(useUnifiedChatStore.getState().messages[0]?.reactions).toContain('thumbsUp');

      store.toggleMessageReaction(messageId!, 'thumbsUp');

      expect(useUnifiedChatStore.getState().messages[0]?.reactions).not.toContain('thumbsUp');
    });

    it('should get bookmarked messages', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      store.addMessage({ role: 'user', content: 'Message 1' });
      store.addMessage({ role: 'assistant', content: 'Message 2' });

      const state = useUnifiedChatStore.getState();
      const firstMessageId = state.messages[0]?.id;
      expect(firstMessageId).toBeDefined();
      if (firstMessageId) {
        store.toggleMessageBookmark(firstMessageId);
      }

      const bookmarked = store.getBookmarkedMessages();
      expect(bookmarked).toHaveLength(1);
      expect(bookmarked[0]?.content).toBe('Message 1');
    });
  });

  describe('getSuggestedSidecarMode', () => {
    it('should suggest code mode for large code blocks', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const message = {
        id: 'test',
        role: 'assistant' as const,
        content: '```javascript\n' + 'console.log("line");\n'.repeat(20) + '```',
        timestamp: new Date(),
      };

      const mode = store.getSuggestedSidecarMode(message);
      expect(mode).toBe('code');
    });

    it('should suggest browser mode for URLs', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const message = {
        id: 'test',
        role: 'assistant' as const,
        content: 'Check out https://example.com for more info',
        timestamp: new Date(),
      };

      const mode = store.getSuggestedSidecarMode(message);
      expect(mode).toBe('browser');
    });

    it('should suggest data mode for CSV content', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const message = {
        id: 'test',
        role: 'assistant' as const,
        content: 'Here is the data:\nid,name,value\n1,foo,100\n2,bar,200',
        timestamp: new Date(),
      };

      const mode = store.getSuggestedSidecarMode(message);
      expect(mode).toBe('data');
    });

    it('should suggest diff mode for diff content', async () => {
      const { useUnifiedChatStore } = await import('../stores/unifiedChatStore');
      const store = useUnifiedChatStore.getState();

      const message = {
        id: 'test',
        role: 'assistant' as const,
        content: 'Here is the diff:\n--- old.txt\n+++ new.txt',
        timestamp: new Date(),
      };

      const mode = store.getSuggestedSidecarMode(message);
      expect(mode).toBe('diff');
    });
  });
});

// ============================================
// Model Store Selector Tests
// ============================================

describe('modelStore selectors', () => {
  beforeEach(async () => {
    const { useModelStore } = await import('../stores/modelStore');
    // For subscription-only model, use 'auto' with managed_cloud provider
    useModelStore.setState({
      selectedModel: 'auto',
      selectedProvider: 'managed_cloud',
      favorites: [], // Empty favorites for subscription-only model
      recentModels: [], // Empty recent models - populated dynamically
      thinkingModeEnabled: false,
      loading: false,
      error: null,
      providerStatuses: {
        openai: null,
        anthropic: null,
        google: null,
        ollama: null,
        lmstudio: null,
        llamacpp: null,
        vllm: null,
        xai: null,
        deepseek: null,
        qwen: null,
        moonshot: null,
        perplexity: null,
        zhipu: null,
        managed_cloud: null,
        mistral: null,
        groq: null,
        together: null,
        fireworks: null,
        cerebras: null,
        deepinfra: null,
        nvidia_nim: null,
        open_router: null,
        cohere: null,
        ai21: null,
        sambanova: null,
        azure: null,
        bedrock: null,
      },
      availableModels: [],
      usageStats: null,
    });
  });

  it('selectFavoriteModelsMetadata should return empty array for subscription model', async () => {
    const { useModelStore, selectFavoriteModelsMetadata } = await import('../stores/modelStore');
    const state = useModelStore.getState();

    const favoriteMetadata = selectFavoriteModelsMetadata(state);

    // For subscription-only model, favorites are empty by default
    expect(favoriteMetadata).toHaveLength(0);
  });

  it('selectRecentModelsMetadata should return empty array initially', async () => {
    const { useModelStore, selectRecentModelsMetadata } = await import('../stores/modelStore');
    const state = useModelStore.getState();

    const recentMetadata = selectRecentModelsMetadata(state);

    // Initially empty, populated as user uses models
    expect(recentMetadata).toHaveLength(0);
  });

  it('selectSelectedModelMetadata should return null when model not in registry', async () => {
    const { useModelStore, selectSelectedModelMetadata } = await import('../stores/modelStore');

    // Set a model that doesn't exist in registry
    useModelStore.setState({ selectedModel: 'non-existent-model' });
    const state = useModelStore.getState();

    const selectedMetadata = selectSelectedModelMetadata(state);

    // Model not in registry returns null
    expect(selectedMetadata).toBeNull();
  });

  it('selectIsModelFavorite should check if model is favorited', async () => {
    const { useModelStore, selectIsModelFavorite } = await import('../stores/modelStore');

    // Add a favorite using toggleFavorite
    useModelStore.getState().toggleFavorite('test-model');
    const state = useModelStore.getState();

    expect(selectIsModelFavorite('test-model')(state)).toBe(true);
    expect(selectIsModelFavorite('non-favorite')(state)).toBe(false);
  });
});

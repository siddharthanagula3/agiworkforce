/**
 * Unit tests for modelStore.
 *
 * Mobile v1 is local-first: selectable model ids are local-LLM rows or local
 * auto modes. Cloud provider ids are ignored by the store.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function') {
      store.persist.rehydrate();
    }
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { DEFAULT_LOCAL_MODEL_ID, LOCAL_MODEL_LIST } from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LITE_MODEL_ID = 'llama-3.2-1b-instruct-spinquant';
const VISION_MODEL_ID = 'qwen2.5-vl-3b-instruct';
const CLOUD_MODEL_ID = 'gpt-5.4';

function getState() {
  return useModelStore.getState();
}

function resetStore() {
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('modelStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('setModel', () => {
    it('updates selectedModel for local models', () => {
      getState().setModel(LITE_MODEL_ID);

      expect(getState().selectedModel).toBe(LITE_MODEL_ID);
      expect(getState().selectedProvider).toBe('local');
    });

    it('updates selectedModel for local auto modes', () => {
      getState().setModel('auto-balanced');

      expect(getState().selectedModel).toBe('auto-balanced');
      expect(getState().selectedProvider).toBe('local');
    });

    it('ignores cloud provider model ids', () => {
      getState().setModel(CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
      expect(getState().recentModels).toEqual([]);
    });

    it('pushes local models to recents newest first', () => {
      getState().setModel(LITE_MODEL_ID);
      getState().setModel(VISION_MODEL_ID);

      expect(getState().recentModels[0]).toBe(VISION_MODEL_ID);
      expect(getState().recentModels[1]).toBe(LITE_MODEL_ID);
    });

    it('deduplicates recents', () => {
      getState().setModel(LITE_MODEL_ID);
      getState().setModel(VISION_MODEL_ID);
      getState().setModel(LITE_MODEL_ID);

      const recents = getState().recentModels;
      expect(recents[0]).toBe(LITE_MODEL_ID);
      expect(recents.filter((id) => id === LITE_MODEL_ID)).toHaveLength(1);
    });

    it('limits recents to 5 selectable entries and deduplicates', () => {
      // apple-foundation-models and gemini-nano-aicore are filtered from
      // LOCAL_MODEL_LIST in v1 (stub native impl), so the list has 3 entries.
      // Cycle local ids and auto modes repeatedly to exceed the cap.
      const localIds = LOCAL_MODEL_LIST.map((model) => model.id);
      const manyIds = [
        ...localIds,
        'auto-balanced',
        'auto-economy',
        'auto-premium',
        // Second pass — duplicates should be deduped before capping.
        ...localIds,
        'auto-balanced',
      ].filter((id): id is string => id !== undefined);
      for (const id of manyIds) {
        getState().setModel(id);
      }

      // Cap is enforced — never exceeds MAX_RECENT.
      expect(getState().recentModels.length).toBeLessThanOrEqual(5);
      // No duplicates in the list.
      const recents = getState().recentModels;
      expect(new Set(recents).size).toBe(recents.length);
    });

    it('syncs legacy thinkingModeEnabled from per-model local state', () => {
      useModelStore.setState({
        thinkingEnabledPerModel: { [LITE_MODEL_ID]: true },
      });

      getState().setModel(LITE_MODEL_ID);

      expect(getState().thinkingModeEnabled).toBe(true);
    });
  });

  describe('toggleFavorite', () => {
    it('adds and removes a local model from favorites', () => {
      getState().toggleFavorite(LITE_MODEL_ID);
      expect(getState().favorites).toContain(LITE_MODEL_ID);

      getState().toggleFavorite(LITE_MODEL_ID);
      expect(getState().favorites).not.toContain(LITE_MODEL_ID);
    });

    it('ignores cloud model ids', () => {
      getState().toggleFavorite(CLOUD_MODEL_ID);

      expect(getState().favorites).toEqual([]);
    });

    it('ignores auto modes', () => {
      getState().toggleFavorite('auto-balanced');

      expect(getState().favorites).toEqual([]);
    });
  });

  describe('setProvider', () => {
    it('keeps selectedProvider locked to local', () => {
      getState().setProvider('managed_cloud');

      expect(getState().selectedProvider).toBe('local');
    });
  });

  describe('thinking controls', () => {
    it('starts with an empty per-model thinking record', () => {
      expect(getState().thinkingEnabledPerModel).toEqual({});
    });

    it('does not enable thinking for local v1 models', () => {
      getState().toggleThinkingForModel(DEFAULT_LOCAL_MODEL_ID);

      expect(getState().thinkingEnabledPerModel[DEFAULT_LOCAL_MODEL_ID]).toBeUndefined();
    });

    it('does not enable thinking for cloud model ids', () => {
      getState().toggleThinkingForModel(CLOUD_MODEL_ID);

      expect(getState().thinkingEnabledPerModel[CLOUD_MODEL_ID]).toBeUndefined();
    });

    it('does not enable thinking for auto modes', () => {
      getState().toggleThinkingForModel('auto-balanced');

      expect(getState().thinkingEnabledPerModel['auto-balanced']).toBeUndefined();
    });

    it('returns false when the selected local model has no thinking state', () => {
      expect(getState().isThinkingEnabledForSelected()).toBe(false);
    });

    it('guards setThinkingMode(true) for local models without thinking support', () => {
      getState().setThinkingMode(true);

      expect(getState().thinkingModeEnabled).toBe(false);
    });

    it('allows disabling thinking regardless of model support', () => {
      useModelStore.setState({
        selectedModel: DEFAULT_LOCAL_MODEL_ID,
        thinkingModeEnabled: true,
      });

      getState().setThinkingMode(false);

      expect(getState().thinkingModeEnabled).toBe(false);
    });
  });
});

/**
 * Unit tests for modelStore.
 *
 * Mobile starts from local models: selectable ids are local rows with an active
 * runtime/download preset or local auto modes. Cloud provider ids require an
 * explicit invite unlock before the store accepts them.
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

import {
  AUTO_MODES,
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  LOCKED_CLOUD_MODELS,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LITE_MODEL_ID = 'llama-3.2-1b-instruct-spinquant';
const CLOUD_MODEL_ID = LOCKED_CLOUD_MODELS[0]?.id ?? 'gpt-5.6-sol';
const SELECTABLE_MODEL_IDS = LOCAL_MODEL_LIST.map((model) => model.id);
const SECOND_SELECTABLE_MODEL_ID = SELECTABLE_MODEL_IDS.find((id) => id !== LITE_MODEL_ID);
const SELECTABLE_AUTO_MODE_ID = AUTO_MODES[0]?.id;

function getState() {
  return useModelStore.getState();
}

function resetStore() {
  useWaitlistStore.setState({
    joined: false,
    email: undefined,
    country: undefined,
    rank: undefined,
    joinedAt: undefined,
    cloudUnlocked: false,
    inviteId: undefined,
    inviteCode: undefined,
    cloudUnlockedAt: undefined,
  });
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

    it('updates selectedModel for the registry-owned Auto mode', () => {
      expect(SELECTABLE_AUTO_MODE_ID).toBeDefined();
      getState().setModel(SELECTABLE_AUTO_MODE_ID!);

      expect(getState().selectedModel).toBe(SELECTABLE_AUTO_MODE_ID);
      expect(getState().selectedProvider).toBe('local');
    });

    it('ignores cloud provider model ids before invite access', () => {
      getState().setModel(CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
      expect(getState().recentModels).toEqual([]);
    });

    it('selects cloud provider model ids after invite access', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });

      getState().setModel(CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(CLOUD_MODEL_ID);
      expect(getState().selectedProvider).toBe('cloud_managed');
      expect(getState().recentModels[0]).toBe(CLOUD_MODEL_ID);
    });

    it('selects the registry-owned shared default after cloud access is unlocked', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      if (!DEFAULT_CLOUD_MODEL_ID) {
        throw new Error('Expected a default cloud model for the mobile cloud picker.');
      }

      getState().setModel(DEFAULT_CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(DEFAULT_CLOUD_MODEL_ID);
      expect(getState().selectedProvider).toBe('cloud_managed');
    });

    it('pushes local models to recents newest first', () => {
      expect(SECOND_SELECTABLE_MODEL_ID).toBeDefined();

      getState().setModel(LITE_MODEL_ID);
      getState().setModel(SECOND_SELECTABLE_MODEL_ID!);

      expect(getState().recentModels[0]).toBe(SECOND_SELECTABLE_MODEL_ID);
      expect(getState().recentModels[1]).toBe(LITE_MODEL_ID);
    });

    it('deduplicates recents', () => {
      expect(SECOND_SELECTABLE_MODEL_ID).toBeDefined();

      getState().setModel(LITE_MODEL_ID);
      getState().setModel(SECOND_SELECTABLE_MODEL_ID!);
      getState().setModel(LITE_MODEL_ID);

      const recents = getState().recentModels;
      expect(recents[0]).toBe(LITE_MODEL_ID);
      expect(recents.filter((id) => id === LITE_MODEL_ID)).toHaveLength(1);
    });

    it('limits recents to 5 selectable entries and deduplicates', () => {
      const localIds = LOCAL_MODEL_LIST.map((model) => model.id);
      const manyIds = [
        ...localIds,
        ...AUTO_MODES.map((mode) => mode.id),
        // Second pass — duplicates should be deduped before capping.
        ...localIds,
        ...AUTO_MODES.map((mode) => mode.id),
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
    it('keeps selectedProvider local before invite access', () => {
      getState().setProvider('cloud_managed');

      expect(getState().selectedProvider).toBe('local');
    });

    it('allows cloud provider after invite access', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });

      getState().setProvider('cloud_managed');

      expect(getState().selectedProvider).toBe('cloud_managed');
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

    it('initializes mandatory Fable 5 reasoning and refuses to turn it off', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });

      getState().setModel('claude-fable-5');

      expect(getState().thinkingModeEnabled).toBe(true);
      expect(getState().thinkingEnabledPerModel['claude-fable-5']).toBe(true);
      expect(getState().isThinkingEnabledForSelected()).toBe(true);

      getState().toggleThinkingForModel('claude-fable-5');
      getState().setThinkingMode(false);

      expect(getState().thinkingModeEnabled).toBe(true);
      expect(getState().thinkingEnabledPerModel['claude-fable-5']).toBe(true);
    });
  });
});

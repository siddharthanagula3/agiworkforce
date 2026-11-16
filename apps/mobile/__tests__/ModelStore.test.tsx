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

import {
  AUTO_MODES,
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  LOCKED_CLOUD_MODELS,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { getModelReasoning, isAutoModeModelId } from '@agiworkforce/types';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { requireLocalModel, requireMobileCloudModel } from '../test-utils/modelFixtures';
import {
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';

const LITE_MODEL_ID = requireLocalModel(
  (model) => model.role === 'lite-mode',
  'lite-mode model',
).id;
const CLOUD_MODEL_ID = LOCKED_CLOUD_MODELS[0]?.id ?? requireMobileCloudModel().id;
const MANDATORY_REASONING_MODEL_ID = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  return reasoning.capable && reasoning.canDisableThinking === false;
}, 'Mobile Cloud model with mandatory reasoning').id;
const SELECTABLE_MODEL_IDS = LOCAL_MODEL_LIST.map((model) => model.id);
const SECOND_SELECTABLE_MODEL_ID = SELECTABLE_MODEL_IDS.find((id) => id !== LITE_MODEL_ID);
const SELECTABLE_AUTO_MODE_ID = AUTO_MODES[0]?.id;
const MAX_ONLY_MODEL_ID = requireMobileCloudModel(
  (model) =>
    canAccessCloudModelForTier(model.id, 'max') && !canAccessCloudModelForTier(model.id, 'pro'),
  'Max-only Mobile Cloud model',
).id;

const PRO_CHOICE_ID = requireMobileCloudModel(
  (model) =>
    !isAutoModeModelId(model.id) &&
    canAccessCloudModelForTier(model.id, 'pro') &&
    model.id !== getDefaultCloudModelIdForTier('pro'),
  'non-default Mobile Cloud model on the Pro plan',
).id;
const OTHER_PRO_MODEL_ID = requireMobileCloudModel(
  (model) =>
    !isAutoModeModelId(model.id) &&
    canAccessCloudModelForTier(model.id, 'pro') &&
    model.id !== PRO_CHOICE_ID,
  'second Mobile Cloud model on the Pro plan',
).id;

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
    newChatModels: { local: null, cloud: null },
    conversationModelShown: false,
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
  useChatAppModeStore.setState({ appMode: 'local' });
  useTierStore.setState({ tier: 'free', billingTier: 'free', lastRefreshedAt: null });
}

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
      useTierStore.setState({ tier: 'max', billingTier: 'max' });

      getState().setModel(CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(CLOUD_MODEL_ID);
      expect(getState().selectedProvider).toBe('cloud_managed');
      expect(getState().recentModels[0]).toBe(CLOUD_MODEL_ID);
    });

    it('selects the registry-owned shared default after cloud access is unlocked', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'max', billingTier: 'max' });
      if (!DEFAULT_CLOUD_MODEL_ID) {
        throw new Error('Expected a default cloud model for the mobile cloud picker.');
      }

      getState().setModel(DEFAULT_CLOUD_MODEL_ID);

      expect(getState().selectedModel).toBe(DEFAULT_CLOUD_MODEL_ID);
      expect(getState().selectedProvider).toBe('cloud_managed');
    });

    it('rejects a Cloud model that is locked for the current plan', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'pro', billingTier: 'pro' });

      getState().setModel(MAX_ONLY_MODEL_ID);

      expect(getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
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
        ...localIds,
        ...AUTO_MODES.map((mode) => mode.id),
      ].filter((id): id is string => id !== undefined);
      for (const id of manyIds) {
        getState().setModel(id);
      }

      expect(getState().recentModels.length).toBeLessThanOrEqual(5);
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

  describe('the choice for new chats', () => {
    function unlockPro() {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'pro', billingTier: 'pro' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    }

    function startOfProcess(persisted: Record<string, unknown>) {
      useWaitlistStore.setState({ cloudUnlocked: false });
      useTierStore.setState({ tier: 'pro', billingTier: 'pro' });
      const merge = useModelStore.persist.getOptions().merge;
      return merge?.(persisted, useModelStore.getState());
    }

    it('survives a restart, when Cloud access is not yet known', () => {
      const hydrated = startOfProcess({
        selectedModel: PRO_CHOICE_ID,
        newChatModels: { local: null, cloud: PRO_CHOICE_ID },
      });

      expect(hydrated?.selectedModel).toBe(PRO_CHOICE_ID);
      expect(hydrated?.selectedProvider).toBe('cloud_managed');
      expect(hydrated?.newChatModels?.cloud).toBe(PRO_CHOICE_ID);
    });

    it('returns to their own choice after a restart that left a project model shown', () => {
      const hydrated = startOfProcess({
        selectedModel: OTHER_PRO_MODEL_ID,
        conversationModelShown: true,
        newChatModels: { local: null, cloud: PRO_CHOICE_ID },
      });

      expect(hydrated?.selectedModel).toBe(PRO_CHOICE_ID);
      expect(hydrated?.selectedProvider).toBe('cloud_managed');
      expect(hydrated?.newChatModels?.cloud).toBe(PRO_CHOICE_ID);
      expect(hydrated?.conversationModelShown).toBe(false);
    });

    it('never adopts a model shown only for a conversation as the choice for new chats', () => {
      const hydrated = startOfProcess({
        selectedModel: PRO_CHOICE_ID,
        conversationModelShown: true,
      });

      expect(hydrated?.newChatModels).toEqual({ local: null, cloud: null });
      expect(hydrated?.selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
      expect(hydrated?.selectedModel).not.toBe(PRO_CHOICE_ID);
    });

    it('is read from the model saved by a version that only kept one selection', () => {
      const cloud = startOfProcess({ selectedModel: PRO_CHOICE_ID });
      expect(cloud?.newChatModels).toEqual({ local: null, cloud: PRO_CHOICE_ID });

      const local = startOfProcess({ selectedModel: LITE_MODEL_ID });
      expect(local?.newChatModels).toEqual({ local: LITE_MODEL_ID, cloud: null });
    });

    it('ignores a saved choice that is not a model of its mode', () => {
      const hydrated = startOfProcess({
        selectedModel: DEFAULT_LOCAL_MODEL_ID,
        newChatModels: { local: PRO_CHOICE_ID, cloud: 42 },
      });

      expect(hydrated?.newChatModels).toEqual({ local: null, cloud: null });
    });

    it('is recorded per mode, so a Local pick does not replace the Cloud one', () => {
      unlockPro();
      getState().setModel(PRO_CHOICE_ID);
      useChatAppModeStore.setState({ appMode: 'local' });
      getState().setModel(LITE_MODEL_ID);

      expect(getState().newChatModels).toEqual({ local: LITE_MODEL_ID, cloud: PRO_CHOICE_ID });
    });

    it('stays when a conversation shows its own model, and returns when the new chat does', () => {
      unlockPro();
      getState().setModel(PRO_CHOICE_ID);

      getState().showConversationModel(OTHER_PRO_MODEL_ID);
      expect(getState().selectedModel).toBe(OTHER_PRO_MODEL_ID);
      expect(getState().newChatModels.cloud).toBe(PRO_CHOICE_ID);

      getState().endConversationModel();
      expect(getState().selectedModel).toBe(PRO_CHOICE_ID);
      expect(getState().conversationModelShown).toBe(false);
    });

    it('leaves a pick made in the new chat alone when the new chat takes focus', () => {
      unlockPro();
      getState().setModel(PRO_CHOICE_ID);
      getState().showConversationModel(OTHER_PRO_MODEL_ID);
      getState().setModel(PRO_CHOICE_ID);
      useModelStore.setState({ selectedModel: OTHER_PRO_MODEL_ID });

      getState().endConversationModel();

      expect(getState().selectedModel).toBe(OTHER_PRO_MODEL_ID);
    });

    it('falls back to the plan default for a saved choice the plan no longer includes', () => {
      unlockPro();
      useTierStore.setState({ lastRefreshedAt: new Date().toISOString() });
      useModelStore.setState({
        selectedModel: OTHER_PRO_MODEL_ID,
        newChatModels: { local: null, cloud: MAX_ONLY_MODEL_ID },
        conversationModelShown: true,
      });

      getState().endConversationModel();

      expect(getState().selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
      expect(getState().newChatModels.cloud).toBe(getDefaultCloudModelIdForTier('pro'));
    });

    it('keeps a saved choice the plan has not yet been confirmed to include', () => {
      unlockPro();
      useModelStore.setState({
        selectedModel: OTHER_PRO_MODEL_ID,
        newChatModels: { local: null, cloud: MAX_ONLY_MODEL_ID },
        conversationModelShown: true,
      });

      getState().endConversationModel();

      expect(getState().selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
      expect(getState().newChatModels.cloud).toBe(MAX_ONLY_MODEL_ID);
    });

    it('is reset with the plan when the plan changes, even while a conversation is shown', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'max', billingTier: 'max' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      getState().setModel(MAX_ONLY_MODEL_ID);
      getState().showConversationModel(OTHER_PRO_MODEL_ID);

      useTierStore.setState({ tier: 'pro', billingTier: 'pro' });

      expect(getState().selectedModel).toBe(OTHER_PRO_MODEL_ID);
      expect(getState().newChatModels.cloud).toBe(getDefaultCloudModelIdForTier('pro'));
    });

    it('comes back for Cloud after a detour through Local', () => {
      unlockPro();
      getState().setModel(PRO_CHOICE_ID);
      useChatAppModeStore.setState({ appMode: 'local' });
      getState().setModel(DEFAULT_LOCAL_MODEL_ID);

      useChatAppModeStore.setState({ appMode: 'cloud' });
      getState().restoreNewChatModel();

      expect(getState().selectedModel).toBe(PRO_CHOICE_ID);
    });

    it('waits for Cloud access before it restores a Cloud model', () => {
      unlockPro();
      getState().setModel(PRO_CHOICE_ID);
      getState().showConversationModel(OTHER_PRO_MODEL_ID);
      useWaitlistStore.setState({ cloudUnlocked: false });

      getState().endConversationModel();

      expect(getState().selectedModel).toBe(OTHER_PRO_MODEL_ID);
    });
  });

  describe('hydration admission', () => {
    it('replaces a persisted plan-locked Cloud model before rendering it', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'pro', billingTier: 'pro' });
      const merge = useModelStore.persist.getOptions().merge;
      expect(merge).toBeDefined();

      const hydrated = merge?.({ selectedModel: MAX_ONLY_MODEL_ID }, useModelStore.getState());

      expect(hydrated?.selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
      expect(hydrated?.selectedModel).not.toBe(MAX_ONLY_MODEL_ID);
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
      expect(SELECTABLE_AUTO_MODE_ID).toBeDefined();
      getState().toggleFavorite(SELECTABLE_AUTO_MODE_ID!);

      expect(getState().favorites).toEqual([]);
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
      expect(SELECTABLE_AUTO_MODE_ID).toBeDefined();
      getState().toggleThinkingForModel(SELECTABLE_AUTO_MODE_ID!);

      expect(getState().thinkingEnabledPerModel[SELECTABLE_AUTO_MODE_ID!]).toBeUndefined();
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

    it('initializes mandatory reasoning and refuses to turn it off', () => {
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'max', billingTier: 'max' });

      getState().setModel(MANDATORY_REASONING_MODEL_ID);

      expect(getState().thinkingModeEnabled).toBe(true);
      expect(getState().thinkingEnabledPerModel[MANDATORY_REASONING_MODEL_ID]).toBe(true);
      expect(getState().isThinkingEnabledForSelected()).toBe(true);

      getState().toggleThinkingForModel(MANDATORY_REASONING_MODEL_ID);
      getState().setThinkingMode(false);

      expect(getState().thinkingModeEnabled).toBe(true);
      expect(getState().thinkingEnabledPerModel[MANDATORY_REASONING_MODEL_ID]).toBe(true);
    });
  });
});

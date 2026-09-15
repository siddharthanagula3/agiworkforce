jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(
    this: { feature: string; requiredTier: string; reason: string; name: string; message: string },
    feat: string,
    reqTier: string,
    rsn: string,
  ) {
    this.feature = feat;
    this.requiredTier = reqTier;
    this.reason = rsn;
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);

  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      uploadFile: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useChatStore } from '../stores/chatStore';
import { migratePersistedChatView, useChatViewStore } from '../stores/chat/chatViewStore';

function getState() {
  return useChatStore.getState();
}

function resetWave2State() {
  useChatStore.setState({
    chatMode: 'chat',
    chatStyle: 'normal',
    features: { webSearch: true, imageGen: true, health: false },
  });
}

describe('chatStore, Wave 2 additions', () => {
  beforeEach(() => {
    resetWave2State();
    jest.clearAllMocks();
  });

  describe('chatMode', () => {
    it('defaults to "chat"', () => {
      expect(getState().chatMode).toBe('chat');
    });

    it('setChatMode changes the mode to "research"', () => {
      getState().setChatMode('research');
      expect(getState().chatMode).toBe('research');
    });

    it('setChatMode changes the mode to "create"', () => {
      getState().setChatMode('create');
      expect(getState().chatMode).toBe('create');
    });

    it('setChatMode back to "chat" after changing', () => {
      getState().setChatMode('research');
      getState().setChatMode('chat');
      expect(getState().chatMode).toBe('chat');
    });
  });

  describe('chatStyle', () => {
    it('defaults to "concise" for new chats', () => {
      expect(useChatViewStore.getInitialState().chatStyle).toBe('concise');
    });

    it('setChatStyle changes to "concise"', () => {
      getState().setChatStyle('concise');
      expect(getState().chatStyle).toBe('concise');
    });

    it('setChatStyle changes to "detailed"', () => {
      getState().setChatStyle('detailed');
      expect(getState().chatStyle).toBe('detailed');
    });

    it('setChatStyle changes to "creative"', () => {
      getState().setChatStyle('creative');
      expect(getState().chatStyle).toBe('creative');
    });

    it('setChatStyle back to "normal" after changing', () => {
      getState().setChatStyle('detailed');
      getState().setChatStyle('normal');
      expect(getState().chatStyle).toBe('normal');
    });
  });

  describe('features', () => {
    it('defaults to { webSearch: true, imageGen: true, health: false }', () => {
      const features = getState().features;
      expect(features).toEqual({
        webSearch: true,
        imageGen: true,
        health: false,
      });
    });

    it('setFeature toggles webSearch off', () => {
      getState().setFeature('webSearch', false);
      expect(getState().features.webSearch).toBe(false);
    });

    it('setFeature toggles webSearch back on', () => {
      getState().setFeature('webSearch', false);
      getState().setFeature('webSearch', true);
      expect(getState().features.webSearch).toBe(true);
    });

    it('setFeature toggles imageGen off', () => {
      getState().setFeature('imageGen', false);
      expect(getState().features.imageGen).toBe(false);
    });

    it('setFeature toggles health on', () => {
      getState().setFeature('health', true);
      expect(getState().features.health).toBe(true);
    });

    it('setFeature does not affect other features', () => {
      getState().setFeature('webSearch', false);

      const features = getState().features;
      expect(features.webSearch).toBe(false);
      expect(features.imageGen).toBe(true);
      expect(features.health).toBe(false);
    });

    it('can toggle multiple features independently', () => {
      getState().setFeature('webSearch', false);
      getState().setFeature('health', true);
      getState().setFeature('imageGen', false);

      const features = getState().features;
      expect(features.webSearch).toBe(false);
      expect(features.imageGen).toBe(false);
      expect(features.health).toBe(true);
    });
  });

  describe('type coverage', () => {
    it('ChatMode type accepts only valid values', () => {
      const validModes = ['chat', 'research', 'create'] as const;
      for (const mode of validModes) {
        getState().setChatMode(mode);
        expect(getState().chatMode).toBe(mode);
      }
    });

    it('ChatStyle type accepts only valid values', () => {
      const validStyles = ['normal', 'concise', 'detailed', 'creative'] as const;
      for (const style of validStyles) {
        getState().setChatStyle(style);
        expect(getState().chatStyle).toBe(style);
      }
    });
  });
});

describe('chat view persistence migration', () => {
  it('drops a tool access value written by an older install', () => {
    const migrated = migratePersistedChatView({ chatStyle: 'detailed', toolAccess: 'always' }, 0);

    expect(migrated).not.toHaveProperty('toolAccess');
    expect(migrated).toMatchObject({ chatStyle: 'detailed' });
  });

  it('leaves a payload with nothing to drop untouched', () => {
    expect(migratePersistedChatView({ chatMode: 'research' }, 1)).toEqual({
      chatMode: 'research',
    });
  });

  it('survives a missing payload', () => {
    expect(migratePersistedChatView(undefined, 0)).toEqual({});
  });
});

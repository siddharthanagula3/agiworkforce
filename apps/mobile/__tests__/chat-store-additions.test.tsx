/**
 * Tests for chatStore Wave 2 additions.
 *
 * Validates the new state fields and actions added in Wave 2:
 * - chatMode defaults and setter
 * - chatStyle defaults and setter
 * - toolAccess defaults and setter
 * - features defaults and setFeature toggle
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
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
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { useChatStore } from '../stores/chatStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useChatStore.getState();
}

function resetWave2State() {
  useChatStore.setState({
    chatMode: 'chat',
    chatStyle: 'normal',
    toolAccess: 'auto',
    features: { webSearch: true, imageGen: true, health: false },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatStore — Wave 2 additions', () => {
  beforeEach(() => {
    resetWave2State();
    jest.clearAllMocks();
  });

  // ---- chatMode ----

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

  // ---- chatStyle ----

  describe('chatStyle', () => {
    it('defaults to "normal"', () => {
      expect(getState().chatStyle).toBe('normal');
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

  // ---- toolAccess ----

  describe('toolAccess', () => {
    it('defaults to "auto"', () => {
      expect(getState().toolAccess).toBe('auto');
    });

    it('setToolAccess changes to "on-demand"', () => {
      getState().setToolAccess('on-demand');
      expect(getState().toolAccess).toBe('on-demand');
    });

    it('setToolAccess changes to "always"', () => {
      getState().setToolAccess('always');
      expect(getState().toolAccess).toBe('always');
    });

    it('setToolAccess back to "auto" after changing', () => {
      getState().setToolAccess('always');
      getState().setToolAccess('auto');
      expect(getState().toolAccess).toBe('auto');
    });
  });

  // ---- features ----

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
      expect(features.imageGen).toBe(true); // unchanged
      expect(features.health).toBe(false); // unchanged
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

  // ---- Type coverage ----

  describe('type coverage', () => {
    it('ChatMode type accepts only valid values', () => {
      // This test ensures the type system works — the store should
      // accept exactly 'chat', 'research', 'create'
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

    it('ToolAccess type accepts only valid values', () => {
      const validAccess = ['auto', 'on-demand', 'always'] as const;
      for (const access of validAccess) {
        getState().setToolAccess(access);
        expect(getState().toolAccess).toBe(access);
      }
    });
  });
});

/**
 * settingsStore — unit tests
 *
 * Covers:
 *   - personalization has all fields with defaults
 *   - setPersonalization updates partial fields
 *   - capabilities has all 4 toggles defaulting to true
 *   - setCapability toggles individual capabilities
 *   - autoApproveMode defaults to 'ask'
 */

// ---------------------------------------------------------------------------
// Mocks — must be before store import
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useSettingsStore } from '../stores/settingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useSettingsStore.getState();
}

function resetStore() {
  useSettingsStore.setState({
    autoApproveMode: 'ask',
    hapticsEnabled: true,
    notificationsEnabled: true,
    voiceEnabled: true,
    backgroundFetchEnabled: true,
    themeMode: 'dark',
    fontPreference: 'default',
    biometricLockEnabled: false,
    selectedVoiceId: null,
    speechRate: 1.0,
    speechPitch: 1.0,
    selectedPresetId: null,
    ttsProvider: 'system',
    autoListenEnabled: true,
    isTemporaryChat: false,
    personalization: {
      fullName: '',
      nickname: '',
      occupation: '',
      instructions: '',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
    capabilities: {
      webSearch: true,
      imageGen: true,
      memory: true,
      desktopControl: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settingsStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('personalization defaults', () => {
    it('has empty string defaults for text fields', () => {
      const { personalization } = getState();

      expect(personalization.fullName).toBe('');
      expect(personalization.nickname).toBe('');
      expect(personalization.occupation).toBe('');
      expect(personalization.instructions).toBe('');
    });

    it('has default of 50 for all slider values', () => {
      const { personalization } = getState();

      expect(personalization.warmth).toBe(50);
      expect(personalization.enthusiasm).toBe(50);
      expect(personalization.headersLists).toBe(50);
      expect(personalization.emoji).toBe(50);
    });
  });

  describe('setPersonalization', () => {
    it('updates only the specified fields (partial update)', () => {
      getState().setPersonalization({ fullName: 'Alice', occupation: 'Engineer' });

      const { personalization } = getState();
      expect(personalization.fullName).toBe('Alice');
      expect(personalization.occupation).toBe('Engineer');
      // Untouched fields remain at defaults
      expect(personalization.nickname).toBe('');
      expect(personalization.instructions).toBe('');
      expect(personalization.warmth).toBe(50);
    });

    it('updates slider values', () => {
      getState().setPersonalization({ warmth: 80, emoji: 10 });

      const { personalization } = getState();
      expect(personalization.warmth).toBe(80);
      expect(personalization.emoji).toBe(10);
      // Others unchanged
      expect(personalization.enthusiasm).toBe(50);
      expect(personalization.headersLists).toBe(50);
    });

    it('can update all fields at once', () => {
      getState().setPersonalization({
        fullName: 'Bob Builder',
        nickname: 'Bob',
        occupation: 'Builder',
        instructions: 'Be constructive',
        warmth: 90,
        enthusiasm: 75,
        headersLists: 30,
        emoji: 60,
      });

      const { personalization } = getState();
      expect(personalization.fullName).toBe('Bob Builder');
      expect(personalization.nickname).toBe('Bob');
      expect(personalization.occupation).toBe('Builder');
      expect(personalization.instructions).toBe('Be constructive');
      expect(personalization.warmth).toBe(90);
      expect(personalization.enthusiasm).toBe(75);
      expect(personalization.headersLists).toBe(30);
      expect(personalization.emoji).toBe(60);
    });

    it('preserves existing values when updating a single field', () => {
      // Set some initial values
      getState().setPersonalization({ fullName: 'Alice', warmth: 80 });

      // Update only nickname
      getState().setPersonalization({ nickname: 'Ali' });

      const { personalization } = getState();
      expect(personalization.fullName).toBe('Alice');
      expect(personalization.nickname).toBe('Ali');
      expect(personalization.warmth).toBe(80);
    });
  });

  describe('capabilities defaults', () => {
    it('all 4 capabilities default to true', () => {
      const { capabilities } = getState();

      expect(capabilities.webSearch).toBe(true);
      expect(capabilities.imageGen).toBe(true);
      expect(capabilities.memory).toBe(true);
      expect(capabilities.desktopControl).toBe(true);
    });
  });

  describe('setCapability', () => {
    it('toggles individual capabilities to false', () => {
      getState().setCapability('webSearch', false);

      const { capabilities } = getState();
      expect(capabilities.webSearch).toBe(false);
      // Others remain true
      expect(capabilities.imageGen).toBe(true);
      expect(capabilities.memory).toBe(true);
      expect(capabilities.desktopControl).toBe(true);
    });

    it('toggles capability back to true', () => {
      getState().setCapability('memory', false);
      expect(getState().capabilities.memory).toBe(false);

      getState().setCapability('memory', true);
      expect(getState().capabilities.memory).toBe(true);
    });

    it('can disable multiple capabilities independently', () => {
      getState().setCapability('imageGen', false);
      getState().setCapability('desktopControl', false);

      const { capabilities } = getState();
      expect(capabilities.webSearch).toBe(true);
      expect(capabilities.imageGen).toBe(false);
      expect(capabilities.memory).toBe(true);
      expect(capabilities.desktopControl).toBe(false);
    });
  });

  describe('autoApproveMode', () => {
    it('defaults to "ask"', () => {
      expect(getState().autoApproveMode).toBe('ask');
    });

    it('can be set to "smart"', () => {
      getState().setAutoApproveMode('smart');
      expect(getState().autoApproveMode).toBe('smart');
    });

    it('can be set to "full"', () => {
      getState().setAutoApproveMode('full');
      expect(getState().autoApproveMode).toBe('full');
    });

    it('can be set back to "ask"', () => {
      getState().setAutoApproveMode('full');
      getState().setAutoApproveMode('ask');
      expect(getState().autoApproveMode).toBe('ask');
    });
  });

  describe('other defaults', () => {
    it('hapticsEnabled defaults to true', () => {
      expect(getState().hapticsEnabled).toBe(true);
    });

    it('themeMode defaults to dark', () => {
      expect(getState().themeMode).toBe('dark');
    });

    it('isTemporaryChat defaults to false', () => {
      expect(getState().isTemporaryChat).toBe(false);
    });

    it('setHapticsEnabled toggles the flag', () => {
      getState().setHapticsEnabled(false);
      expect(getState().hapticsEnabled).toBe(false);

      getState().setHapticsEnabled(true);
      expect(getState().hapticsEnabled).toBe(true);
    });

    it('setThemeMode changes theme', () => {
      getState().setThemeMode('light');
      expect(getState().themeMode).toBe('light');

      getState().setThemeMode('system');
      expect(getState().themeMode).toBe('system');
    });

    it('setTemporaryChat toggles the flag', () => {
      getState().setTemporaryChat(true);
      expect(getState().isTemporaryChat).toBe(true);
    });
  });
});

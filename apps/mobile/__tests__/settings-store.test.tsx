/**
 * Settings stores — unit tests (post mode-split)
 *
 * Covers:
 *   settingsStore (device-global): capabilities, autoApproveMode, haptics, isTemporaryChat
 *   localSettingsStore (mode-specific / local): personalization, themeMode, accentColor
 *   cloudSettingsStore (mode-specific / cloud): stamps settingsUpdatedAt on cloud-safe writes
 */

// ---------------------------------------------------------------------------
// Mocks — must be before store imports
// ---------------------------------------------------------------------------

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
  // storage.getString used by localSettingsStore migration; return undefined = no legacy data
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useSettingsStore } from '../stores/settingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function resetDeviceStore() {
  useSettingsStore.setState({
    autoApproveMode: 'ask',
    hapticsEnabled: true,
    voiceEnabled: true,
    backgroundFetchEnabled: true,
    reduceSensitiveContent: false,
    selectedVoiceId: null,
    speechRate: 1.0,
    speechPitch: 1.0,
    selectedPresetId: null,
    ttsProvider: 'system',
    isTemporaryChat: false,
    capabilities: {
      webSearch: true,
      imageGen: true,
      memory: true,
      desktopControl: true,
      artifacts: true,
      codeExecution: true,
      voice: true,
      camera: true,
    },
  });
}

function resetLocalStore() {
  useLocalSettingsStore.setState({
    themeMode: 'system',
    accentColor: 'neutral',
    fontPreference: 'default',
    notificationsEnabled: true,
    speechLanguage: 'en',
    autoListenEnabled: true,
    personalization: defaultPersonalization,
  });
}

function resetCloudStore() {
  useCloudSettingsStore.setState({
    themeMode: 'system',
    accentColor: 'neutral',
    fontPreference: 'default',
    notificationsEnabled: true,
    speechLanguage: 'en',
    autoListenEnabled: true,
    personalization: defaultPersonalization,
    settingsUpdatedAt: null,
  });
}

// ---------------------------------------------------------------------------
// Tests: device-global settingsStore
// ---------------------------------------------------------------------------

describe('settingsStore (device-global)', () => {
  beforeEach(resetDeviceStore);

  describe('capabilities defaults', () => {
    it('all capabilities default to true', () => {
      const { capabilities } = useSettingsStore.getState();
      expect(capabilities.webSearch).toBe(true);
      expect(capabilities.imageGen).toBe(true);
      expect(capabilities.memory).toBe(true);
      expect(capabilities.desktopControl).toBe(true);
      expect(capabilities.artifacts).toBe(true);
      expect(capabilities.codeExecution).toBe(true);
      expect(capabilities.voice).toBe(true);
      expect(capabilities.camera).toBe(true);
    });
  });

  describe('setCapability', () => {
    it('toggles individual capabilities to false', () => {
      useSettingsStore.getState().setCapability('webSearch', false);
      expect(useSettingsStore.getState().capabilities.webSearch).toBe(false);
      expect(useSettingsStore.getState().capabilities.imageGen).toBe(true);
    });

    it('toggles capability back to true', () => {
      useSettingsStore.getState().setCapability('memory', false);
      expect(useSettingsStore.getState().capabilities.memory).toBe(false);
      useSettingsStore.getState().setCapability('memory', true);
      expect(useSettingsStore.getState().capabilities.memory).toBe(true);
    });

    it('can disable multiple capabilities independently', () => {
      useSettingsStore.getState().setCapability('imageGen', false);
      useSettingsStore.getState().setCapability('desktopControl', false);
      const { capabilities } = useSettingsStore.getState();
      expect(capabilities.webSearch).toBe(true);
      expect(capabilities.imageGen).toBe(false);
      expect(capabilities.memory).toBe(true);
      expect(capabilities.desktopControl).toBe(false);
    });
  });

  describe('autoApproveMode', () => {
    it('defaults to "ask"', () => {
      expect(useSettingsStore.getState().autoApproveMode).toBe('ask');
    });

    it('can be set to "smart"', () => {
      useSettingsStore.getState().setAutoApproveMode('smart');
      expect(useSettingsStore.getState().autoApproveMode).toBe('smart');
    });

    it('can be set back to "ask"', () => {
      useSettingsStore.getState().setAutoApproveMode('full');
      useSettingsStore.getState().setAutoApproveMode('ask');
      expect(useSettingsStore.getState().autoApproveMode).toBe('ask');
    });
  });

  describe('other device-global fields', () => {
    it('hapticsEnabled defaults to true', () => {
      expect(useSettingsStore.getState().hapticsEnabled).toBe(true);
    });

    it('setHapticsEnabled toggles the flag', () => {
      useSettingsStore.getState().setHapticsEnabled(false);
      expect(useSettingsStore.getState().hapticsEnabled).toBe(false);
      useSettingsStore.getState().setHapticsEnabled(true);
      expect(useSettingsStore.getState().hapticsEnabled).toBe(true);
    });

    it('reduceSensitiveContent defaults off and can be enabled', () => {
      expect(useSettingsStore.getState().reduceSensitiveContent).toBe(false);
      useSettingsStore.getState().setReduceSensitiveContent(true);
      expect(useSettingsStore.getState().reduceSensitiveContent).toBe(true);
    });

    it('isTemporaryChat defaults to false', () => {
      expect(useSettingsStore.getState().isTemporaryChat).toBe(false);
    });

    it('setTemporaryChat toggles the flag', () => {
      useSettingsStore.getState().setTemporaryChat(true);
      expect(useSettingsStore.getState().isTemporaryChat).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: mode-specific localSettingsStore
// ---------------------------------------------------------------------------

describe('localSettingsStore (mode-specific — never synced)', () => {
  beforeEach(resetLocalStore);

  describe('personalization defaults', () => {
    it('has empty string defaults for text fields', () => {
      const { personalization } = useLocalSettingsStore.getState();
      expect(personalization.fullName).toBe('');
      expect(personalization.nickname).toBe('');
      expect(personalization.occupation).toBe('');
      expect(personalization.instructions).toBe('');
    });

    it('has default of 50 for all slider values', () => {
      const { personalization } = useLocalSettingsStore.getState();
      expect(personalization.warmth).toBe(50);
      expect(personalization.enthusiasm).toBe(50);
      expect(personalization.headersLists).toBe(50);
      expect(personalization.emoji).toBe(50);
    });
  });

  describe('setPersonalization', () => {
    it('updates only the specified fields (partial update)', () => {
      useLocalSettingsStore
        .getState()
        .setPersonalization({ fullName: 'Alice', occupation: 'Engineer' });
      const { personalization } = useLocalSettingsStore.getState();
      expect(personalization.fullName).toBe('Alice');
      expect(personalization.occupation).toBe('Engineer');
      expect(personalization.nickname).toBe('');
      expect(personalization.warmth).toBe(50);
    });

    it('preserves existing values when updating a single field', () => {
      useLocalSettingsStore.getState().setPersonalization({ fullName: 'Alice', warmth: 80 });
      useLocalSettingsStore.getState().setPersonalization({ nickname: 'Ali' });
      const { personalization } = useLocalSettingsStore.getState();
      expect(personalization.fullName).toBe('Alice');
      expect(personalization.nickname).toBe('Ali');
      expect(personalization.warmth).toBe(80);
    });
  });

  describe('themeMode', () => {
    it('defaults to system', () => {
      expect(useLocalSettingsStore.getState().themeMode).toBe('system');
    });

    it('setThemeMode changes theme', () => {
      useLocalSettingsStore.getState().setThemeMode('light');
      expect(useLocalSettingsStore.getState().themeMode).toBe('light');
      useLocalSettingsStore.getState().setThemeMode('system');
      expect(useLocalSettingsStore.getState().themeMode).toBe('system');
    });

    it('round-trips through all three modes without corruption', () => {
      useLocalSettingsStore.getState().setThemeMode('light');
      expect(useLocalSettingsStore.getState().themeMode).toBe('light');
      useLocalSettingsStore.getState().setThemeMode('system');
      expect(useLocalSettingsStore.getState().themeMode).toBe('system');
      useLocalSettingsStore.getState().setThemeMode('dark');
      expect(useLocalSettingsStore.getState().themeMode).toBe('dark');
    });
  });

  describe('accentColor', () => {
    it('defaults to neutral', () => {
      expect(useLocalSettingsStore.getState().accentColor).toBe('neutral');
    });

    it('setAccentColor changes the accent', () => {
      useLocalSettingsStore.getState().setAccentColor('green');
      expect(useLocalSettingsStore.getState().accentColor).toBe('green');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: cloudSettingsStore — stamps settingsUpdatedAt on writes
// ---------------------------------------------------------------------------

describe('cloudSettingsStore (mode-specific — synced to cloud)', () => {
  beforeEach(resetCloudStore);

  it('starts with settingsUpdatedAt = null (never edited)', () => {
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).toBeNull();
  });

  it('stamps settingsUpdatedAt when setThemeMode is called', () => {
    useCloudSettingsStore.getState().setThemeMode('dark');
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).not.toBeNull();
    expect(useCloudSettingsStore.getState().themeMode).toBe('dark');
  });

  it('stamps settingsUpdatedAt when setPersonalization is called', () => {
    useCloudSettingsStore.getState().setPersonalization({ nickname: 'CloudUser' });
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).not.toBeNull();
    expect(useCloudSettingsStore.getState().personalization.nickname).toBe('CloudUser');
  });
});

// ---------------------------------------------------------------------------
// Tests: mode isolation (key requirement)
// ---------------------------------------------------------------------------

describe('settings mode isolation', () => {
  beforeEach(() => {
    resetLocalStore();
    resetCloudStore();
  });

  it('a local-mode personalization change does NOT appear in cloud store', () => {
    useLocalSettingsStore.getState().setPersonalization({ fullName: 'LocalUser' });
    expect(useLocalSettingsStore.getState().personalization.fullName).toBe('LocalUser');
    expect(useCloudSettingsStore.getState().personalization.fullName).toBe('');
  });

  it('a cloud-mode personalization change does NOT appear in local store', () => {
    useCloudSettingsStore.getState().setPersonalization({ fullName: 'CloudUser' });
    expect(useCloudSettingsStore.getState().personalization.fullName).toBe('CloudUser');
    expect(useLocalSettingsStore.getState().personalization.fullName).toBe('');
  });

  it('local themeMode and cloud themeMode are independent', () => {
    useLocalSettingsStore.getState().setThemeMode('light');
    useCloudSettingsStore.getState().setThemeMode('dark');
    expect(useLocalSettingsStore.getState().themeMode).toBe('light');
    expect(useCloudSettingsStore.getState().themeMode).toBe('dark');
  });

  it('cloud-mode change stamps settingsUpdatedAt; local change does not', () => {
    useLocalSettingsStore.getState().setThemeMode('dark');
    useCloudSettingsStore.getState().setThemeMode('dark');
    // Local store has no settingsUpdatedAt field
    expect('settingsUpdatedAt' in useLocalSettingsStore.getState()).toBe(false);
    // Cloud store has settingsUpdatedAt stamped
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).not.toBeNull();
  });
});

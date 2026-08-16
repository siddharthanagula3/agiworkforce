import { beforeEach, describe, expect, it } from 'vitest';

import { clearPersistedUserData } from '../logoutCleanup';

const USER_DATA_KEYS = [
  'agiworkforce-memory',
  'agiworkforce-custom-instructions',
  'research-store',
  'artifact-store',
  'trigger-store',
  'agiworkforce-scheduler',
  'agiworkforce-cache',
  'image-gallery-store',
  'execution-sidecar-storage',
  'tool-storage',
];

const PREFERENCE_KEYS = [
  'agiworkforce-settings',
  'agiworkforce-models',
  'agiworkforce-ui',
  'agiworkforce-updater',
  'app-mode-store',
  'chat-view-storage',
];

describe('clearPersistedUserData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes every persisted user-scoped payload', () => {
    for (const key of [...USER_DATA_KEYS, 'chat-storage', 'unified-auth-storage']) {
      localStorage.setItem(key, '{"state":{}}');
    }

    clearPersistedUserData();

    for (const key of USER_DATA_KEYS) {
      expect(localStorage.getItem(key), `${key} survived sign-out`).toBeNull();
    }
    expect(localStorage.getItem('chat-storage')).toBeNull();
    expect(localStorage.getItem('unified-auth-storage')).toBeNull();
  });

  it('keeps device and app preferences', () => {
    for (const key of PREFERENCE_KEYS) {
      localStorage.setItem(key, '{"state":{}}');
    }

    clearPersistedUserData();

    for (const key of PREFERENCE_KEYS) {
      expect(localStorage.getItem(key), `${key} was wrongly cleared`).not.toBeNull();
    }
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { clearPersistedUserData } from '../logoutCleanup';

/**
 * Persist keys owned by stores this module does not import, so nothing else in
 * the sign-out path ever rewrites or drops their payload. Before the fix they
 * outlived sign-out and the next account on the machine inherited them.
 */
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

/** Device/app preferences that must survive sign-out. */
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

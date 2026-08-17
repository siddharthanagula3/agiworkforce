import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOVED_PERSISTED_SETTINGS_KEYS, useSettingsStore } from '../settingsStore';

const STORAGE_KEY = 'chat-settings-store';

const LIVE_KEYS = [
  'profile',
  'language',
  'artifactsEnabled',
  'codeExecutionEnabled',
  'codeExecutionDeploymentEnabled',
  'genericWebSearchDeploymentEnabled',
  'autoApproveMode',
  'hapticsEnabled',
];

const LEGACY_SETTERS = [
  'toggleInlineViz',
  'toggleNotifyCompletions',
  'toggleNotifyAgentUpdates',
  'toggleNotifyResearch',
  'toggleMemorySearchChats',
  'toggleMemoryGenerateFromHistory',
  'setToolAccessMode',
];

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('exposes no field or setter without a consumer', () => {
    const keys = Object.keys(useSettingsStore.getState());

    for (const key of REMOVED_PERSISTED_SETTINGS_KEYS) {
      expect(keys).not.toContain(key);
    }
    for (const setter of LEGACY_SETTERS) {
      expect(keys).not.toContain(setter);
    }
  });

  it('keeps the fields that do have consumers', () => {
    const keys = Object.keys(useSettingsStore.getState());

    for (const key of LIVE_KEYS) {
      expect(keys).toContain(key);
    }
  });

  it('strips removed keys out of an already-persisted blob on rehydrate', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          language: 'fr-FR',
          artifactsEnabled: false,
          inlineVisualizationsEnabled: true,
          memorySearchChats: true,
          memoryGenerateFromHistory: true,
          notifyCompletions: true,
          notifyAgentUpdates: true,
          notifyResearch: true,
          toolAccessMode: 'eager',
        },
        version: 0,
      }),
    );

    vi.resetModules();
    const { useSettingsStore: rehydrated } = await import('../settingsStore');
    const state = rehydrated.getState() as unknown as Record<string, unknown>;

    for (const key of REMOVED_PERSISTED_SETTINGS_KEYS) {
      expect(state).not.toHaveProperty(key);
    }
    expect(state['language']).toBe('fr-FR');
    expect(state['artifactsEnabled']).toBe(false);

    const written = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      state: Record<string, unknown>;
    };
    for (const key of REMOVED_PERSISTED_SETTINGS_KEYS) {
      expect(written.state).not.toHaveProperty(key);
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

type SettingsSlice = {
  theme: string;
  language: string;
  chatFont: string;
  alwaysUseAgentMode: boolean;
  systemPromptOverride: string | null;
};

const state = {
  current: {
    settings: {
      theme: 'system',
      language: 'en',
      chatFont: 'default',
      alwaysUseAgentMode: false,
      systemPromptOverride: null,
    } as SettingsSlice,
  },
};

const appStateStore = {
  getState: () => state.current,
  setState: (updater: (prev: typeof state.current) => typeof state.current) => {
    state.current = updater(state.current);
  },
};

type DesktopSettingsState = {
  windowPreferences: { theme?: string; chatFont?: string; language?: string };
  llmConfig: { language?: string };
  chatPreferences: { alwaysUseAgentMode: boolean };
};

const settingsSubscribers: Array<(s: DesktopSettingsState) => void> = [];
const settingsState: DesktopSettingsState = {
  windowPreferences: { theme: 'dark', chatFont: 'default', language: 'en' },
  llmConfig: {},
  chatPreferences: { alwaysUseAgentMode: false },
};

type CustomInstructionsState = {
  globalInstructions: string;
  globalInstructionsEnabled: boolean;
};

const instructionsSubscribers: Array<(s: CustomInstructionsState) => void> = [];
const instructionsState: CustomInstructionsState = {
  globalInstructions: '',
  globalInstructionsEnabled: true,
};

vi.mock('@agiworkforce/client-runtime', () => ({ appStateStore }));

vi.mock('../settingsStore', () => ({
  useSettingsStore: {
    subscribe: (fn: (s: DesktopSettingsState) => void) => {
      settingsSubscribers.push(fn);
      return () => {
        const index = settingsSubscribers.indexOf(fn);
        if (index >= 0) settingsSubscribers.splice(index, 1);
      };
    },
    getState: () => settingsState,
  },
}));

vi.mock('../customInstructionsStore', () => ({
  useCustomInstructionsStore: {
    subscribe: (fn: (s: CustomInstructionsState) => void) => {
      instructionsSubscribers.push(fn);
      return () => {
        const index = instructionsSubscribers.indexOf(fn);
        if (index >= 0) instructionsSubscribers.splice(index, 1);
      };
    },
    getState: () => instructionsState,
  },
}));

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  state.current = {
    settings: {
      theme: 'system',
      language: 'en',
      chatFont: 'default',
      alwaysUseAgentMode: false,
      systemPromptOverride: null,
    },
  };
  settingsSubscribers.length = 0;
  instructionsSubscribers.length = 0;
  settingsState.chatPreferences = { alwaysUseAgentMode: false };
  instructionsState.globalInstructions = '';
  instructionsState.globalInstructionsEnabled = true;
});

/**
 * AGI-12. `settings.alwaysUseAgentMode` and `settings.systemPromptOverride` are
 * declared by the shared runtime state, but nothing on desktop ever wrote
 * either: every reader of the canonical state was told agent mode was off and
 * no system prompt override existed, whatever the user had actually chosen.
 */
describe('bridgeSettingsStore, agent mode reaches the shared state', () => {
  it('publishes the desktop chat preference the shared state declares', async () => {
    const { bridgeSettingsStore } = await import('./stateBridge');
    bridgeSettingsStore();
    await flush();

    settingsState.chatPreferences = { alwaysUseAgentMode: true };
    settingsSubscribers.forEach((fn) => fn(settingsState));

    expect(appStateStore.getState().settings.alwaysUseAgentMode).toBe(true);
  });

  it('leaves the rest of the settings slice alone', async () => {
    const { bridgeSettingsStore } = await import('./stateBridge');
    bridgeSettingsStore();
    await flush();

    settingsState.chatPreferences = { alwaysUseAgentMode: true };
    settingsSubscribers.forEach((fn) => fn(settingsState));

    expect(appStateStore.getState().settings.theme).toBe('dark');
    expect(appStateStore.getState().settings.chatFont).toBe('default');
  });
});

describe('bridgeCustomInstructionsStore, the system prompt override has one owner', () => {
  it('publishes the global instructions as the override', async () => {
    const { bridgeCustomInstructionsStore } = await import('./stateBridge');
    bridgeCustomInstructionsStore();
    await flush();

    instructionsState.globalInstructions = '  Answer in British English.  ';
    instructionsSubscribers.forEach((fn) => fn(instructionsState));

    expect(appStateStore.getState().settings.systemPromptOverride).toBe(
      'Answer in British English.',
    );
  });

  /**
   * Text the user kept but switched off is not an override in force. Publishing
   * it anyway would apply an instruction the settings screen shows as disabled.
   */
  it('publishes null when the user turned the global instructions off', async () => {
    const { bridgeCustomInstructionsStore } = await import('./stateBridge');
    bridgeCustomInstructionsStore();
    await flush();

    instructionsState.globalInstructions = 'Answer in British English.';
    instructionsState.globalInstructionsEnabled = false;
    instructionsSubscribers.forEach((fn) => fn(instructionsState));

    expect(appStateStore.getState().settings.systemPromptOverride).toBeNull();
  });

  it('publishes null for instructions that are only whitespace', async () => {
    const { bridgeCustomInstructionsStore } = await import('./stateBridge');
    bridgeCustomInstructionsStore();
    await flush();

    instructionsState.globalInstructions = '   \n  ';
    instructionsSubscribers.forEach((fn) => fn(instructionsState));

    expect(appStateStore.getState().settings.systemPromptOverride).toBeNull();
  });
});

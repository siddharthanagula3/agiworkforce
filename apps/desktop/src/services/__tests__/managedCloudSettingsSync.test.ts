import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CloudSafeSettings,
  ManagedCloudSettingsClient,
  SettingsSyncPullResponse,
  SettingsSyncPushResponse,
} from '@agiworkforce/cloud-contracts';
import {
  applyDesktopCloudSafeSettings,
  createManagedCloudSettingsSyncCoordinator,
  projectDesktopCloudSafeSettings,
  type ManagedCloudSettingsSyncPorts,
} from '../managedCloudSettingsSync';
import { useSettingsStore } from '../../stores/settingsStore';

function createHarness(privacyMode: 'local' | 'byok' | 'managed' = 'local') {
  let mode = privacyMode;
  let identity: { userId: string } | null = { userId: 'user-1' };
  let projection: CloudSafeSettings = {
    appearance: { theme: 'light' },
    chat: { compactMode: true },
  };
  const modeListeners = new Set<() => void>();
  const authListeners = new Set<() => void>();
  const settingsListeners = new Set<() => void>();
  const storage = new Map<string, string>();
  const pull = vi.fn(
    async (): Promise<SettingsSyncPullResponse> => ({
      settings: { appearance: { theme: 'dark' } },
      cursor: '2',
      hasMore: false,
    }),
  );
  const push = vi.fn(
    async (): Promise<SettingsSyncPushResponse> => ({ applied: true, cursor: '3' }),
  );
  const events: Array<{ phase: string; error?: unknown }> = [];

  const ports: ManagedCloudSettingsSyncPorts = {
    client: { pull, push } as ManagedCloudSettingsClient,
    mode: {
      getPrivacyMode: () => mode,
      subscribe: (listener) => {
        modeListeners.add(listener);
        return () => modeListeners.delete(listener);
      },
    },
    auth: {
      getIdentity: () => identity,
      subscribe: (listener) => {
        authListeners.add(listener);
        return () => authListeners.delete(listener);
      },
    },
    settings: {
      getProjection: () => structuredClone(projection),
      applyProjection: (next) => {
        projection = structuredClone(next);
        settingsListeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
    },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    debounceMs: 25,
    onEvent: (event) => events.push(event),
  };

  return {
    ports,
    pull,
    push,
    events,
    projection: () => projection,
    edit(next: CloudSafeSettings) {
      projection = structuredClone(next);
      settingsListeners.forEach((listener) => listener());
    },
    setMode(next: 'local' | 'byok' | 'managed') {
      mode = next;
      modeListeners.forEach((listener) => listener());
    },
    signOut() {
      identity = null;
      authListeners.forEach((listener) => listener());
    },
    switchUser(userId: string) {
      identity = { userId };
      authListeners.forEach((listener) => listener());
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('Desktop Managed Cloud settings synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(['local', 'byok'] as const)(
    'never pulls or pushes in the %s trust boundary',
    async (privacyMode) => {
      const h = createHarness(privacyMode);
      const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);

      coordinator.start();
      h.edit({ appearance: { theme: 'dark' }, chat: { chatStorageMode: 'cloud' } });
      await vi.advanceTimersByTimeAsync(100);

      expect(h.pull).not.toHaveBeenCalled();
      expect(h.push).not.toHaveBeenCalled();
      coordinator.stop();
    },
  );

  it('pulls first on authenticated Managed entry, then debounces an allowlisted push', async () => {
    const h = createHarness('managed');
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);

    coordinator.start();
    await vi.runAllTimersAsync();

    expect(h.push).not.toHaveBeenCalled();
    expect(h.pull).toHaveBeenCalledWith(
      '0',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(h.projection()).toEqual({ appearance: { theme: 'dark' } });

    h.edit({
      appearance: { theme: 'system' },
      editor: { promptCompletionEnabled: false },
    });
    await vi.advanceTimersByTimeAsync(24);
    expect(h.push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(h.push).toHaveBeenCalledWith(
      {
        settings: {
          appearance: { theme: 'system' },
          editor: { promptCompletionEnabled: false },
        },
        baseVersion: '2',
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    coordinator.stop();
  });

  it('restores the device-local projection and cancels cloud work on Managed exit', async () => {
    const h = createHarness('managed');
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);
    coordinator.start();
    await vi.runAllTimersAsync();
    expect(h.projection()).toEqual({ appearance: { theme: 'dark' } });

    h.setMode('local');
    expect(h.projection()).toEqual({
      appearance: { theme: 'light' },
      chat: { compactMode: true },
    });
    h.edit({ appearance: { theme: 'system' } });
    await vi.advanceTimersByTimeAsync(100);

    expect(h.projection()).toEqual({ appearance: { theme: 'system' } });
    expect(h.push).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it('projects named cloud-safe fields and never infers trust from chatStorageMode', () => {
    const projected = projectDesktopCloudSafeSettings({
      windowPreferences: {
        theme: 'dark',
        language: 'en',
        startupPosition: 'center',
        dockOnStartup: null,
        chatFont: 'mono',
      },
      chatPreferences: {
        promptCompletionEnabled: true,
        alwaysUseAgentMode: true,
        compactMode: false,
        autoApproveTools: true,
        autoInjectSkills: true,
        autoSaveMemories: true,
        agentMode: 'build',
        chatStorageMode: 'cloud',
      },
      personalization: {
        name: 'Sid',
        occupation: 'Engineer',
        bio: 'private local context',
        formality: 3,
        warmth: 4,
        detail: 5,
        emojiUsage: 'often',
      },
    });

    expect(projected).toEqual({
      appearance: { theme: 'dark' },
      personalization: { fullName: 'Sid', occupation: 'Engineer', warmth: 80 },
      language: { locale: 'en' },
      capabilities: {
        memory: false,
        allowToolAssistedGeneration: false,
      },
      chat: { compactMode: false },
      editor: { promptCompletionEnabled: true },
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /chatStorageMode|autoApprove|autoSave|agentMode|bio|apiKey|provider/i,
    );
  });

  it('applies the account memory master and tool-assisted scope to Desktop settings', async () => {
    useSettingsStore.setState((state) => ({
      chatPreferences: {
        ...state.chatPreferences,
        memoryEnabled: false,
        autoSaveMemories: false,
        allowToolAssistedMemoryGeneration: false,
      },
    }));

    applyDesktopCloudSafeSettings({
      capabilities: {
        memory: true,
        allowToolAssistedGeneration: true,
      },
    });
    await vi.runAllTimersAsync();

    expect(useSettingsStore.getState().chatPreferences).toMatchObject({
      memoryEnabled: true,
      autoSaveMemories: true,
      allowToolAssistedMemoryGeneration: true,
    });
  });

  it('pulls the server winner after a base-version conflict and reports failures observably', async () => {
    const h = createHarness('managed');
    h.push.mockResolvedValueOnce({ applied: false, cursor: '3' });
    h.pull
      .mockResolvedValueOnce({ settings: {}, cursor: '2', hasMore: false })
      .mockResolvedValueOnce({
        settings: { appearance: { theme: 'dark' } },
        cursor: '4',
        hasMore: false,
      });
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);
    coordinator.start();
    await vi.runAllTimersAsync();

    h.edit({ appearance: { theme: 'light' } });
    await vi.advanceTimersByTimeAsync(25);

    expect(h.pull).toHaveBeenLastCalledWith(
      '2',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(h.projection()).toEqual({ appearance: { theme: 'dark' } });

    h.pull.mockRejectedValueOnce(new Error('offline'));
    await coordinator.syncNow();
    expect(h.events.some((event) => event.phase === 'error')).toBe(true);
    coordinator.stop();
  });

  it('rebases a mid-POST edit onto the conflict winner and preserves remote-only fields', async () => {
    const h = createHarness('managed');
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);
    coordinator.start();
    await vi.runAllTimersAsync();

    const pushStarted = deferred<void>();
    const pendingPush = deferred<SettingsSyncPushResponse>();
    h.push
      .mockImplementationOnce(() => {
        pushStarted.resolve();
        return pendingPush.promise;
      })
      .mockResolvedValueOnce({ applied: true, cursor: '5' });
    h.pull.mockResolvedValueOnce({
      settings: {
        appearance: { theme: 'dark' },
        notifications: { enabled: false },
      },
      cursor: '4',
      hasMore: false,
    });

    h.edit({ appearance: { theme: 'light' }, chat: { compactMode: true } });
    vi.advanceTimersByTime(25);
    await pushStarted.promise;
    h.edit({ appearance: { theme: 'system' }, chat: { compactMode: true } });
    pendingPush.resolve({ applied: false, cursor: '4' });
    await vi.runAllTimersAsync();

    expect(h.projection()).toEqual({
      appearance: { theme: 'system' },
      notifications: { enabled: false },
    });
    expect(h.push).toHaveBeenLastCalledWith(
      {
        settings: {
          appearance: { theme: 'system' },
          notifications: { enabled: false },
        },
        baseVersion: '4',
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    coordinator.stop();
  });

  it('preserves an edit made during the initial pull and pushes it after the pull settles', async () => {
    const h = createHarness('managed');
    const pendingPull = deferred<SettingsSyncPullResponse>();
    h.pull.mockImplementationOnce(() => pendingPull.promise);
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);

    coordinator.start();
    h.edit({ appearance: { theme: 'system' } });
    await vi.advanceTimersByTimeAsync(25);
    pendingPull.resolve({
      settings: { appearance: { theme: 'dark' } },
      cursor: '2',
      hasMore: false,
    });
    await vi.runAllTimersAsync();

    expect(h.projection()).toEqual({ appearance: { theme: 'system' } });
    expect(h.push).toHaveBeenCalledWith(
      {
        settings: { appearance: { theme: 'system' } },
        baseVersion: '2',
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    coordinator.stop();
  });

  it('ignores a delayed response from the previous authenticated user', async () => {
    const h = createHarness('managed');
    const firstUserPull = deferred<SettingsSyncPullResponse>();
    h.pull
      .mockImplementationOnce(() => firstUserPull.promise)
      .mockResolvedValueOnce({
        settings: { appearance: { theme: 'system' } },
        cursor: '4',
        hasMore: false,
      });
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);

    coordinator.start();
    h.switchUser('user-2');
    await vi.runAllTimersAsync();
    expect(h.projection()).toEqual({ appearance: { theme: 'system' } });

    firstUserPull.resolve({
      settings: { appearance: { theme: 'dark' } },
      cursor: '3',
      hasMore: false,
    });
    await vi.runAllTimersAsync();

    expect(h.projection()).toEqual({ appearance: { theme: 'system' } });
    coordinator.stop();
  });

  it('stops immediately on sign-out', async () => {
    const h = createHarness('managed');
    const coordinator = createManagedCloudSettingsSyncCoordinator(h.ports);
    coordinator.start();
    await vi.runAllTimersAsync();

    h.signOut();
    h.edit({ appearance: { theme: 'system' } });
    await vi.advanceTimersByTimeAsync(100);

    expect(h.push).not.toHaveBeenCalled();
    coordinator.stop();
  });
});

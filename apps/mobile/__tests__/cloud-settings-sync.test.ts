/**
 * Cloud settings sync — unit tests.
 *
 * Verifies the managed-only settings delta-sync loop:
 *  - Managed-cloud gate: ZERO network I/O (GET and POST) in local mode.
 *  - Fresh-device guard: a device that has never edited any cloud-safe setting
 *    does NOT push defaults before observing a server revision.
 *    It pulls the server state instead.
 *  - Cursor: settings cursor advances independently from chat/memory/project cursors.
 *  - Dirty detection: no POST when the cloud-safe projection is unchanged since last push.
 *  - Push: POST body contains only cloud-safe namespaces; cursor advances on ack.
 *  - Conflict key: POST body uses the last observed server revision, never client time.
 *  - Pull: pulled namespaces are applied into the live useCloudSettingsStore.
 *  - Leak guard: toCloudSettings() NEVER emits secret/BYOK keys or forbidden namespaces.
 *  - Anti-churn: after pullSettings applies data, pushSettings does NOT re-push it
 *    (lastPushedSnapshot is updated to the post-pull projection).
 */

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

// Stub uuidv7 (imported transitively through other stores).
jest.mock('@agiworkforce/utils', () => ({
  uuidv7: jest.fn(() => `00000000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`),
  isUuidV7: jest.fn(() => true),
  setUuidV7RandomSource: jest.fn(),
}));

// Stub SQLite memory storage (imported transitively through store chain).
jest.mock('../storage/memory', () => ({
  insertMemoryFact: jest.fn().mockResolvedValue(undefined),
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
  searchMemoryByEmbedding: jest.fn().mockResolvedValue([]),
}));

import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useMemorySyncStateStore } from '../stores/memory/memorySyncStateStore';
import { useProjectSyncStateStore } from '../stores/projects/projectSyncStateStore';
import { useSettingsSyncStateStore } from '../stores/settings/settingsSyncStateStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { syncNow } from '../services/cloudSyncEngine';
import { toCloudSettings } from '../services/cloudSettingsMapping';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const SETTINGS_SYNC_PATH = '/api/settings/sync';

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptySettingsPull(cursor = '0') {
  return { settings: {}, cursor, hasMore: false };
}

function emptyMemoryPull() {
  return { memories: [], cursor: '0', hasMore: false };
}

function emptyProjectPull() {
  return { projects: [], cursor: '0', hasMore: false };
}

function emptyChatPull() {
  return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
}

function settingsPushAck(cursor = '1') {
  return { applied: true, cursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('settings-sync-test-user');

  // Reset all sync state stores.
  useCloudSyncStateStore.getState().reset();
  useMemorySyncStateStore.getState().resetMemorySync();
  useProjectSyncStateStore.getState().resetProjectSync();
  useSettingsSyncStateStore.getState().resetSettingsSync();

  // Reset cloud settings store to factory defaults.
  // settingsUpdatedAt is null = "never locally edited" = fresh device state.
  // The push guard reads this and skips POST, letting pull adopt cloud state.
  useCloudSettingsStore.setState({
    themeMode: 'system',
    accentColor: 'neutral',
    fontPreference: 'default',
    notificationsEnabled: true,
    speechLanguage: 'en',
    autoListenEnabled: true,
    referencePastChats: false,
    generateMemoryFromHistory: true,
    memoryPolicyInitialized: false,
    settingsUpdatedAt: null, // explicit: no local edits on fresh device
    personalization: {
      fullName: '',
      nickname: '',
      occupation: '',
      instructions: '',
      style: 'default',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
  });

  useChatAppModeStore.getState().setAppMode('cloud');

  // Default: all GETs return empty; all POSTs ack.
  mockGet.mockImplementation(async (path: string) => {
    if ((path as string).startsWith(SETTINGS_SYNC_PATH)) return emptySettingsPull() as never;
    if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
    if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
    return emptyChatPull() as never;
  });

  mockPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
    if ((path as string) === SETTINGS_SYNC_PATH) return settingsPushAck() as never;
    if ((path as string) === '/api/memory/sync') {
      const mems = (body?.memories as Array<{ id: string }>) ?? [];
      return {
        applied: mems.map((m) => ({ id: m.id, server_version: '1' })),
        cursor: '1',
      } as never;
    }
    if ((path as string) === '/api/projects/sync') {
      const projs = (body?.projects as Array<{ id: string }>) ?? [];
      return {
        applied: projs.map((p) => ({ id: p.id, server_version: '1' })),
        cursor: '1',
      } as never;
    }
    // Chat sync ack
    const convs = (body?.conversations as Array<{ id: string }>) ?? [];
    const msgs = (body?.messages as Array<{ id: string }>) ?? [];
    return {
      applied: {
        conversations: convs.map((c) => ({ id: c.id, server_version: '1' })),
        messages: msgs.map((m) => ({ id: m.id, server_version: '1' })),
      },
      cursor: '1',
    } as never;
  });
});

// ── Gate tests ─────────────────────────────────────────────────────────────────

describe('settings sync — managed gate', () => {
  it('makes ZERO settings network calls (GET and POST) in local mode', async () => {
    useChatAppModeStore.getState().setAppMode('local');
    // Even if a real edit has been made, local mode must block all network I/O.
    useCloudSettingsStore.getState().setThemeMode('dark'); // stamps settingsUpdatedAt

    await syncNow();

    const settingsGetCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith(SETTINGS_SYNC_PATH),
    );
    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsGetCalls).toHaveLength(0);
    expect(settingsPostCalls).toHaveLength(0);
  });

  it('makes settings network calls in cloud mode after a real edit', async () => {
    // Real edit stamps settingsUpdatedAt so the push guard allows the POST.
    useCloudSettingsStore.getState().setThemeMode('dark');
    useChatAppModeStore.getState().setAppMode('cloud');

    await syncNow();

    const settingsGetCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith(SETTINGS_SYNC_PATH),
    );
    expect(settingsGetCalls.length).toBeGreaterThan(0);
  });
});

// ── Fresh-device guard ─────────────────────────────────────────────────────────
// The headline scenario: a new device that has never changed any cloud-safe setting
// must NOT push its defaults (which would clobber the user's dark theme set on web
// without a base revision). It must pull and adopt the server's dark theme.

describe('settings sync — fresh device guard', () => {
  it('does NOT POST when settingsUpdatedAt is null, and pulls + applies server state', async () => {
    // Precondition: factory state — no local edits.
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).toBeNull();
    expect(useCloudSettingsStore.getState().themeMode).toBe('system');

    // Server has the user's preferred dark theme (set from web).
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '5',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    // No POST — must not clobber server state with local defaults.
    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(0);

    // Pull adopted the server's dark theme.
    expect(useCloudSettingsStore.getState().themeMode).toBe('dark');
  });

  it('POSTs after the user makes a real local edit on a fresh device', async () => {
    // After the fresh-device pull, user explicitly changes theme.
    useCloudSettingsStore.getState().setThemeMode('light'); // stamps settingsUpdatedAt

    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(1);
    const body = settingsPostCalls[0]![1] as { settings: { appearance: { theme: string } } };
    expect(body.settings.appearance.theme).toBe('light');
  });
});

// ── Cursor independence ────────────────────────────────────────────────────────

describe('settings sync — cursor independence', () => {
  it('starts at "0" and advances to the server cursor after a pull that returns new data', async () => {
    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('0');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '7',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('7');
    expect(mockGet).toHaveBeenCalledWith(`${SETTINGS_SYNC_PATH}?since=0`);
  });

  it('advances settings cursor independently from chat, memory, and project cursors', async () => {
    // Pre-set other cursors to non-zero.
    useCloudSyncStateStore.getState().setCursor('42');
    useMemorySyncStateStore.getState().setMemoryCursor('15');
    useProjectSyncStateStore.getState().setProjectCursor('30');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return { settings: {}, cursor: '99', hasMore: false } as never;
      if ((path as string).startsWith('/api/memory/sync'))
        return { memories: [], cursor: '15', hasMore: false } as never;
      if ((path as string).startsWith('/api/projects/sync'))
        return { projects: [], cursor: '30', hasMore: false } as never;
      return {
        conversations: [],
        messages: [],
        artifacts: [],
        cursor: '42',
        hasMore: false,
      } as never;
    });

    await syncNow();

    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('99');
    // Other cursors must not be affected by settings pull.
    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('15');
    expect(useProjectSyncStateStore.getState().projectCursor).toBe('30');
    expect(useCloudSyncStateStore.getState().cursor).toBe('42');
  });

  it('does NOT regress the cursor when the server returns a stale/equal cursor', async () => {
    useSettingsSyncStateStore.getState().setSettingsCursor('10');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return { settings: {}, cursor: '5', hasMore: false } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    // maxCursor must keep '10', not regress to '5'.
    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('10');
  });
});

// ── Dirty detection / push ─────────────────────────────────────────────────────

describe('settings sync — dirty detection and push', () => {
  it('does NOT POST when settingsUpdatedAt is null (fresh device with factory defaults)', async () => {
    // beforeEach sets settingsUpdatedAt: null — no local edits.
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).toBeNull();

    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(0);
  });

  it('POSTs when themeMode changes (real edit stamps settingsUpdatedAt)', async () => {
    useCloudSettingsStore.getState().setThemeMode('dark'); // stamps settingsUpdatedAt
    expect(useCloudSettingsStore.getState().settingsUpdatedAt).not.toBeNull();

    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(1);
    const body = settingsPostCalls[0]![1] as {
      settings: { appearance: { theme: string } };
      baseVersion: string;
    };
    expect(body.settings.appearance.theme).toBe('dark');
    expect(body.baseVersion).toBe('0');
  });

  it('does not let an upgraded dirty snapshot publish unobserved memory defaults', async () => {
    useCloudSettingsStore.setState({
      settingsUpdatedAt: '2026-07-29T00:00:00.000Z',
      memoryPolicyInitialized: false,
    });

    await syncNow();

    const body = mockPost.mock.calls.find((call) => call[0] === SETTINGS_SYNC_PATH)?.[1] as {
      settings: Record<string, unknown>;
    };
    expect(body.settings['capabilities']).toBeUndefined();
  });

  it('uses the last observed server revision even when the local edit clock is future-skewed', async () => {
    useSettingsSyncStateStore.getState().setSettingsCursor('41');
    useCloudSettingsStore.getState().setThemeMode('dark');
    useCloudSettingsStore.setState({ settingsUpdatedAt: '2999-01-01T00:00:00.000Z' });

    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(1);
    const body = settingsPostCalls[0]![1] as { baseVersion: string; updatedAt?: string };
    expect(body.baseVersion).toBe('41');
    expect(body.updatedAt).toBeUndefined();
  });

  it('pulls the server winner when a future-skewed local edit has a stale baseVersion', async () => {
    useSettingsSyncStateStore.getState().setSettingsCursor('8');
    useCloudSettingsStore.getState().setThemeMode('light');
    useCloudSettingsStore.setState({ settingsUpdatedAt: '2999-01-01T00:00:00.000Z' });
    mockPost.mockImplementation(async (path: string) => {
      if (path === SETTINGS_SYNC_PATH) return { applied: false, cursor: '9' } as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) {
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '9',
          hasMore: false,
        } as never;
      }
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudSettingsStore.getState().themeMode).toBe('dark');
    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('9');
    const body = mockPost.mock.calls.find((call) => call[0] === SETTINGS_SYNC_PATH)?.[1] as {
      baseVersion: string;
      updatedAt?: string;
    };
    expect(body).toMatchObject({ baseVersion: '8' });
    expect(body.updatedAt).toBeUndefined();
  });

  it('clears the dirty baseline after a successful push so a second sync does not re-post', async () => {
    useCloudSettingsStore.getState().setThemeMode('light');

    // First sync — posts.
    await syncNow();
    jest.clearAllMocks();

    // Reset get/post mocks for second sync.
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH)) return emptySettingsPull() as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });
    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === SETTINGS_SYNC_PATH) return settingsPushAck() as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    // Second sync — no further settings change — must NOT post again.
    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(0);
  });

  it('POSTs the correct namespace structure with only cloud-safe namespaces', async () => {
    // Cloud-safe setters stamp settingsUpdatedAt.
    useCloudSettingsStore.getState().setThemeMode('dark');
    useCloudSettingsStore.getState().setPersonalization({ nickname: 'Sid' });
    useCloudSettingsStore.getState().setNotificationsEnabled(false);
    useCloudSettingsStore.getState().setSpeechLanguage('fr');

    await syncNow();

    const settingsPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    expect(settingsPostCalls).toHaveLength(1);
    const body = settingsPostCalls[0]![1] as { settings: Record<string, unknown> };
    const settings = body.settings;

    // Must have the allowed namespaces we mapped.
    expect(settings.appearance).toBeDefined();
    expect(settings.personalization).toBeDefined();
    expect(settings.notifications).toBeDefined();
    expect(settings.language).toBeDefined();
    expect(settings.chat).toBeDefined();

    // Must NOT have forbidden namespaces.
    expect(settings.byok).toBeUndefined();
    expect(settings.apiKeys).toBeUndefined();
    expect(settings.providers).toBeUndefined();
    expect(settings.models).toBeUndefined();
    expect(settings.device).toBeUndefined();
    expect(settings.security).toBeUndefined();
    expect(settings.secrets).toBeUndefined();
    expect(settings.credentials).toBeUndefined();
    expect(settings.account).toBeUndefined();
  });
});

// ── Pull applies into the live store ──────────────────────────────────────────

describe('settings sync — pull applies into useCloudSettingsStore', () => {
  it('rebases a local edit made while the settings GET is in flight onto the server response', async () => {
    const pullStarted = deferred<void>();
    const pendingPull = deferred<ReturnType<typeof emptySettingsPull>>();
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) {
        pullStarted.resolve();
        return pendingPull.promise as never;
      }
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    const sync = syncNow();
    await pullStarted.promise;
    useCloudSettingsStore.getState().setThemeMode('light');
    pendingPull.resolve({
      settings: {
        appearance: { theme: 'dark' },
        notifications: { enabled: false },
      },
      cursor: '2',
      hasMore: false,
    });
    await sync;

    expect(useCloudSettingsStore.getState().themeMode).toBe('light');
    expect(useCloudSettingsStore.getState().notificationsEnabled).toBe(false);
    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('2');
  });

  it('rebases an edit made during a rejected POST instead of letting the conflict pull erase it', async () => {
    useSettingsSyncStateStore.getState().setSettingsCursor('8');
    useCloudSettingsStore.getState().setThemeMode('light');
    const pushStarted = deferred<void>();
    const pendingPush = deferred<{ applied: boolean; cursor: string }>();
    mockPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      if (path === SETTINGS_SYNC_PATH) {
        pushStarted.resolve();
        return pendingPush.promise as never;
      }
      const conversations = (body?.conversations as Array<{ id: string }>) ?? [];
      const messages = (body?.messages as Array<{ id: string }>) ?? [];
      return {
        applied: {
          conversations: conversations.map(({ id }) => ({ id, server_version: '1' })),
          messages: messages.map(({ id }) => ({ id, server_version: '1' })),
        },
        cursor: '1',
      } as never;
    });
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) {
        return {
          settings: {
            appearance: { theme: 'dark' },
            notifications: { enabled: false },
          },
          cursor: '9',
          hasMore: false,
        } as never;
      }
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    const sync = syncNow();
    await pushStarted.promise;
    useCloudSettingsStore.getState().setThemeMode('system');
    pendingPush.resolve({ applied: false, cursor: '9' });
    await sync;

    expect(useCloudSettingsStore.getState().themeMode).toBe('system');
    expect(useCloudSettingsStore.getState().notificationsEnabled).toBe(false);
    expect(useSettingsSyncStateStore.getState().settingsCursor).toBe('9');

    jest.clearAllMocks();
    mockPost.mockImplementation(async (path: string) => {
      if (path === SETTINGS_SYNC_PATH) return settingsPushAck('10') as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) return emptySettingsPull('10') as never;
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    const retryBody = mockPost.mock.calls.find((call) => call[0] === SETTINGS_SYNC_PATH)?.[1] as {
      settings: { appearance: { theme: string }; notifications: { enabled: boolean } };
      baseVersion: string;
    };
    expect(retryBody.baseVersion).toBe('9');
    expect(retryBody.settings.appearance.theme).toBe('system');
    expect(retryBody.settings.notifications.enabled).toBe(false);
  });

  it('retains server fields unknown to Mobile when a later Mobile edit is pushed', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) {
        return {
          settings: {
            appearance: { theme: 'dark', webOnlyDensity: 'compact' },
            capabilities: {
              memory: true,
              generateFromHistory: true,
              allowToolAssistedGeneration: true,
            },
          },
          cursor: '3',
          hasMore: false,
        } as never;
      }
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });
    await syncNow();

    useCloudSettingsStore.getState().setAccentColor('blue');
    jest.clearAllMocks();
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith(SETTINGS_SYNC_PATH)) return emptySettingsPull('4') as never;
      if (path.startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if (path.startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === SETTINGS_SYNC_PATH) return settingsPushAck('4') as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    const body = mockPost.mock.calls.find((call) => call[0] === SETTINGS_SYNC_PATH)?.[1] as {
      settings: {
        appearance: Record<string, unknown>;
        capabilities: Record<string, unknown>;
      };
    };
    expect(body.settings.appearance).toMatchObject({
      theme: 'dark',
      accentColor: 'blue',
      webOnlyDensity: 'compact',
    });
    expect(body.settings.capabilities).toEqual({
      memory: true,
      generateFromHistory: true,
      allowToolAssistedGeneration: true,
    });
  });

  it('applies pulled appearance namespace: theme maps to themeMode', async () => {
    expect(useCloudSettingsStore.getState().themeMode).toBe('system');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark', accentColor: 'blue' } },
          cursor: '5',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudSettingsStore.getState().themeMode).toBe('dark');
    expect(useCloudSettingsStore.getState().accentColor).toBe('blue');
  });

  it('applies pulled personalization namespace: customInstructions maps to instructions', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: {
            personalization: {
              nickname: 'CloudNick',
              customInstructions: 'Be concise',
              warmth: 80,
            },
          },
          cursor: '6',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    const p = useCloudSettingsStore.getState().personalization;
    expect(p.nickname).toBe('CloudNick');
    expect(p.instructions).toBe('Be concise');
    expect(p.warmth).toBe(80);
  });

  it('applies pulled account memory preferences without importing Web-only policy keys', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: {
            capabilities: {
              memory: true,
              generateFromHistory: false,
              allowToolAssistedGeneration: true,
            },
          },
          cursor: '7',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudSettingsStore.getState().referencePastChats).toBe(true);
    expect(useCloudSettingsStore.getState().generateMemoryFromHistory).toBe(false);
    expect(
      (useCloudSettingsStore.getState() as unknown as Record<string, unknown>)[
        'allowToolAssistedGeneration'
      ],
    ).toBeUndefined();
  });

  it('applies pulled language namespace: locale maps to speechLanguage', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { language: { locale: 'fr' } },
          cursor: '8',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudSettingsStore.getState().speechLanguage).toBe('fr');
  });

  it('does not apply pulled data when cursor has not advanced (server returns same cursor)', async () => {
    useSettingsSyncStateStore.getState().setSettingsCursor('5');
    useCloudSettingsStore.setState({ themeMode: 'light' }); // direct setState, no settingsUpdatedAt stamp

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '5', // same as current cursor — nothing new
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    // themeMode must NOT have been overwritten because the cursor didn't advance.
    expect(useCloudSettingsStore.getState().themeMode).toBe('light');
  });
});

// ── Anti-churn: pull does not trigger re-push ──────────────────────────────────

describe('settings sync — anti-churn after pull', () => {
  it('does not POST on the cycle immediately following a pull that updated the store', async () => {
    // Cycle 1: pull returns new theme 'dark'. settingsUpdatedAt is null (no local edit).
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '9',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    const postCallsAfterPull = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === SETTINGS_SYNC_PATH,
    );
    // The pull-triggered store update must NOT cause pushSettings to POST.
    // Guard 1 (settingsUpdatedAt === null) prevents the push.
    expect(postCallsAfterPull).toHaveLength(0);
  });

  it('does NOT re-push after a pull even when settingsUpdatedAt is non-null (snapshot-diff guard)', async () => {
    // Simulate: user made an edit before the pull.
    useCloudSettingsStore.getState().setThemeMode('light'); // stamps settingsUpdatedAt

    // Pull returns 'dark' — a different value. Apply updates store to 'dark'.
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith(SETTINGS_SYNC_PATH))
        return {
          settings: { appearance: { theme: 'dark' } },
          cursor: '12',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    // There should be exactly one POST (for the 'light' push before the pull),
    // but zero settings POSTs for the pulled 'dark' value (anti-churn).
    // After pull, lastPushedSnapshot is updated to the post-pull projection,
    // so the 'dark' value is not detected as a new change on the next push check.
    const postCalls = mockPost.mock.calls.filter((c) => (c[0] as string) === SETTINGS_SYNC_PATH);
    // One post for the 'light' local edit; no second post for the pulled 'dark'.
    expect(postCalls).toHaveLength(1);
    const body = postCalls[0]![1] as { settings: { appearance: { theme: string } } };
    expect(body.settings.appearance.theme).toBe('light'); // the local edit, not the pull
  });
});

// ── Leak guard: toCloudSettings never emits secrets ───────────────────────────

describe('settings mapping — leak guard (toCloudSettings)', () => {
  it('NEVER emits forbidden namespace keys even when injected into the store snapshot', () => {
    // Build a synthetic store snapshot that includes fake secret fields.
    // These fields do NOT exist in the real store shape, but the test simulates
    // a future regression where someone accidentally adds a secret field and maps it.
    const storeWithFakeSecrets = {
      ...useCloudSettingsStore.getState(),
      // Inject fake secret fields at the top level (as if someone added them to the store).
      byokApiKey: 'sk-ant-SHOULD-NOT-APPEAR',
      providerApiKey: 'sk-openai-SHOULD-NOT-APPEAR',
      anthropicApiKey: 'sk-ant-SHOULD-NOT-APPEAR-2',
    } as Parameters<typeof toCloudSettings>[0];

    const payload = toCloudSettings(storeWithFakeSecrets);
    const payloadJson = JSON.stringify(payload);

    // None of the forbidden top-level namespaces must appear.
    const forbidden = [
      'byok',
      'apiKeys',
      'api_keys',
      'providers',
      'models',
      'device',
      'security',
      'secrets',
      'credentials',
      'account',
    ];
    for (const ns of forbidden) {
      expect((payload as Record<string, unknown>)[ns]).toBeUndefined();
    }

    // The raw payload JSON must not contain any of the fake secret values.
    expect(payloadJson).not.toContain('SHOULD-NOT-APPEAR');
    expect(payloadJson).not.toContain('sk-ant-');
    expect(payloadJson).not.toContain('sk-openai-');
  });

  it('does not publish new memory defaults before this device observes or edits the policy', () => {
    const payload = toCloudSettings(useCloudSettingsStore.getState());
    const payloadJson = JSON.stringify(payload);

    expect(payload.capabilities).toBeUndefined();
    expect(payloadJson).not.toContain('memoryPolicyInitialized');
  });

  it('emits only account memory policy after an explicit edit, never device capability results', () => {
    useCloudSettingsStore.getState().setReferencePastChats(false);
    const payload = toCloudSettings(useCloudSettingsStore.getState());
    const payloadJson = JSON.stringify(payload);

    expect(payload.capabilities).toEqual({
      memory: false,
      generateFromHistory: true,
    });
    expect(payloadJson).not.toContain('voiceEnabled');
    expect(payloadJson).not.toContain('hapticsEnabled');
    expect(payloadJson).not.toContain('backgroundFetchEnabled');
    expect(payloadJson).not.toContain('autoApproveMode');
    expect(payloadJson).not.toContain('selectedVoiceId');
    expect(payloadJson).not.toContain('selectedPresetId');
    expect(payloadJson).not.toContain('ttsProvider');
    expect(payloadJson).not.toContain('speechRate');
    expect(payloadJson).not.toContain('speechPitch');
    expect(payloadJson).not.toContain('isTemporaryChat');
    // settingsUpdatedAt is internal metadata — must never appear in the push body.
    expect(payloadJson).not.toContain('settingsUpdatedAt');
  });

  it('NEVER emits keys matching secret key patterns (apiKey, token, secret, password)', () => {
    const payload = toCloudSettings(useCloudSettingsStore.getState());
    const payloadJson = JSON.stringify(payload);

    // These key substrings must never appear in a settings push body.
    const secretPatterns = [
      'apiKey',
      'apikey',
      'api_key',
      'token',
      'password',
      'bearer',
      'secret',
      'credential',
    ];
    for (const pattern of secretPatterns) {
      expect(payloadJson.toLowerCase()).not.toContain(pattern.toLowerCase());
    }
  });

  it('only emits the declared cloud-safe namespace keys at the top level', () => {
    const payload = toCloudSettings(useCloudSettingsStore.getState());
    const topLevelKeys = Object.keys(payload);
    const allowedNamespaces = new Set([
      'appearance',
      'personalization',
      'profile',
      'notifications',
      'language',
      'accessibility',
      'capabilities',
      'chat',
      'editor',
    ]);
    for (const key of topLevelKeys) {
      expect(allowedNamespaces.has(key)).toBe(true);
    }
  });
});

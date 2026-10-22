import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST_NAVIGATION_CHANNELS } from '@agiworkforce/local-runtime-contract';

const exposed = new Map<string, Record<string, unknown>>();

const invoke = vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const subscriptions = new Map<string, (event: unknown, payload: unknown) => void>();
const getPathForFile = vi.fn((_file: unknown) => '');

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, value: Record<string, unknown>) => {
      exposed.set(key, value);
    }),
  },
  ipcRenderer: {
    invoke,
    on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
      subscriptions.set(channel, listener);
    }),
    removeListener: vi.fn((channel: string) => {
      subscriptions.delete(channel);
    }),
  },
  webUtils: { getPathForFile },
}));

const RETIRED = ['handles', 'invokeBridge', 'windowControl', 'dialog', 'relaunch'];
const HOSTED_PAGE = [
  'invokeRuntime',
  'onDeepLink',
  'onVoiceHotkey',
  'onHostCommand',
  'onRuntimeEvent',
  'readPreferences',
  'writePreferences',
  'openExternal',
  'notify',
  'checkForUpdate',
  'openUpdateInstaller',
  'restartToUpdate',
];

const originalArgv = [...process.argv];

async function loadPreload(extraArguments: string[]): Promise<Record<string, unknown>> {
  process.argv = [...originalArgv, '--agi-app-version=1.8.0', ...extraArguments];
  exposed.clear();
  vi.resetModules();
  await import('../preload');
  const bridge = exposed.get('agiHost');
  if (!bridge) throw new Error('the preload exposed no bridge');
  return bridge;
}

afterEach(() => {
  process.argv = [...originalArgv];
});

describe('what the preload puts on the page', () => {
  it('exposes the hosted page bridge and nothing that drives the window or the account', async () => {
    const bridge = await loadPreload([]);

    for (const name of RETIRED) expect(name in bridge, name).toBe(false);
    for (const name of HOSTED_PAGE) expect(typeof bridge[name], name).toBe('function');
    expect(bridge['appVersion']).toBe('1.8.0');
    expect(bridge['browserSignIn']).toEqual({ cancellation: true });
  });
});

describe('window history for the page', () => {
  type Navigation = {
    read: () => Promise<unknown>;
    go: (direction: string) => Promise<void>;
    onChange: (callback: (state: unknown) => void) => () => void;
  };

  async function navigation(): Promise<Navigation> {
    const bridge = await loadPreload([]);
    return bridge['navigation'] as Navigation;
  }

  it('reads the state main reports, and answers nowhere to go for anything else', async () => {
    const nav = await navigation();

    invoke.mockResolvedValueOnce({ canGoBack: true, canGoForward: false });
    await expect(nav.read()).resolves.toEqual({ canGoBack: true, canGoForward: false });
    expect(invoke).toHaveBeenLastCalledWith(HOST_NAVIGATION_CHANNELS.read);

    invoke.mockResolvedValueOnce({ canGoBack: 'yes' });
    await expect(nav.read()).resolves.toEqual({ canGoBack: false, canGoForward: false });
  });

  it('asks main to step in a direction', async () => {
    const nav = await navigation();

    await nav.go('forward');

    expect(invoke).toHaveBeenLastCalledWith(HOST_NAVIGATION_CHANNELS.go, 'forward');
  });

  it('passes on well-formed changes until the page unsubscribes', async () => {
    const nav = await navigation();
    const seen = vi.fn();

    const stop = nav.onChange(seen);
    const send = subscriptions.get(HOST_NAVIGATION_CHANNELS.changed);
    send?.({}, { canGoBack: false, canGoForward: true, extra: 'dropped' });
    send?.({}, 'not a state');
    stop();

    expect(seen.mock.calls).toEqual([[{ canGoBack: false, canGoForward: true }]]);
    expect(subscriptions.has(HOST_NAVIGATION_CHANNELS.changed)).toBe(false);
  });
});

describe('a drop on the page', () => {
  async function dropListener(): Promise<(event: unknown) => void> {
    const listen = vi.spyOn(window, 'addEventListener');
    try {
      await loadPreload([]);
      const registered = listen.mock.calls.find(([type]) => type === 'drop')?.[1];
      if (typeof registered !== 'function') throw new Error('the preload listens for no drop');
      return registered as (event: unknown) => void;
    } finally {
      listen.mockRestore();
    }
  }

  const folder = { name: 'project' };
  const drop = (isTrusted: boolean) => ({ isTrusted, dataTransfer: { files: [folder] } });
  const sentPaths = () =>
    invoke.mock.calls.filter(
      ([, paths]) => Array.isArray(paths) && paths.includes('/work/project'),
    );

  it('sends the folder a person dropped to main for a grant', async () => {
    const listener = await dropListener();
    getPathForFile.mockClear().mockReturnValue('/work/project');
    invoke.mockClear();

    listener(drop(true));

    expect(sentPaths()).toHaveLength(1);
  });

  it('ignores a drop the page dispatched itself', async () => {
    const listener = await dropListener();
    getPathForFile.mockClear().mockReturnValue('/work/project');
    invoke.mockClear();

    listener(drop(false));
    window.dispatchEvent(new Event('drop'));

    expect(sentPaths()).toHaveLength(0);
    expect(getPathForFile).not.toHaveBeenCalledWith(folder);
  });
});

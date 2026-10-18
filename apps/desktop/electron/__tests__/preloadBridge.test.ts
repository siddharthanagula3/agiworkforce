import { afterEach, describe, expect, it, vi } from 'vitest';

const exposed = new Map<string, Record<string, unknown>>();

const invoke = vi.fn(async (..._args: unknown[]) => undefined);
const getPathForFile = vi.fn((_file: unknown) => '');

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, value: Record<string, unknown>) => {
      exposed.set(key, value);
    }),
  },
  ipcRenderer: {
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
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

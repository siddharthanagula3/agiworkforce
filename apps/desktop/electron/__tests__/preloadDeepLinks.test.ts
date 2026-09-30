import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  let exposed: Record<string, unknown> | null = null;
  return {
    handlers,
    exposed: () => exposed,
    module: {
      contextBridge: {
        exposeInMainWorld: (_key: string, api: Record<string, unknown>) => {
          exposed = api;
        },
      },
      ipcRenderer: {
        on: (channel: string, handler: (event: unknown, ...args: unknown[]) => void) => {
          handlers.set(channel, handler);
        },
        removeListener: vi.fn(),
        invoke: vi.fn(async () => undefined),
        send: vi.fn(),
      },
      webUtils: { getPathForFile: () => '' },
    },
  };
});

vi.mock('electron', () => electron.module);

import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

describe('deep links delivered before the page subscribes', () => {
  beforeEach(() => {
    vi.resetModules();
    electron.handlers.clear();
  });

  it('are held for the first subscriber, then delivered live', async () => {
    await import('../preload');
    const deliver = electron.handlers.get(ELECTRON_IPC_CHANNELS.deepLink)!;
    deliver({}, 'agiworkforce-cloud://chat/abc');

    const api = electron.exposed() as { onDeepLink: (cb: (url: string) => void) => () => void };
    const received: string[] = [];
    const stop = api.onDeepLink((url) => received.push(url));
    expect(received).toEqual(['agiworkforce-cloud://chat/abc']);

    deliver({}, 'agiworkforce-cloud://code/xyz');
    expect(received).toEqual(['agiworkforce-cloud://chat/abc', 'agiworkforce-cloud://code/xyz']);

    stop();
    deliver({}, 'agiworkforce-cloud://chat/late');
    expect(received).toHaveLength(2);
  });
});

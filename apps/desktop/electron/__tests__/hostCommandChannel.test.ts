import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_COMMANDS, isHostCommand } from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

type Listener = (event: unknown, payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
const exposed = new Map<string, unknown>();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, value: unknown) => {
      exposed.set(key, value);
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(async () => undefined),
    on: vi.fn((channel: string, listener: Listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)?.add(listener);
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener);
    }),
  },
  webUtils: { getPathForFile: vi.fn(() => '') },
}));

await import('../preload');

function bridge() {
  const value = exposed.get('agiHost');
  if (!value) throw new Error('the preload exposed no bridge');
  return value as { onHostCommand(callback: (command: string) => void): () => void };
}

function deliver(payload: unknown): void {
  for (const listener of listeners.get(ELECTRON_IPC_CHANNELS.hostCommand) ?? []) {
    listener({}, payload);
  }
}

beforeEach(() => {
  listeners.get(ELECTRON_IPC_CHANNELS.hostCommand)?.clear();
});

describe('the host command channel', () => {
  it('names the commands the menu and the page agree on', () => {
    expect([...HOST_COMMANDS]).toEqual(['toggle-sidebar', 'show-keyboard-shortcuts']);
    for (const command of HOST_COMMANDS) {
      expect(isHostCommand(command)).toBe(true);
    }
    for (const value of ['', 'quit', 'toggle sidebar', 42, null, undefined, {}]) {
      expect(isHostCommand(value), String(value)).toBe(false);
    }
  });

  it('delivers every command the contract names', () => {
    const seen: string[] = [];
    const stop = bridge().onHostCommand((command) => seen.push(command));

    for (const command of HOST_COMMANDS) deliver(command);

    expect(seen).toEqual([...HOST_COMMANDS]);
    stop();
  });

  // The main process is trusted, but the channel is the page's only view of it
  // and a renderer that acted on an unknown string would be acting on nothing.
  it('drops anything that is not a command', () => {
    const seen: string[] = [];
    const stop = bridge().onHostCommand((command) => seen.push(command));

    deliver('open-the-pod-bay-doors');
    deliver(7);
    deliver(null);
    deliver({ command: 'toggle-sidebar' });

    expect(seen).toEqual([]);
    stop();
  });

  it('stops listening when the subscription is released', () => {
    const seen: string[] = [];
    const stop = bridge().onHostCommand((command) => seen.push(command));

    stop();
    deliver('toggle-sidebar');

    expect(seen).toEqual([]);
  });
});

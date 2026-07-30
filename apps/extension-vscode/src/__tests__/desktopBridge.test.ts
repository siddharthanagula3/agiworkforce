import { once } from 'events';
import { chmodSync, writeFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { type AddressInfo } from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { DesktopBridge, getDesktopTokenPaths, readBridgeToken } from '../features/desktop-bridge';

const disposables: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (disposables.length > 0) await disposables.pop()?.();
  vi.restoreAllMocks();
});

describe('DesktopBridge token contract', () => {
  it('resolves the same macOS app-data candidates as Desktop', () => {
    expect(getDesktopTokenPaths('darwin', '/Users/test', {})).toEqual([
      '/Users/test/Library/Containers/com.agiworkforce.desktop/Data/Library/Application Support/com.agiworkforce.desktop/.ipc_token',
      '/Users/test/Library/Application Support/com.agiworkforce.desktop/.ipc_token',
    ]);
  });

  it('resolves Linux and Windows app-data token paths', () => {
    expect(getDesktopTokenPaths('linux', '/home/test', {})).toEqual([
      '/home/test/.local/share/com.agiworkforce.desktop/.ipc_token',
    ]);
    expect(
      getDesktopTokenPaths('win32', 'C:\\Users\\test', {
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      }),
    ).toEqual([join('C:\\Users\\test\\AppData\\Local', 'com.agiworkforce.desktop', '.ipc_token')]);
  });

  it('reads Desktop .ipc_token through one checked file descriptor', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agi-vscode-token-'));
    disposables.push(() => rm(dir, { recursive: true, force: true }));
    const tokenPath = join(dir, '.ipc_token');
    writeFileSync(tokenPath, ' desktop-token \n', { mode: 0o600 });
    expect(readBridgeToken([tokenPath])).toBe('desktop-token');
  });

  it.runIf(process.platform !== 'win32')('rejects a group-readable token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agi-vscode-token-'));
    disposables.push(() => rm(dir, { recursive: true, force: true }));
    const tokenPath = join(dir, '.ipc_token');
    writeFileSync(tokenPath, 'desktop-token', { mode: 0o600 });
    chmodSync(tokenPath, 0o640);
    expect(readBridgeToken([tokenPath])).toBeUndefined();
  });
});

describe('DesktopBridge realtime integration', () => {
  it('authenticates with Desktop RealtimeEvent and proves a ping response round trip', async () => {
    const server = new WebSocketServer({ port: 0 });
    await once(server, 'listening');
    disposables.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address() as AddressInfo;
    const received: unknown[] = [];

    server.on('connection', (socket) => {
      socket.on('message', (bytes) => {
        const message = JSON.parse(String(bytes)) as { type: string; id?: string };
        received.push(message);
        if (message.type === 'Authenticate') {
          socket.send(JSON.stringify({ type: 'Authenticated', user_id: 'vscode-extension' }));
        } else if (message.type === 'NativeMessage' && message.id) {
          socket.send(
            JSON.stringify({
              type: 'NativeResponse',
              id: message.id,
              success: true,
              data: { pong: true },
              error: null,
            }),
          );
        }
      });
    });

    const bridge = new DesktopBridge(address.port, () => 'desktop-token');
    disposables.push(() => bridge.dispose());
    await bridge.connect();
    await vi.waitFor(() => expect(bridge.status).toBe('connected'));

    await expect(bridge.healthCheck()).resolves.toBe(true);
    expect(received[0]).toEqual({
      type: 'Authenticate',
      user_id: 'vscode-extension',
      team_id: null,
      token: 'desktop-token',
    });
    expect(received[1]).toMatchObject({
      type: 'NativeMessage',
      payload: { type: 'ping' },
    });
  });

  it('stays neutrally disconnected when Desktop has not created a token', async () => {
    const bridge = new DesktopBridge(8787, () => undefined);
    disposables.push(() => bridge.dispose());
    const statusBar = bridge.initStatusBar();
    await bridge.connect();
    expect(bridge.status).toBe('disconnected');
    expect(statusBar.text).toBe('$(plug) Desktop: Not connected');
    expect(statusBar.backgroundColor).toBeUndefined();
  });

  it('fails a health check when Desktop returns a non-pong response', async () => {
    const server = new WebSocketServer({ port: 0 });
    await once(server, 'listening');
    disposables.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address() as AddressInfo;

    server.on('connection', (socket) => {
      socket.on('message', (bytes) => {
        const message = JSON.parse(String(bytes)) as { type: string; id?: string };
        if (message.type === 'Authenticate') {
          socket.send(JSON.stringify({ type: 'Authenticated', user_id: 'vscode-extension' }));
        } else if (message.id) {
          socket.send(
            JSON.stringify({
              type: 'NativeResponse',
              id: message.id,
              success: false,
              data: null,
              error: 'not a pong',
            }),
          );
        }
      });
    });

    const bridge = new DesktopBridge(address.port, () => 'desktop-token');
    disposables.push(() => bridge.dispose());
    await bridge.connect();
    await vi.waitFor(() => expect(bridge.status).toBe('connected'));
    await expect(bridge.healthCheck()).resolves.toBe(false);
  });
});

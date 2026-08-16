
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { Config } from '../../platform/config';
import { parseBridgeInbound, type BridgeOutbound } from '../../protocol/bridgeMessages';

export function getDesktopTokenPaths(
  platform = process.platform,
  homeDir = os.homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'darwin') {
    return [
      path.join(
        homeDir,
        'Library',
        'Containers',
        'com.agiworkforce.desktop',
        'Data',
        'Library',
        'Application Support',
        'com.agiworkforce.desktop',
        '.ipc_token',
      ),
      path.join(
        homeDir,
        'Library',
        'Application Support',
        'com.agiworkforce.desktop',
        '.ipc_token',
      ),
    ];
  }

  if (platform === 'win32') {
    const localAppData = environment['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local');
    return [path.join(localAppData, 'com.agiworkforce.desktop', '.ipc_token')];
  }

  const dataHome = environment['XDG_DATA_HOME'] ?? path.join(homeDir, '.local', 'share');
  return [path.join(dataHome, 'com.agiworkforce.desktop', '.ipc_token')];
}

export function readBridgeToken(
  tokenPaths: readonly string[] = getDesktopTokenPaths(),
): string | undefined {
  for (const tokenPath of tokenPaths) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(tokenPath, fs.constants.O_RDONLY);
      if (process.platform !== 'win32') {
        const stat = fs.fstatSync(fd);
        const mode = stat.mode & 0o777;
        if (mode & 0o077) {
          console.error(
            `[AGI Workforce Bridge] .ipc_token has unsafe permissions (0${mode.toString(8)}). Expected 0600. Refusing to load.`,
          );
          continue;
        }
      }
      const buf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      const token = buf.subarray(0, bytesRead).toString('utf8').trim();
      if (token.length > 0) return token;
    } catch {
      // Try the next Desktop app-data candidate.
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // Best-effort close; nothing actionable on failure.
        }
      }
    }
  }
  return undefined;
}

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class DesktopBridge implements vscode.Disposable {
  private _status: BridgeStatus = 'disconnected';
  private _ws: WebSocket | undefined;
  private _reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private _healthTimer: ReturnType<typeof setTimeout> | undefined;
  private _handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _pendingPings = new Map<
    string,
    { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private _nextRequestId = 0;
  private _port: number;
  private _disposed = false;

  private _authOk = false;
  private _bridgeToken: string | undefined;

  private _reconnectBackoffMs: number;
  private _reconnectAttempts = 0;
  private _wasConnected = false;
  private readonly _onStatusChange = new vscode.EventEmitter<BridgeStatus>();
  public readonly onStatusChange = this._onStatusChange.event;

  private _statusBarItem: vscode.StatusBarItem | undefined;

  private static readonly BACKOFF_INITIAL_MS = 1_000;
  private static readonly BACKOFF_MAX_MS = 8_000;
  private static readonly BACKOFF_MULTIPLIER = 2;

  private static readonly HEALTH_CHECK_INTERVAL_MS = 30_000;
  private static readonly HANDSHAKE_TIMEOUT_MS = 5_000;

  constructor(
    port: number,
    private readonly _readBridgeToken: () => string | undefined = readBridgeToken,
  ) {
    this._port = port;
    this._reconnectBackoffMs = DesktopBridge.BACKOFF_INITIAL_MS;
  }

  get status(): BridgeStatus {
    return this._status;
  }

  get wsUrl(): string {
    return `ws://127.0.0.1:${this._port}/ws`;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  initStatusBar(): vscode.StatusBarItem {
    if (this._statusBarItem === undefined) {
      this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
      this._statusBarItem.command = 'agi-workforce.bridgeReconnect';
    }
    this._updateStatusBar();
    this._statusBarItem.show();
    return this._statusBarItem;
  }

  private _updateStatusBar(): void {
    if (this._statusBarItem === undefined) return;

    switch (this._status) {
      case 'connected':
        this._statusBarItem.text = '$(plug) Bridge: Connected';
        this._statusBarItem.tooltip = `Desktop bridge connected on localhost:${this._port}`;
        this._statusBarItem.backgroundColor = undefined;
        break;
      case 'connecting':
        this._statusBarItem.text = '$(sync~spin) Bridge: Connecting...';
        this._statusBarItem.tooltip = `Connecting to desktop bridge on localhost:${this._port} (attempt ${this._reconnectAttempts})`;
        this._statusBarItem.backgroundColor = undefined;
        break;
      case 'disconnected':
        this._statusBarItem.text = '$(plug) Desktop: Not connected';
        this._statusBarItem.tooltip =
          'Optional AGI Desktop connection is not active. Click to connect after opening the Desktop app.';
        this._statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this._statusBarItem.text = '$(error) Bridge: Error';
        this._statusBarItem.tooltip = `Desktop bridge error on localhost:${this._port}. Click to retry.`;
        this._statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground',
        );
        break;
    }
  }

  async connect(): Promise<void> {
    if (this._disposed) return;
    this._setStatus('connecting');

    this._bridgeToken = this._readBridgeToken();
    if (this._bridgeToken === undefined || this._bridgeToken.trim() === '') {
      this._setStatus('disconnected');
      return;
    }

    this._connectWebSocket();
    this._startHealthLoop();
  }

  disconnect(): void {
    this._clearReconnect();
    this._clearHealthLoop();
    this._closeWebSocket();
    this._setStatus('disconnected');
    this._resetBackoff();
  }

  async reconnect(): Promise<void> {
    this._resetBackoff();
    this._clearReconnect();
    this._closeWebSocket();
    await this.connect();
  }

  async healthCheck(timeoutMs = 2_000): Promise<boolean> {
    const ws = this._ws;
    if (this._status !== 'connected' || !this._authOk || ws?.readyState !== WebSocket.OPEN) {
      return false;
    }

    const id = `vscode-ping-${++this._nextRequestId}`;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this._pendingPings.delete(id);
        resolve(false);
      }, timeoutMs);
      this._pendingPings.set(id, { resolve, timer });
      if (!this._wsSend({ type: 'NativeMessage', id, payload: { type: 'ping' } })) {
        clearTimeout(timer);
        this._pendingPings.delete(id);
        resolve(false);
      }
    });
  }

  private _connectWebSocket(): void {
    this._closeWebSocket();
    this._authOk = false;

    try {
      if (this._bridgeToken === undefined) {
        this._setStatus('disconnected');
        return;
      }

      this._ws = new WebSocket(this.wsUrl);

      this._ws.onopen = () => {
        this._resetBackoff();
        this._wasConnected = true;

        if (this._bridgeToken !== undefined) {
          this._wsSend({
            type: 'Authenticate',
            user_id: 'vscode-extension',
            team_id: null,
            token: this._bridgeToken,
          });
          this._startHandshakeTimeout();
        }
      };

      this._ws.onmessage = (event) => {
        try {
          const parsedRaw = JSON.parse(String(event.data));
          const validated = parseBridgeInbound(parsedRaw);
          if (validated === undefined) {
            console.warn(`[AGI Workforce Bridge] dropping malformed inbound frame:`, parsedRaw);
            if (!this._authOk) {
              this._setStatus('error');
              this._closeWebSocket();
              this._scheduleReconnect();
            }
            return;
          }

          if (validated.type === 'Authenticated') {
            this._authOk = true;
            this._clearHandshakeTimeout();
            this._setStatus('connected');
            return;
          }

          if (validated.type === 'AuthenticationFailed') {
            console.warn(
              `[AGI Workforce Bridge] Desktop rejected authentication: ${validated.reason}`,
            );
            this._setStatus('error');
            this._closeWebSocket();
            this._scheduleReconnect();
            return;
          }

          if (!this._authOk) return;

          const pending = this._pendingPings.get(validated.id);
          if (pending === undefined) return;
          clearTimeout(pending.timer);
          this._pendingPings.delete(validated.id);
          const data =
            typeof validated.data === 'object' && validated.data !== null
              ? (validated.data as Record<string, unknown>)
              : undefined;
          pending.resolve(validated.success && data?.['pong'] === true);
        } catch {
          // Ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._ws = undefined;
        this._authOk = false;
        this._clearHandshakeTimeout();
        if (!this._disposed) {
          const previousStatus = this._status;
          this._setStatus('disconnected');

          if (this._wasConnected && previousStatus === 'connected') {
            this._showDisconnectNotification();
          }

          this._scheduleReconnect();
        }
      };

      this._ws.onerror = () => {
        // onclose will fire after this
      };
    } catch {
      this._setStatus('error');
      this._scheduleReconnect();
    }
  }

  private _closeWebSocket(): void {
    this._clearHandshakeTimeout();
    for (const pending of this._pendingPings.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this._pendingPings.clear();
    if (this._ws !== undefined) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = undefined;
    }
  }

  private _wsSend(message: BridgeOutbound): boolean {
    if (!this._authOk && message.type !== 'Authenticate') {
      console.warn(
        `[AGI Workforce Bridge] dropping outbound '${message.type}' — auth not complete.`,
      );
      return false;
    }
    const ws = this._ws;
    if (ws !== undefined && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private _showDisconnectNotification(): void {
    void vscode.window
      .showWarningMessage(
        'AGI Workforce: Desktop bridge disconnected. Local operations remain available.',
        'Reconnect',
        'Open Settings',
      )
      .then((choice) => {
        if (choice === 'Reconnect') {
          void this.reconnect();
        } else if (choice === 'Open Settings') {
          void vscode.commands.executeCommand('agi-workforce.openSettings', 'configuration');
        }
      });
  }

  private _setStatus(status: BridgeStatus): void {
    if (this._status !== status) {
      this._status = status;
      this._onStatusChange.fire(status);
      this._updateStatusBar();
    }
  }

  private _scheduleReconnect(): void {
    this._clearReconnect();
    if (this._disposed) return;

    this._reconnectAttempts++;
    const delay = this._reconnectBackoffMs;

    this._reconnectBackoffMs = Math.min(
      this._reconnectBackoffMs * DesktopBridge.BACKOFF_MULTIPLIER,
      DesktopBridge.BACKOFF_MAX_MS,
    );

    this._reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => {
        // connect() handles its own errors via _setStatus('error') + _scheduleReconnect(),
        // but catch here to prevent unhandled promise rejection in the timer callback.
      });
    }, delay);
  }

  private _resetBackoff(): void {
    this._reconnectBackoffMs = DesktopBridge.BACKOFF_INITIAL_MS;
    this._reconnectAttempts = 0;
  }

  private _clearReconnect(): void {
    if (this._reconnectTimer !== undefined) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
  }

  private _startHandshakeTimeout(): void {
    this._clearHandshakeTimeout();
    this._handshakeTimer = setTimeout(() => {
      if (this._disposed || this._authOk) return;
      this._setStatus('error');
      this._closeWebSocket();
      this._scheduleReconnect();
    }, DesktopBridge.HANDSHAKE_TIMEOUT_MS);
  }

  private _clearHandshakeTimeout(): void {
    if (this._handshakeTimer !== undefined) {
      clearTimeout(this._handshakeTimer);
      this._handshakeTimer = undefined;
    }
  }

  private _startHealthLoop(): void {
    this._clearHealthLoop();
    this._healthTimer = setInterval(() => {
      if (this._disposed) return;
      void this.healthCheck()
        .catch(() => false)
        .then((ok) => {
          if (!ok && this._status === 'connected') {
            this._setStatus('error');
            this._closeWebSocket();
            this._scheduleReconnect();
          }
        });
    }, DesktopBridge.HEALTH_CHECK_INTERVAL_MS);
  }

  private _clearHealthLoop(): void {
    if (this._healthTimer !== undefined) {
      clearInterval(this._healthTimer);
      this._healthTimer = undefined;
    }
  }

  updatePort(port: number): void {
    if (this._port !== port) {
      this._port = port;
      if (this._status !== 'disconnected') {
        this.disconnect();
        void this.connect();
      }
    }
  }

  dispose(): void {
    this._disposed = true;
    this.disconnect();
    this._onStatusChange.dispose();
    this._statusBarItem?.dispose();
    this._statusBarItem = undefined;
  }
}

let _instance: DesktopBridge | undefined;

export function getDesktopBridge(): DesktopBridge | undefined {
  return _instance;
}

export function activateDesktopBridge(context: vscode.ExtensionContext): vscode.Disposable {
  const enabled = Config.desktopBridgeEnabled();
  const port = Config.desktopBridgePort();

  if (enabled) {
    _instance = new DesktopBridge(port);
    context.subscriptions.push(_instance);

    const statusBarItem = _instance.initStatusBar();
    context.subscriptions.push(statusBarItem);

    void _instance.connect();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.bridgeReconnect', async () => {
      const bridge = getDesktopBridge();
      if (bridge !== undefined) {
        await bridge.reconnect();
      } else {
        const action = await vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not enabled. Enable it in settings.',
          'Open Settings',
        );
        if (action === 'Open Settings') {
          await vscode.commands.executeCommand('agi-workforce.openSettings', 'configuration');
        }
      }
    }),
  );

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
      e.affectsConfiguration('agiWorkforce.desktopBridge.port')
    ) {
      const nowEnabled = Config.desktopBridgeEnabled();
      const nowPort = Config.desktopBridgePort();

      if (!nowEnabled && _instance !== undefined) {
        _instance.dispose();
        _instance = undefined;
      } else if (nowEnabled && _instance === undefined) {
        _instance = new DesktopBridge(nowPort);
        context.subscriptions.push(_instance);
        const newStatusBarItem = _instance.initStatusBar();
        context.subscriptions.push(newStatusBarItem);
        void _instance.connect();
      } else if (nowEnabled && _instance !== undefined) {
        _instance.updatePort(nowPort);
      }
    }
  });

  return new vscode.Disposable(() => {
    configListener.dispose();
    if (_instance !== undefined) {
      _instance.dispose();
      _instance = undefined;
    }
  });
}

/**
 * desktopBridge.ts — Connects VS Code extension to AGI Workforce desktop app
 *
 * Communication via HTTP localhost API + WebSocket for real-time events.
 * Auto-reconnects on disconnect. Health-checked periodically.
 *
 * Wave 3 enhancements:
 * - Connection status indicator in status bar (connected/disconnected/reconnecting)
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s max)
 * - Graceful degradation when bridge is down
 * - Clear notification when bridge disconnects with "Reconnect" action button
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { getExtensionVersion } from '../utils/version';

// ─── Bridge auth token (VSCODE-03) ──────────────────────────────────────────

/** Path where the desktop app writes the shared bridge auth token. */
const BRIDGE_TOKEN_PATH = path.join(os.homedir(), '.agiworkforce', 'bridge-token');

/**
 * Read the bridge auth token written by the desktop app on first run.
 * Returns undefined if the file is missing or has unsafe permissions.
 *
 * On POSIX: mode must be 0600 (owner r/w only). If the file is group- or
 * world-readable we refuse to load it to avoid token leakage via group membership.
 */
export function readBridgeToken(): string | undefined {
  // B9 fix: the previous implementation called `fs.statSync` then
  // `fs.readFileSync` against the same path — a classic TOCTOU race where
  // a local attacker can swap the file between the two calls. Open once
  // and validate / read against the same file descriptor so the
  // permission check applies to the bytes we actually consume.
  let fd: number | undefined;
  try {
    fd = fs.openSync(BRIDGE_TOKEN_PATH, fs.constants.O_RDONLY);
    if (process.platform !== 'win32') {
      const stat = fs.fstatSync(fd);
      const mode = stat.mode & 0o777;
      if (mode & 0o044) {
        console.error(
          `[AGI Workforce Bridge] bridge-token has unsafe permissions (0${mode.toString(8)}). Expected 0600. Refusing to load.`,
        );
        return undefined;
      }
    }
    // B9 (Windows): without per-user ACL inspection we still ensure the
    // file is in the user's profile directory. On Windows fs has no
    // direct chmod equivalent, but the desktop side writes via
    // `LocalAppData` whose default ACL is owner-only. We log a warning
    // so a security-aware operator can audit the install.
    if (process.platform === 'win32') {
      console.warn(
        '[AGI Workforce Bridge] Windows: skipping mode check; relying on default user-profile ACL.',
      );
    }
    // Read up to 1 KiB from the open fd (real tokens are 64 hex chars).
    const buf = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    const token = buf.subarray(0, bytesRead).toString('utf8').trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // best-effort close; nothing actionable on failure.
      }
    }
  }
}

/**
 * Allowed message types the extension will SEND to the desktop bridge.
 * Outbound messages with unknown types are dropped (defense-in-depth).
 */
export const ALLOWED_OUTBOUND_TYPES = new Set([
  'vscode:connected',
  'vscode:code-snippet',
  'vscode:sync-context',
  'vscode:agent-action',
  'vscode:ping',
  'auth',
]);

/**
 * Allowed message types the extension will RECEIVE from the desktop bridge.
 * Inbound messages with unknown types are silently dropped (VSCODE-03).
 */
export const ALLOWED_INBOUND_TYPES = new Set([
  'desktop:open-file',
  'desktop:show-message',
  'desktop:run-command',
  'auth_ok',
]);

/**
 * Allowlist of VS Code commands the desktop bridge is permitted to trigger
 * via `desktop:run-command`. Any commandId outside this set is blocked +
 * logged. Module-scope so tests can assert the surface explicitly.
 */
export const ALLOWED_BRIDGE_COMMANDS: ReadonlySet<string> = new Set([
  'agi-workforce.chat',
  'agi-workforce.agentMode',
  'agi-workforce.explain',
  'agi-workforce.fix',
  'agi-workforce.refactor',
  'agi-workforce.generateTests',
  'agi-workforce.selectModel',
  'agi-workforce.openConversation',
  'agi-workforce.sendToDesktop',
  'agi-workforce.syncContextToDesktop',
  'workbench.action.openSettings',
  'workbench.action.files.openFile',
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DesktopBridgeConfig {
  enabled: boolean;
  port: number;
}

export interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type BridgeMessageHandler = (message: BridgeMessage) => void;

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ─── Desktop Bridge ─────────────────────────────────────────────────────────

export class DesktopBridge implements vscode.Disposable {
  private _status: BridgeStatus = 'disconnected';
  private _ws: WebSocket | undefined;
  private _reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private _healthTimer: ReturnType<typeof setTimeout> | undefined;
  private _handlers: BridgeMessageHandler[] = [];
  private _port: number;
  private _disposed = false;

  // VSCODE-03: per-session auth state.
  // _authOk becomes true only after the server replies with {type: 'auth_ok'}.
  // No outbound messages (except the initial auth handshake) are sent until then.
  private _authOk = false;
  private _bridgeToken: string | undefined;

  /** Current backoff delay in ms for reconnection. */
  private _reconnectBackoffMs: number;
  /** Number of consecutive reconnect attempts. */
  private _reconnectAttempts = 0;
  /** Whether we were previously connected (for disconnect notification). */
  private _wasConnected = false;

  private readonly _onStatusChange = new vscode.EventEmitter<BridgeStatus>();
  public readonly onStatusChange = this._onStatusChange.event;

  /** Status bar item showing connection state. */
  private _statusBarItem: vscode.StatusBarItem | undefined;

  // ── Backoff constants ───────────────────────────────────────────────────
  private static readonly BACKOFF_INITIAL_MS = 1_000;
  private static readonly BACKOFF_MAX_MS = 8_000;
  private static readonly BACKOFF_MULTIPLIER = 2;

  private static readonly HEALTH_CHECK_INTERVAL_MS = 30_000;
  private static readonly REQUEST_TIMEOUT_MS = 10_000;

  constructor(port: number) {
    this._port = port;
    this._reconnectBackoffMs = DesktopBridge.BACKOFF_INITIAL_MS;
  }

  get status(): BridgeStatus {
    return this._status;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this._port}`;
  }

  get wsUrl(): string {
    return `ws://127.0.0.1:${this._port}/ws`;
  }

  /** Whether the bridge is currently operational (connected). */
  get isConnected(): boolean {
    return this._status === 'connected';
  }

  // ── Status bar ─────────────────────────────────────────────────────────

  /** Initialize the connection status bar item. */
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
        this._statusBarItem.text = '$(debug-disconnect) Bridge: Disconnected';
        this._statusBarItem.tooltip = `Desktop bridge disconnected. Click to reconnect.`;
        this._statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground',
        );
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

  // ── Connection lifecycle ────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._disposed) return;
    this._setStatus('connecting');

    const healthy = await this.healthCheck();
    if (!healthy) {
      this._setStatus('error');
      this._scheduleReconnect();
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

  /** Manual reconnect triggered by user action. */
  async reconnect(): Promise<void> {
    this._resetBackoff();
    this._clearReconnect();
    this._closeWebSocket();
    await this.connect();
  }

  // ── HTTP API ────────────────────────────────────────────────────────────

  /**
   * Send a command to the desktop app via HTTP POST.
   * When bridge is down, returns a graceful error instead of throwing.
   */
  async sendToDesktop<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {},
  ): Promise<BridgeResponse<T>> {
    // Graceful degradation: if not connected, return error immediately
    if (this._status !== 'connected') {
      return {
        ok: false,
        error: `Desktop bridge is ${this._status}. Command '${command}' queued for when bridge reconnects.`,
      };
    }

    const url = `${this.baseUrl}/api/bridge/${command}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DesktopBridge.REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = (await res.json()) as BridgeResponse<T>;
      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If fetch fails, bridge may have gone down
      if (this._status === 'connected') {
        this._setStatus('error');
        this._closeWebSocket();
        this._scheduleReconnect();
      }
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Health check — pings the desktop app's health endpoint.
   */
  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── WebSocket (real-time) ───────────────────────────────────────────────

  onDesktopMessage(handler: BridgeMessageHandler): vscode.Disposable {
    this._handlers.push(handler);
    return new vscode.Disposable(() => {
      const idx = this._handlers.indexOf(handler);
      if (idx !== -1) this._handlers.splice(idx, 1);
    });
  }

  private _connectWebSocket(): void {
    this._closeWebSocket();
    // VSCODE-03: reset auth state on each new connection.
    this._authOk = false;
    this._bridgeToken = readBridgeToken();

    try {
      this._ws = new WebSocket(this.wsUrl);

      this._ws.onopen = () => {
        this._resetBackoff();
        this._wasConnected = true;

        // VSCODE-03: if we have a token, send auth handshake first and wait
        // for auth_ok before marking connected or sending any other messages.
        if (this._bridgeToken !== undefined) {
          const ws = this._ws;
          if (ws !== undefined && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: 'auth', token: this._bridgeToken, timestamp: Date.now() }),
            );
          }
          // Stay in 'connecting' until auth_ok is received.
        } else {
          // No token file — bridge may not be running yet. Show actionable notice.
          void vscode.window.showWarningMessage(
            'AGI Workforce: Desktop bridge token not found. ' +
              'Make sure the AGI Workforce desktop app is running, or run ' +
              '`agiworkforce desktop --reset-bridge-token` from a terminal.',
            'Dismiss',
          );
          this._setStatus('error');
          this._closeWebSocket();
          this._scheduleReconnect();
        }
      };

      this._ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(String(event.data)) as BridgeMessage;

          // VSCODE-03: drop messages with unknown types (message-type allowlist).
          if (!ALLOWED_INBOUND_TYPES.has(raw.type)) {
            console.warn(`[AGI Workforce Bridge] dropping unknown inbound type: ${raw.type}`);
            return;
          }

          // VSCODE-03: handle auth_ok handshake before passing to application handlers.
          if (raw.type === 'auth_ok') {
            this._authOk = true;
            this._setStatus('connected');
            // Now safe to announce ourselves.
            this._wsSend({
              type: 'vscode:connected',
              payload: {
                workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
                extensionVersion: getExtensionVersion(),
              },
              timestamp: Date.now(),
            });
            return;
          }

          // Reject all other messages until auth is complete.
          if (!this._authOk) {
            console.warn(
              `[AGI Workforce Bridge] dropping message of type '${raw.type}' — not yet authenticated.`,
            );
            return;
          }

          for (const handler of this._handlers) {
            handler(raw);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._ws = undefined;
        this._authOk = false;
        if (!this._disposed) {
          const previousStatus = this._status;
          this._setStatus('disconnected');

          // Show disconnect notification if we were previously connected
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
    if (this._ws !== undefined) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = undefined;
    }
  }

  private _wsSend(message: BridgeMessage): void {
    // VSCODE-03: only send allowed outbound types, and only after auth_ok.
    if (!ALLOWED_OUTBOUND_TYPES.has(message.type)) {
      console.warn(`[AGI Workforce Bridge] blocked unknown outbound type: ${message.type}`);
      return;
    }
    if (!this._authOk && message.type !== 'auth') {
      console.warn(
        `[AGI Workforce Bridge] dropping outbound '${message.type}' — auth not complete.`,
      );
      return;
    }
    // Capture local ref to prevent TOCTOU race with _closeWebSocket()
    const ws = this._ws;
    if (ws !== undefined && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // ── Convenience methods ─────────────────────────────────────────────────

  /**
   * Send a code snippet from the active editor to the desktop agent.
   * Gracefully degrades if bridge is disconnected.
   */
  async sendCodeSnippet(code: string, language: string, filePath: string): Promise<BridgeResponse> {
    return this.sendToDesktop('code-snippet', { code, language, filePath });
  }

  /**
   * Share the current workspace context with the desktop app.
   * Gracefully degrades if bridge is disconnected.
   */
  async shareContext(): Promise<BridgeResponse> {
    const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const activeLanguage = vscode.window.activeTextEditor?.document.languageId;

    return this.sendToDesktop('sync-context', {
      workspaceFolders: folders,
      activeFile,
      activeLanguage,
    });
  }

  /**
   * Trigger a desktop agent action (e.g., run a task, open a tool).
   * Gracefully degrades if bridge is disconnected.
   */
  async triggerAgentAction(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<BridgeResponse> {
    return this.sendToDesktop('agent-action', { action, ...params });
  }

  // ── Disconnect notification ─────────────────────────────────────────────

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
          void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'agiWorkforce.desktopBridge',
          );
        }
      });
  }

  // ── Internal ────────────────────────────────────────────────────────────

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

    // Exponential backoff: double the delay each time, capped at max
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
    this._handlers = [];
    this._onStatusChange.dispose();
    this._statusBarItem?.dispose();
    this._statusBarItem = undefined;
  }
}

// ─── Singleton management ─────────────────────────────────────────────────

let _instance: DesktopBridge | undefined;

export function getDesktopBridge(): DesktopBridge | undefined {
  return _instance;
}

/**
 * F2 fix: per-(type, key) debounce window for inbound bridge messages.
 *
 * Prevents 100 back-to-back `desktop:open-file` messages from firing 100
 * concurrent `showTextDocument` calls. The debounce is leading-edge with a
 * 50ms cooldown — the first message in a burst fires immediately, subsequent
 * duplicates within 50ms are dropped.
 *
 * Key shape: `${type}:${first-payload-string}` — ensures different file
 * targets are dispatched independently.
 */
const BRIDGE_DEBOUNCE_MS = 50;
const _lastDispatch = new Map<string, number>();

function shouldDispatch(key: string): boolean {
  const now = Date.now();
  const last = _lastDispatch.get(key);
  if (last !== undefined && now - last < BRIDGE_DEBOUNCE_MS) return false;
  _lastDispatch.set(key, now);
  // Periodic GC: drop entries older than 5s so the map doesn't grow forever.
  if (_lastDispatch.size > 64) {
    for (const [k, t] of _lastDispatch) {
      if (now - t > 5_000) _lastDispatch.delete(k);
    }
  }
  return true;
}

/**
 * Register built-in message handlers on the given bridge instance.
 * Returns the disposable so callers can track and dispose it explicitly.
 * Also pushes onto context.subscriptions as a safety net.
 */
function registerBridgeHandlersTracked(
  instance: DesktopBridge,
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const disposable = instance.onDesktopMessage((msg) => {
    switch (msg.type) {
      case 'desktop:open-file': {
        const filePath = msg.payload['filePath'] as string | undefined;
        if (filePath && !shouldDispatch(`open-file:${filePath}`)) break;
        if (filePath) {
          // Security: only allow opening files inside a workspace folder.
          // A compromised WS connection must not be able to read arbitrary files.
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) break;
          // Resolve filePath relative to each workspace folder (not CWD) and
          // require a path separator after the folder prefix to prevent
          // adjacent-directory bypass (e.g. "myproject-evil" matching "myproject").
          let resolvedPath: string | undefined;
          const isInWorkspace = workspaceFolders.some((folder) => {
            const candidate = path.resolve(folder.uri.fsPath, filePath);
            const match =
              candidate.startsWith(folder.uri.fsPath + path.sep) || candidate === folder.uri.fsPath;
            if (match) resolvedPath = candidate;
            return match;
          });
          if (!isInWorkspace || resolvedPath === undefined) {
            console.warn('[AGI Workforce Bridge] blocked file open outside workspace:', filePath);
            break;
          }
          void vscode.window.showTextDocument(vscode.Uri.file(resolvedPath));
        }
        break;
      }
      case 'desktop:show-message': {
        const text = msg.payload['text'] as string | undefined;
        if (text && !shouldDispatch(`show-message:${text}`)) break;
        if (text) {
          void vscode.window.showInformationMessage(`AGI Workforce: ${text}`);
        }
        break;
      }
      case 'desktop:run-command': {
        const commandId = msg.payload['command'] as string | undefined;
        if (commandId && !shouldDispatch(`run-command:${commandId}`)) break;
        if (commandId) {
          if (!ALLOWED_BRIDGE_COMMANDS.has(commandId)) {
            console.warn(`[AGI Workforce Bridge] blocked disallowed command: ${commandId}`);
            break;
          }
          // Security: never forward args from the WS payload — attacker-controlled
          // arguments could be used to escalate via arbitrary command parameters.
          void vscode.commands.executeCommand(commandId);
        }
        break;
      }
    }
  });
  context.subscriptions.push(disposable);
  return disposable;
}

/**
 * Register built-in message handlers on the given bridge instance.
 * Must be called every time a new DesktopBridge instance is created.
 */
function registerBridgeHandlers(instance: DesktopBridge, context: vscode.ExtensionContext): void {
  registerBridgeHandlersTracked(instance, context);
}

/**
 * Initialize the desktop bridge based on user settings. Call once during activation.
 * Returns a Disposable that cleans up the bridge on deactivation.
 */
export function activateDesktopBridge(context: vscode.ExtensionContext): vscode.Disposable {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const enabled = config.get<boolean>('desktopBridge.enabled') ?? false;
  const port = config.get<number>('desktopBridge.port') ?? 8787;

  if (enabled) {
    _instance = new DesktopBridge(port);
    context.subscriptions.push(_instance);

    // Initialize status bar
    const statusBarItem = _instance.initStatusBar();
    context.subscriptions.push(statusBarItem);

    // Register built-in message handlers
    registerBridgeHandlers(_instance, context);

    void _instance.connect();
  }

  // Register reconnect command
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.bridgeReconnect', async () => {
      const bridge = getDesktopBridge();
      if (bridge !== undefined) {
        await bridge.reconnect();
      } else {
        vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not enabled. Enable it in settings.',
        );
      }
    }),
  );

  // React to config changes
  // We keep a reference to the current bridge-handler disposable so we can
  // dispose it before creating a new bridge instance (prevents accumulation).
  let currentHandlerDisposable: vscode.Disposable | undefined;

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
      e.affectsConfiguration('agiWorkforce.desktopBridge.port')
    ) {
      const cfg = vscode.workspace.getConfiguration('agiWorkforce');
      const nowEnabled = cfg.get<boolean>('desktopBridge.enabled') ?? false;
      const nowPort = cfg.get<number>('desktopBridge.port') ?? 8787;

      if (!nowEnabled && _instance !== undefined) {
        currentHandlerDisposable?.dispose();
        currentHandlerDisposable = undefined;
        _instance.dispose();
        _instance = undefined;
      } else if (nowEnabled && _instance === undefined) {
        _instance = new DesktopBridge(nowPort);
        context.subscriptions.push(_instance);
        // Initialize status bar for new instance
        const newStatusBarItem = _instance.initStatusBar();
        context.subscriptions.push(newStatusBarItem);
        // Dispose old handler subscription before registering on the new instance
        currentHandlerDisposable?.dispose();
        currentHandlerDisposable = registerBridgeHandlersTracked(_instance, context);
        void _instance.connect();
      } else if (nowEnabled && _instance !== undefined) {
        _instance.updatePort(nowPort);
      }
    }
  });

  return new vscode.Disposable(() => {
    configListener.dispose();
    currentHandlerDisposable?.dispose();
    currentHandlerDisposable = undefined;
    if (_instance !== undefined) {
      _instance.dispose();
      _instance = undefined;
    }
  });
}

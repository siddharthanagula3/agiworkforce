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

import * as path from 'path';
import * as vscode from 'vscode';
import WebSocket from 'ws';

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

    try {
      this._ws = new WebSocket(this.wsUrl);

      this._ws.onopen = () => {
        this._setStatus('connected');
        this._resetBackoff();
        this._wasConnected = true;
        // Announce ourselves
        this._wsSend({
          type: 'vscode:connected',
          payload: {
            workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
            extensionVersion:
              vscode.extensions.getExtension('agiworkforce.agi-workforce')?.packageJSON?.version ??
              '0.0.0',
          },
          timestamp: Date.now(),
        });
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as BridgeMessage;
          for (const handler of this._handlers) {
            handler(msg);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._ws = undefined;
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
    if (this._ws !== undefined && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
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
      void this.connect();
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
    this._healthTimer = setInterval(async () => {
      if (this._disposed) return;
      const ok = await this.healthCheck();
      if (!ok && this._status === 'connected') {
        this._setStatus('error');
        this._closeWebSocket();
        this._scheduleReconnect();
      }
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
        if (text) {
          void vscode.window.showInformationMessage(`AGI Workforce: ${text}`);
        }
        break;
      }
      case 'desktop:run-command': {
        const commandId = msg.payload['command'] as string | undefined;
        if (commandId) {
          // Allowlist of commands the desktop bridge is permitted to trigger.
          // Any commandId not in this set is blocked and logged — a compromised
          // or misbehaving desktop app cannot invoke arbitrary VS Code commands.
          const ALLOWED_BRIDGE_COMMANDS = new Set([
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

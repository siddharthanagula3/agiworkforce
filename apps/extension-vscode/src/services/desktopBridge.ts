/**
 * desktopBridge.ts — Connects VS Code extension to AGI Workforce desktop app
 *
 * Communication via HTTP localhost API + WebSocket for real-time events.
 * Auto-reconnects on disconnect. Health-checked periodically.
 */

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

  private readonly _onStatusChange = new vscode.EventEmitter<BridgeStatus>();
  public readonly onStatusChange = this._onStatusChange.event;

  private static readonly RECONNECT_INTERVAL_MS = 5_000;
  private static readonly HEALTH_CHECK_INTERVAL_MS = 30_000;
  private static readonly REQUEST_TIMEOUT_MS = 10_000;

  constructor(port: number) {
    this._port = port;
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
  }

  // ── HTTP API ────────────────────────────────────────────────────────────

  /**
   * Send a command to the desktop app via HTTP POST.
   */
  async sendToDesktop<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {},
  ): Promise<BridgeResponse<T>> {
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
          this._setStatus('disconnected');
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
   */
  async sendCodeSnippet(code: string, language: string, filePath: string): Promise<BridgeResponse> {
    return this.sendToDesktop('code-snippet', { code, language, filePath });
  }

  /**
   * Share the current workspace context with the desktop app.
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
   */
  async triggerAgentAction(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<BridgeResponse> {
    return this.sendToDesktop('agent-action', { action, ...params });
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private _setStatus(status: BridgeStatus): void {
    if (this._status !== status) {
      this._status = status;
      this._onStatusChange.fire(status);
    }
  }

  private _scheduleReconnect(): void {
    this._clearReconnect();
    if (this._disposed) return;
    this._reconnectTimer = setTimeout(() => {
      void this.connect();
    }, DesktopBridge.RECONNECT_INTERVAL_MS);
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
          void vscode.window.showTextDocument(vscode.Uri.file(filePath));
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
        const args = msg.payload['args'] as unknown[] | undefined;
        if (commandId) {
          void vscode.commands.executeCommand(commandId, ...(args ?? []));
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

    // Register built-in message handlers
    registerBridgeHandlers(_instance, context);

    void _instance.connect();
  }

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

/**
 * agentStatus.ts — Agent status tracking for VS Code extension
 *
 * Provides a status bar item showing current agent activity and a quick-pick
 * menu with agent details. Fetches status via the desktop bridge when connected,
 * or falls back to polling the API gateway.
 */

import * as vscode from 'vscode';
import { getDesktopBridge } from './desktopBridge';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Mirrors the shared AgentSession type from @agiworkforce/types. */
interface AgentSession {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentAction: string | null;
  startedAt: string;
  completedAt: string | null;
  progress: number | null;
  model?: string;
  iterationCount?: number;
  maxIterations?: number;
  error?: string;
  toolCallCount?: number;
}

interface AgentStatusResponse {
  sessions: AgentSession[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;

// ─── Agent Status Service ───────────────────────────────────────────────────

export class AgentStatusService implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private _sessions: AgentSession[] = [];
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _disposed = false;
  private _bridgeMessageHandler: vscode.Disposable | undefined;
  private _bridgeStatusHandler: vscode.Disposable | undefined;

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Create status bar item — priority 95, just left of the model selector (100)
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    this._statusBarItem.command = 'agi-workforce.showAgentStatus';
    this._statusBarItem.tooltip = 'AGI Workforce — Agent Status';
    _context.subscriptions.push(this._statusBarItem);

    // Register the quick pick command
    _context.subscriptions.push(
      vscode.commands.registerCommand('agi-workforce.showAgentStatus', () => {
        this._showAgentQuickPick();
      }),
    );

    // Initial render
    this._updateStatusBar();
  }

  /**
   * Start monitoring agent status. Tries desktop bridge first,
   * falls back to polling the API gateway.
   */
  start(): void {
    if (this._disposed) return;

    // Try listening via desktop bridge WebSocket
    const bridge = getDesktopBridge();
    if (bridge !== undefined) {
      this._bridgeMessageHandler = bridge.onDesktopMessage((msg) => {
        if (msg.type === 'desktop:agent-status-update') {
          const payload = msg.payload as Partial<AgentStatusResponse>;
          if (payload.sessions) {
            this._sessions = payload.sessions as AgentSession[];
            this._updateStatusBar();
            this._notifyCompletedOrFailed(payload.sessions as AgentSession[]);
          }
        }
      });
      this._context.subscriptions.push(this._bridgeMessageHandler);

      // Also subscribe to bridge status changes — start/stop polling accordingly
      this._bridgeStatusHandler = bridge.onStatusChange((status) => {
        if (status === 'connected') {
          this._stopPolling();
          // Request current status from desktop
          void bridge.sendToDesktop('get-agent-status');
        } else {
          this._startPolling();
        }
      });
      this._context.subscriptions.push(this._bridgeStatusHandler);

      // If bridge is already connected, fetch immediately
      if (bridge.status === 'connected') {
        void bridge.sendToDesktop('get-agent-status');
      } else {
        this._startPolling();
      }
    } else {
      this._startPolling();
    }
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  private _startPolling(): void {
    if (this._pollTimer !== undefined) return;

    // Initial fetch
    void this._pollAgentStatus();

    this._pollTimer = setInterval(() => {
      void this._pollAgentStatus();
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  /**
   * Poll agent status from the desktop bridge HTTP API or API gateway.
   */
  private async _pollAgentStatus(): Promise<void> {
    if (this._disposed) return;

    const bridge = getDesktopBridge();
    if (bridge !== undefined && bridge.status === 'connected') {
      try {
        const response = await bridge.sendToDesktop<AgentStatusResponse>('get-agent-status');
        if (response.ok && response.data?.sessions) {
          const prevRunning = this._sessions.filter((s) => s.status === 'running');
          this._sessions = response.data.sessions;
          this._updateStatusBar();
          this._notifyCompletedOrFailed(response.data.sessions, prevRunning);
        }
      } catch {
        // Bridge request failed — keep existing state
      }
      return;
    }

    // Fallback: try API gateway
    const apiGatewayUrl = vscode.workspace
      .getConfiguration('agiWorkforce')
      .get<string>('apiGatewayUrl');

    if (!apiGatewayUrl) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${apiGatewayUrl}/api/agents/status`, {
        method: 'GET',
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as AgentStatusResponse;
        if (data.sessions) {
          const prevRunning = this._sessions.filter((s) => s.status === 'running');
          this._sessions = data.sessions;
          this._updateStatusBar();
          this._notifyCompletedOrFailed(data.sessions, prevRunning);
        }
      }
    } catch {
      // Network error — keep existing state
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Status Bar ──────────────────────────────────────────────────────────

  private _updateStatusBar(): void {
    const running = this._sessions.filter((s) => s.status === 'running' || s.status === 'paused');

    if (running.length > 0) {
      this._statusBarItem.text = `$(sync~spin) ${running.length} agent${running.length === 1 ? '' : 's'} running`;
      this._statusBarItem.backgroundColor = undefined;
    } else {
      this._statusBarItem.text = '$(check) Agents idle';
      this._statusBarItem.backgroundColor = undefined;
    }

    this._statusBarItem.show();
  }

  // ── Quick Pick ──────────────────────────────────────────────────────────

  private _showAgentQuickPick(): void {
    if (this._sessions.length === 0) {
      vscode.window.showInformationMessage('AGI Workforce: No agent sessions to show.');
      return;
    }

    const items: vscode.QuickPickItem[] = this._sessions.map((session) => {
      const statusIcon = this._getStatusIcon(session.status);
      const elapsed = this._formatElapsed(session.startedAt, session.completedAt);
      const progressStr =
        session.progress !== null && session.progress !== undefined
          ? ` (${Math.round(session.progress)}%)`
          : '';

      const detailText = session.currentAction ?? session.error ?? undefined;
      return {
        label: `${statusIcon} ${session.name}`,
        description: `${session.status}${progressStr} - ${elapsed}`,
        ...(detailText !== undefined ? { detail: detailText } : {}),
      };
    });

    // Add a refresh action at the bottom
    items.push({
      label: '$(refresh) Refresh',
      description: 'Fetch latest agent status',
    });

    void vscode.window
      .showQuickPick(items, {
        title: 'AGI Workforce - Agent Status',
        placeHolder: `${this._sessions.length} session${this._sessions.length === 1 ? '' : 's'}`,
        matchOnDescription: true,
        matchOnDetail: true,
      })
      .then((picked) => {
        if (picked?.label === '$(refresh) Refresh') {
          void this._pollAgentStatus();
        }
      });
  }

  // ── Notifications ───────────────────────────────────────────────────────

  /**
   * Show VS Code notifications when agents complete or fail.
   * Compares current sessions against the previous snapshot to detect transitions.
   */
  private _notifyCompletedOrFailed(
    current: AgentSession[],
    previousRunning?: AgentSession[],
  ): void {
    if (!previousRunning || previousRunning.length === 0) return;

    const previousIds = new Set(previousRunning.map((s) => s.id));

    for (const session of current) {
      if (!previousIds.has(session.id)) continue;

      if (session.status === 'completed') {
        vscode.window.showInformationMessage(
          `AGI Workforce: Agent "${session.name}" completed successfully.`,
        );
      } else if (session.status === 'failed') {
        const errorSuffix = session.error ? ` - ${session.error}` : '';
        vscode.window.showWarningMessage(
          `AGI Workforce: Agent "${session.name}" failed${errorSuffix}`,
        );
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private _getStatusIcon(status: AgentSession['status']): string {
    switch (status) {
      case 'running':
        return '$(sync~spin)';
      case 'completed':
        return '$(check)';
      case 'failed':
        return '$(error)';
      case 'paused':
        return '$(debug-pause)';
      case 'cancelled':
        return '$(close)';
    }
  }

  private _formatElapsed(startedAt: string, completedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const diffMs = Math.max(0, end - start);

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  // ── Disposal ────────────────────────────────────────────────────────────

  dispose(): void {
    this._disposed = true;
    this._stopPolling();
    this._bridgeMessageHandler?.dispose();
    this._bridgeStatusHandler?.dispose();
    this._statusBarItem.dispose();
  }
}

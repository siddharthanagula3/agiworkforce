/**
 * modelMetrics.ts — Model performance metrics tracking
 *
 * Singleton that tracks per-model request count, average latency,
 * total tokens, and estimated cost. Persisted in globalState.
 * Also provides a webview panel for the dashboard.
 */

import * as vscode from 'vscode';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelMetricsEntry {
  model: string;
  requestCount: number;
  totalLatencyMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

// ─── Rough cost estimates (per 1M tokens) ──────────────────────────────────

const COST_PER_MILLION: Record<string, number> = {
  'claude-opus-4.6': 75.0,
  'claude-sonnet-4.6': 15.0,
  'claude-haiku-4.5': 1.0,
  'gpt-5-pro': 60.0,
  'gpt-5.2': 10.0,
  'gpt-5-nano': 0.5,
  'gemini-3-pro-preview': 7.0,
  'gemini-3-flash-preview': 0.3,
  'deepseek-r1': 8.0,
  'deepseek-chat': 2.0,
  'sonar-pro': 5.0,
  'grok-4': 10.0,
};

function estimateCost(model: string, tokens: number): number {
  const rate = COST_PER_MILLION[model] ?? 5.0;
  return (tokens / 1_000_000) * rate;
}

// ─── Metrics singleton ────────────────────────────────────────────────────────

const STORAGE_KEY = 'agiWorkforce.modelMetrics';

class ModelMetrics {
  private _data = new Map<string, ModelMetricsEntry>();
  private _context?: vscode.ExtensionContext;

  init(context: vscode.ExtensionContext): void {
    this._context = context;
    const stored = context.globalState.get<Record<string, ModelMetricsEntry>>(STORAGE_KEY);
    if (stored !== undefined) {
      for (const [key, value] of Object.entries(stored)) {
        this._data.set(key, value);
      }
    }
  }

  recordRequest(model: string, latencyMs: number, tokens?: number): void {
    const existing = this._data.get(model) ?? {
      model,
      requestCount: 0,
      totalLatencyMs: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };

    existing.requestCount += 1;
    existing.totalLatencyMs += latencyMs;
    if (tokens !== undefined) {
      existing.totalTokens += tokens;
      existing.estimatedCostUsd += estimateCost(model, tokens);
    }

    this._data.set(model, existing);
    this._persist();
  }

  getEntries(): ModelMetricsEntry[] {
    return Array.from(this._data.values()).sort((a, b) => b.requestCount - a.requestCount);
  }

  reset(): void {
    this._data.clear();
    this._persist();
  }

  private _persist(): void {
    if (this._context === undefined) return;
    const obj: Record<string, ModelMetricsEntry> = {};
    for (const [key, value] of this._data) {
      obj[key] = value;
    }
    void this._context.globalState.update(STORAGE_KEY, obj);
  }
}

let _instance: ModelMetrics | undefined;

export function getModelMetrics(): ModelMetrics {
  if (_instance === undefined) {
    _instance = new ModelMetrics();
  }
  return _instance;
}

export function initModelMetrics(context: vscode.ExtensionContext): void {
  getModelMetrics().init(context);
}

// ─── Dashboard webview panel ──────────────────────────────────────────────────

export class ModelMetricsPanel {
  public static currentPanel: ModelMetricsPanel | undefined;
  private static readonly viewType = 'agiWorkforce.modelDashboard';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    getModelMetrics().init(context);

    if (ModelMetricsPanel.currentPanel !== undefined) {
      ModelMetricsPanel.currentPanel.panel.reveal();
      ModelMetricsPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ModelMetricsPanel.viewType,
      'Model Performance Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: false },
    );

    ModelMetricsPanel.currentPanel = new ModelMetricsPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string }) => {
        if (msg.type === 'reset') {
          getModelMetrics().reset();
          this.update();
          vscode.window.showInformationMessage('AGI Workforce: Model metrics reset.');
        } else if (msg.type === 'refresh') {
          this.update();
        }
      },
      null,
      this.disposables,
    );
  }

  private update(): void {
    this.panel.webview.html = this.getHtml();
  }

  private dispose(): void {
    ModelMetricsPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private getHtml(): string {
    const entries = getModelMetrics().getEntries();
    const nonce = getNonce();

    const rows =
      entries.length > 0
        ? entries
            .map((e) => {
              const avgLatency =
                e.requestCount > 0 ? Math.round(e.totalLatencyMs / e.requestCount) : 0;
              return `<tr>
            <td>${escapeHtml(e.model)}</td>
            <td>${e.requestCount}</td>
            <td>${avgLatency}ms</td>
            <td>${e.totalTokens.toLocaleString()}</td>
            <td>$${e.estimatedCostUsd.toFixed(4)}</td>
          </tr>`;
            })
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--vscode-descriptionForeground)">No requests recorded yet. Start chatting to see metrics.</td></tr>';

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Model Performance Dashboard</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
    }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .actions button {
      padding: 4px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .actions button:hover { background: var(--vscode-button-hoverBackground); }
    .actions button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .actions button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
    th { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); }
    td { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    tr:hover { background: var(--vscode-list-hoverBackground); }
  </style>
</head>
<body>
  <h1>Model Performance Dashboard</h1>
  <div class="actions">
    <button id="refreshBtn">Refresh</button>
    <button id="resetBtn" class="secondary">Reset Metrics</button>
  </div>
  <table>
    <thead>
      <tr><th>Model</th><th>Requests</th><th>Avg Latency</th><th>Total Tokens</th><th>Est. Cost</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('resetBtn').addEventListener('click', () => vscode.postMessage({ type: 'reset' }));
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

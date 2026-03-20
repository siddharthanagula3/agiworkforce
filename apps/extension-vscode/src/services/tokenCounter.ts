/**
 * tokenCounter.ts -- Session-level token usage tracking with status bar display
 *
 * Tracks approximate token usage per session and shows a running total
 * in the VS Code status bar with color-coded budget awareness.
 * Resets on extension reload.
 */

import * as vscode from 'vscode';

// ─── Context window limits per model (tokens) ───────────────────────────────

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4.6': 1_000_000,
  'claude-sonnet-4.6': 200_000,
  'claude-haiku-4.5': 200_000,
  'gpt-5-pro': 256_000,
  'gpt-5.4': 128_000,
  'gpt-5.4-nano': 128_000,
  'gemini-3-pro-preview': 2_000_000,
  'gemini-3-flash-preview': 1_000_000,
  'deepseek-r1': 128_000,
  'deepseek-chat': 128_000,
  'sonar-pro': 128_000,
  'grok-4': 128_000,
  'auto-balanced': 200_000,
  'auto-economy': 128_000,
  'auto-premium': 1_000_000,
};

const DEFAULT_CONTEXT_LIMIT = 128_000;

// ─── Rough cost estimates (per 1M tokens, input/output blended) ─────────────

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-opus-4.6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4.6': { input: 3.0, output: 15.0 },
  'claude-haiku-4.5': { input: 0.25, output: 1.25 },
  'gpt-5-pro': { input: 10.0, output: 60.0 },
  'gpt-5.4': { input: 2.5, output: 10.0 },
  'gpt-5.4-nano': { input: 0.1, output: 0.5 },
  'gemini-3-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3-flash-preview': { input: 0.075, output: 0.3 },
  'deepseek-r1': { input: 4.0, output: 16.0 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'sonar-pro': { input: 3.0, output: 15.0 },
  'grok-4': { input: 3.0, output: 15.0 },
};

export class TokenCounter implements vscode.Disposable {
  private _promptTokens = 0;
  private _completionTokens = 0;
  private _requestCount = 0;
  private _estimatedCostUsd = 0;
  private readonly _statusBarItem: vscode.StatusBarItem;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
    this._statusBarItem.command = 'agi-workforce.showTokenBreakdown';
    this._updateDisplay();
    this._statusBarItem.show();
  }

  get totalTokens(): number {
    return this._promptTokens + this._completionTokens;
  }

  get promptTokens(): number {
    return this._promptTokens;
  }

  get completionTokens(): number {
    return this._completionTokens;
  }

  get requestCount(): number {
    return this._requestCount;
  }

  get estimatedCostUsd(): number {
    return this._estimatedCostUsd;
  }

  /**
   * Record token usage from a completion request.
   * If exact counts are not available, estimates from character count.
   */
  addUsage(
    promptTokens?: number,
    completionTokens?: number,
    promptChars?: number,
    completionChars?: number,
  ): void {
    const promptDelta = promptTokens ?? Math.ceil((promptChars ?? 0) / 4);
    const completionDelta = completionTokens ?? Math.ceil((completionChars ?? 0) / 4);

    this._promptTokens += promptDelta;
    this._completionTokens += completionDelta;
    this._requestCount += 1;

    // Estimate cost based on current model
    const model = this._getCurrentModel();
    const rates = COST_PER_MILLION[model];
    if (rates !== undefined) {
      this._estimatedCostUsd +=
        (promptDelta / 1_000_000) * rates.input + (completionDelta / 1_000_000) * rates.output;
    } else {
      // Fallback blended rate
      this._estimatedCostUsd += ((promptDelta + completionDelta) / 1_000_000) * 5.0;
    }

    this._updateDisplay();
  }

  reset(): void {
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._requestCount = 0;
    this._estimatedCostUsd = 0;
    this._updateDisplay();
  }

  /** Re-render the status bar (e.g. when the model changes and the context limit differs). */
  refreshDisplay(): void {
    this._updateDisplay();
  }

  private _getCurrentModel(): string {
    return (
      vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? 'auto-balanced'
    );
  }

  private _getContextLimit(): number {
    const model = this._getCurrentModel();
    return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
  }

  private _getUsagePercent(): number {
    const limit = this._getContextLimit();
    if (limit === 0) return 0;
    return (this.totalTokens / limit) * 100;
  }

  private _updateDisplay(): void {
    const total = this.totalTokens;
    const limit = this._getContextLimit();
    const pct = this._getUsagePercent();

    // Format as "Tokens: X/Y"
    this._statusBarItem.text = `$(pulse) Tokens: ${formatTokenCount(total)}/${formatTokenCount(limit)}`;

    // Color coding based on usage percentage
    if (pct >= 80) {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (pct >= 50) {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
    } else {
      this._statusBarItem.backgroundColor = undefined;
    }

    this._statusBarItem.tooltip =
      `AGI Workforce -- Session Token Usage\n` +
      `Model: ${this._getCurrentModel()}\n` +
      `Usage: ${formatTokenCount(total)} / ${formatTokenCount(limit)} (${pct.toFixed(1)}%)\n` +
      `Prompt: ${formatTokenCount(this._promptTokens)}\n` +
      `Completion: ${formatTokenCount(this._completionTokens)}\n` +
      `Requests: ${this._requestCount}\n` +
      `Est. Cost: $${this._estimatedCostUsd.toFixed(4)}\n\n` +
      `Click for detailed breakdown`;
  }

  dispose(): void {
    this._statusBarItem.dispose();
  }
}

function formatTokenCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: TokenCounter | undefined;

export function getTokenCounter(): TokenCounter {
  if (_instance === undefined) {
    _instance = new TokenCounter();
  }
  return _instance;
}

export function activateTokenCounter(context: vscode.ExtensionContext): void {
  const counter = getTokenCounter();
  context.subscriptions.push(counter);

  // Reset command
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.resetTokenCounter', () => {
      counter.reset();
      vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
    }),
  );

  // Detailed breakdown command (click on status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.showTokenBreakdown', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: `$(arrow-up) Input Tokens`,
          description: formatTokenCount(counter.promptTokens),
          detail: 'Tokens sent to the model (prompts, context, system messages)',
        },
        {
          label: `$(arrow-down) Output Tokens`,
          description: formatTokenCount(counter.completionTokens),
          detail: 'Tokens generated by the model (completions)',
        },
        {
          label: `$(graph) Total Tokens`,
          description: formatTokenCount(counter.totalTokens),
          detail: 'Combined input + output token usage this session',
        },
        {
          label: `$(credit-card) Estimated Cost`,
          description: `$${counter.estimatedCostUsd.toFixed(4)}`,
          detail: 'Approximate cost based on model pricing',
        },
        {
          label: `$(request-changes) Requests`,
          description: `${counter.requestCount}`,
          detail: 'Number of API calls made this session',
        },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(trash) Reset Counter',
          description: 'Clear all session metrics',
        },
      ];

      const picked = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce -- Token Usage Breakdown',
        placeHolder: 'Session token usage details',
      });

      if (picked?.label.includes('Reset Counter')) {
        counter.reset();
        vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
      }
    }),
  );

  // Re-render the status bar when the model changes (context limit changes)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agiWorkforce.model')) {
        // Re-render with new model's context limit
        counter.refreshDisplay();
      }
    }),
  );
}

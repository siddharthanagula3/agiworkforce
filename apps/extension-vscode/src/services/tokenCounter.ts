/**
 * tokenCounter.ts -- Session-level token usage tracking with status bar display
 *
 * Tracks approximate token usage per session and shows a running total
 * in the VS Code status bar with color-coded budget awareness.
 * Resets on extension reload.
 */

import * as vscode from 'vscode';
import {
  MODEL_CONTEXT_LIMITS,
  DEFAULT_CONTEXT_LIMIT,
  MODEL_COST_RATES,
  DEFAULT_BLENDED_RATE,
  normalizeConfiguredModelId,
} from './modelConstants';

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
    const rates = MODEL_COST_RATES[model];
    if (rates !== undefined) {
      this._estimatedCostUsd +=
        (promptDelta / 1_000_000) * rates.input + (completionDelta / 1_000_000) * rates.output;
    } else {
      // Fallback blended rate
      this._estimatedCostUsd +=
        ((promptDelta + completionDelta) / 1_000_000) * DEFAULT_BLENDED_RATE;
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
    return normalizeConfiguredModelId(
      vscode.workspace.getConfiguration('agiWorkforce').get<string>('model'),
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

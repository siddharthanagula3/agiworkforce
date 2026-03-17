/**
 * tokenCounter.ts -- Session-level token usage tracking with status bar display
 *
 * Tracks approximate token usage per session and shows a running total
 * in the VS Code status bar. Resets on extension reload.
 */

import * as vscode from 'vscode';

export class TokenCounter implements vscode.Disposable {
  private _promptTokens = 0;
  private _completionTokens = 0;
  private _requestCount = 0;
  private readonly _statusBarItem: vscode.StatusBarItem;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
    this._statusBarItem.tooltip = 'AGI Workforce -- Session token usage (click to reset)';
    this._statusBarItem.command = 'agi-workforce.resetTokenCounter';
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
    // Use exact counts when available, otherwise estimate (~4 chars per token)
    this._promptTokens += promptTokens ?? Math.ceil((promptChars ?? 0) / 4);
    this._completionTokens += completionTokens ?? Math.ceil((completionChars ?? 0) / 4);
    this._requestCount += 1;
    this._updateDisplay();
  }

  reset(): void {
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._requestCount = 0;
    this._updateDisplay();
  }

  private _updateDisplay(): void {
    const total = this.totalTokens;
    if (total === 0) {
      this._statusBarItem.text = '$(pulse) 0 tokens';
    } else {
      this._statusBarItem.text = `$(pulse) ${formatTokenCount(total)} tokens`;
    }

    this._statusBarItem.tooltip =
      `AGI Workforce -- Session Token Usage\n` +
      `Prompt: ${formatTokenCount(this._promptTokens)}\n` +
      `Completion: ${formatTokenCount(this._completionTokens)}\n` +
      `Requests: ${this._requestCount}\n\n` +
      `Click to reset counter`;
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

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.resetTokenCounter', () => {
      counter.reset();
      vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
    }),
  );
}

import * as vscode from 'vscode';
import { MICROUSD_PER_USD, creditsFromMicrousd } from '@agiworkforce/types';
import { MODEL_COST_RATES } from '../features/model-picker/modelConstants';
import { isAutoRoutingModel } from '../integrations/routingTask';
import { fetchBilledCredits, onDidCompleteManagedRequest } from '../utils/api';
import { t, tPlural } from '../l10n';
import { formatCreditAmount, formatUnsettledRequests } from './usagePresentation';

const MAX_QUEUED_BILLING_REQUESTS = 200;
const BILLING_SETTLEMENT_BATCH = 10;

export class TokenCounter implements vscode.Disposable {
  private _promptTokens = 0;
  private _completionTokens = 0;
  private _requestCount = 0;
  private _unpricedRequestCount = 0;
  private _estimatedCostUsd = 0;
  private _billedCredits = 0;
  private _billedRequests = 0;
  private _unsettledRequests = 0;
  private _queuedBillingRequests: string[] = [];
  private readonly _statusBarItem: vscode.StatusBarItem;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
    this._statusBarItem.command = 'agi-workforce.showTokenBreakdown';
    this._updateDisplay();
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

  get unpricedRequestCount(): number {
    return this._unpricedRequestCount;
  }

  get estimatedCostUsd(): number {
    return this._estimatedCostUsd;
  }

  get estimatedCredits(): number {
    return creditsFromMicrousd(this._estimatedCostUsd * MICROUSD_PER_USD);
  }

  get billedCredits(): number {
    return this._billedCredits;
  }

  get billedRequests(): number {
    return this._billedRequests;
  }

  get unsettledRequests(): number {
    return this._unsettledRequests + this._queuedBillingRequests.length;
  }

  recordBilledRequest(credits: number | null): void {
    if (credits === null) {
      this._unsettledRequests += 1;
    } else {
      this._billedCredits += credits;
      this._billedRequests += 1;
    }
    this._updateDisplay();
  }

  queueBillingRequest(requestId: string): void {
    this._queuedBillingRequests.push(requestId);
    const overflow = this._queuedBillingRequests.length - MAX_QUEUED_BILLING_REQUESTS;
    if (overflow > 0) {
      this._queuedBillingRequests.splice(0, overflow);
      this._unsettledRequests += overflow;
    }
    this._updateDisplay();
  }

  async settleBillingRequests(
    secrets: vscode.SecretStorage,
    requestIds: readonly string[],
  ): Promise<(number | null)[]> {
    const results: (number | null)[] = [];
    for (let start = 0; start < requestIds.length; start += BILLING_SETTLEMENT_BATCH) {
      const batch = requestIds.slice(start, start + BILLING_SETTLEMENT_BATCH);
      const settled = await Promise.all(
        batch.map((requestId) => fetchBilledCredits(secrets, requestId)),
      );
      settled.forEach((credits) => this.recordBilledRequest(credits));
      results.push(...settled);
    }
    return results;
  }

  async settleQueuedBilling(secrets: vscode.SecretStorage): Promise<void> {
    await this.settleBillingRequests(secrets, this._queuedBillingRequests.splice(0));
  }

  addMeasuredUsage(model: string, promptTokens: number, completionTokens: number): void {
    this._promptTokens += promptTokens;
    this._completionTokens += completionTokens;
    this._requestCount += 1;

    const rates = isAutoRoutingModel(model) ? undefined : MODEL_COST_RATES[model];
    if (rates === undefined) {
      this._unpricedRequestCount += 1;
    } else {
      this._estimatedCostUsd +=
        (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
    }

    this._updateDisplay();
  }

  reset(): void {
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._requestCount = 0;
    this._unpricedRequestCount = 0;
    this._estimatedCostUsd = 0;
    this._billedCredits = 0;
    this._billedRequests = 0;
    this._unsettledRequests = 0;
    this._queuedBillingRequests = [];
    this._updateDisplay();
  }

  private _updateDisplay(): void {
    const hasBilling = this._billedRequests > 0 || this.unsettledRequests > 0;
    if (this._requestCount === 0 && !hasBilling) {
      this._statusBarItem.hide();
      return;
    }

    this._statusBarItem.text =
      this._requestCount > 0
        ? `$(pulse) Tokens: ${formatTokenCount(this.totalTokens)}`
        : `$(credit-card) Billed: ${formatBilledCredits(this)}`;
    this._statusBarItem.tooltip =
      `AGI Workforce -- Session Token Usage\n` +
      `Measured this session, across every model used.\n\n` +
      `Input: ${formatTokenCount(this._promptTokens)}\n` +
      `Output: ${formatTokenCount(this._completionTokens)}\n` +
      `Total: ${formatTokenCount(this.totalTokens)}\n` +
      `Turns: ${this._requestCount}\n` +
      `Estimate: ${formatSessionCreditEstimate(this)}\n` +
      `Billed this session: ${formatBilledCredits(this)}\n\n` +
      `Click for detailed breakdown`;
    this._statusBarItem.show();
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
    onDidCompleteManagedRequest(({ requestId, billing }) => {
      if (billing === 'deferred') {
        counter.queueBillingRequest(requestId);
        return;
      }
      void fetchBilledCredits(context.secrets, requestId).then((credits) =>
        counter.recordBilledRequest(credits),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.resetTokenCounter', () => {
      counter.reset();
      vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.showTokenBreakdown', async () => {
      await counter.settleQueuedBilling(context.secrets);
      if (
        counter.requestCount === 0 &&
        counter.billedRequests === 0 &&
        counter.unsettledRequests === 0
      ) {
        vscode.window.showInformationMessage(
          'AGI Workforce: No measured token usage yet this session.',
        );
        return;
      }

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
          detail: 'Combined input + output usage this session, across every model used',
        },
        {
          label: `$(credit-card) Estimated Credits`,
          description: formatSessionCreditEstimate(counter),
          detail: 'Published rates applied to measured tokens, not an invoice or provider bill',
        },
        {
          label: `$(credit-card) Billed Credits`,
          description: formatBilledCredits(counter),
          detail:
            'Credits AGI Cloud settled this session for chat turns, inline edits, completions and terminal and diagnostics suggestions',
        },
        {
          label: `$(request-changes) Turns`,
          description: `${counter.requestCount}`,
          detail: 'Completed turns that reported measured token usage',
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
}

export function formatBilledCredits(counter: TokenCounter): string {
  const unsettled = counter.unsettledRequests;
  if (counter.billedRequests === 0) {
    return unsettled === 0 ? t('billing.noneYet') : formatUnsettledRequests(unsettled);
  }
  const billed = formatCreditAmount(counter.billedCredits);
  return unsettled === 0
    ? billed
    : t('billing.withUnsettled', {
        credits: billed,
        unsettled: formatUnsettledRequests(unsettled),
      });
}

export function formatSessionCreditEstimate(counter: TokenCounter): string {
  if (counter.requestCount === 0) return t('billing.noneYet');
  if (counter.unpricedRequestCount === counter.requestCount) return t('billing.noPublishedRate');
  const amount = formatCreditAmount(counter.estimatedCredits);
  return counter.unpricedRequestCount === 0
    ? amount
    : tPlural('billing.excludesUnpriced', counter.unpricedRequestCount, { credits: amount });
}

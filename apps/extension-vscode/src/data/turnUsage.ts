import * as vscode from 'vscode';
import { t } from '../l10n';
import { getTokenCounter } from './tokenCounter';
import { formatCreditAmount, formatUnsettledRequests } from './usagePresentation';

export interface CompletedTurnUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly managedRequestIds?: readonly string[];
}

export function recordCompletedTurnUsage(
  secrets: vscode.SecretStorage,
  usage: CompletedTurnUsage,
): void {
  getTokenCounter().addMeasuredUsage(usage.model, usage.inputTokens, usage.outputTokens);
  if (usage.managedRequestIds !== undefined && usage.managedRequestIds.length > 0) {
    void reportBilledTurn(secrets, usage.managedRequestIds);
  }
}

async function reportBilledTurn(
  secrets: vscode.SecretStorage,
  requestIds: readonly string[],
): Promise<void> {
  const settled = await getTokenCounter().settleBillingRequests(secrets, requestIds);
  const billed = settled.filter((credits): credits is number => credits !== null);
  if (billed.length === 0) return;
  const total = billed.reduce((sum, credits) => sum + credits, 0);
  const open = settled.length - billed.length;
  const credits = formatCreditAmount(total);
  vscode.window.setStatusBarMessage(
    open === 0
      ? t('billing.turnBilled', { credits })
      : t('billing.turnBilledSoFar', { credits, unsettled: formatUnsettledRequests(open) }),
    10_000,
  );
}

import * as vscode from 'vscode';
import { AgiWorkforceApiError, AgiWorkforcePaywallError } from '../utils/api';

export type CloudUtilityFailureKind =
  | 'cancelled'
  | 'account-auth'
  | 'api-key'
  | 'paywall'
  | 'retryable'
  | 'unknown';

export interface CloudUtilityErrorActionOptions {
  title: string;
  retry?: () => void | PromiseLike<void>;
}

const RETRYABLE_NETWORK_PATTERN =
  /\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b|fetch failed|network error|socket hang up|timed out/iu;

export function classifyCloudUtilityFailure(error: unknown): CloudUtilityFailureKind {
  if (error instanceof AgiWorkforcePaywallError) return 'paywall';
  if (error instanceof AgiWorkforceApiError) {
    if (error.code === 'CANCELLED') return 'cancelled';
    if (error.code === 'ACCOUNT_AUTH_REQUIRED' || error.code === 'NOT_SIGNED_IN') {
      return 'account-auth';
    }
    if (error.code === 'INVALID_API_KEY' || error.code === 'NO_API_KEY') return 'api-key';
    if (error.statusCode === 429 || (error.statusCode !== undefined && error.statusCode >= 500)) {
      return 'retryable';
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_NETWORK_PATTERN.test(message) ? 'retryable' : 'unknown';
}

function failureMessage(error: unknown): string {
  if (error instanceof AgiWorkforcePaywallError) {
    return (
      error.reason ||
      (error.recoveryAction === 'manage_billing'
        ? 'Your AGI Cloud subscription needs billing attention.'
        : `Upgrade to ${error.requiredTier} to continue.`)
    );
  }
  return error instanceof Error ? error.message : String(error);
}

export async function showCloudUtilityErrorActions(
  error: unknown,
  options: CloudUtilityErrorActionOptions,
): Promise<void> {
  const kind = classifyCloudUtilityFailure(error);
  if (kind === 'cancelled') return;

  const message = `${options.title} — ${failureMessage(error)}`;
  if (kind === 'account-auth') {
    const choice = await vscode.window.showErrorMessage(message, 'Sign in');
    if (choice === 'Sign in') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
    }
    return;
  }

  if (kind === 'api-key') {
    const choice = await vscode.window.showErrorMessage(message, 'Set API Key');
    if (choice === 'Set API Key') {
      await vscode.commands.executeCommand('agi-workforce.setApiKey');
    }
    return;
  }

  if (kind === 'paywall' && error instanceof AgiWorkforcePaywallError) {
    const actions =
      error.recoveryAction === 'manage_billing'
        ? (['Manage billing'] as const)
        : (['Upgrade', 'Manage billing'] as const);
    const choice = await vscode.window.showWarningMessage(message, ...actions);
    if (choice === 'Upgrade') {
      const query = new URLSearchParams({
        from: 'vscode-extension-paywall',
        tier: error.requiredTier,
        feature: error.feature,
      });
      await vscode.env.openExternal(
        vscode.Uri.parse(`https://agiworkforce.com/pricing?${query.toString()}`),
      );
    } else if (choice === 'Manage billing') {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://agiworkforce.com/settings/billing?from=vscode-extension-paywall'),
      );
    }
    return;
  }

  if (kind === 'retryable' && options.retry !== undefined) {
    const choice = await vscode.window.showErrorMessage(message, 'Retry');
    if (choice === 'Retry') await options.retry();
    return;
  }

  await vscode.window.showErrorMessage(message);
}

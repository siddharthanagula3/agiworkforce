import * as vscode from 'vscode';
import {
  formatUsageResetIn,
  getPickerModelTier,
  normalizeUIPlanTier,
  type ManagedUsageBucket,
} from '@agiworkforce/types';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  AgiWorkforceUsageLimitError,
  fetchTierInfo,
  getCloudWebOrigin,
  type ManagedQuotaRecoveryAction,
  type TierInfo,
} from '../utils/api';
import { Config } from '../platform/config';
import {
  getModelPickerOptionsForTier,
  modelDisplayLabel,
  normalizeConfiguredModelId,
} from '../features/model-picker/modelConstants';
import { guardProviderSwitch } from '../integrations/providerSwitchGuard';
import { planDisplayLabel } from '../features/account-auth/planLabel';

export type CloudUtilityFailureKind =
  'cancelled' | 'account-auth' | 'api-key' | 'paywall' | 'usage-limit' | 'retryable' | 'unknown';

export interface CloudUtilityErrorActionOptions {
  title: string;
  retry?: () => void | PromiseLike<void>;
  secrets?: vscode.SecretStorage;
}

const RETRYABLE_NETWORK_PATTERN =
  /\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b|fetch failed|network error|socket hang up|timed out/iu;

const LIMIT_WINDOW_BUCKET: Readonly<Record<string, ManagedUsageBucket>> = {
  rolling_five_hour_limit_reached: 'session',
  rolling_weekly_limit_reached: 'weekly',
  flagship_weekly_limit_reached: 'weeklyFlagship',
  insufficient_credits: 'period',
  monthly_limit_exceeded: 'period',
  monthly_credit_limit_reached: 'period',
  free_trial_token_budget_reached: 'period',
};

const RECOVERY_LABELS: Readonly<Record<ManagedQuotaRecoveryAction, string>> = {
  top_up: 'Add credits',
  upgrade: 'Upgrade',
  view_usage: 'View usage',
  contact_support: 'Contact support',
};

const VIEW_USAGE_LABEL = RECOVERY_LABELS.view_usage;
const USAGE_PATH = '/settings/usage';

export function classifyCloudUtilityFailure(error: unknown): CloudUtilityFailureKind {
  if (error instanceof AgiWorkforcePaywallError) return 'paywall';
  if (error instanceof AgiWorkforceUsageLimitError) return 'usage-limit';
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
        : `Upgrade to ${planDisplayLabel(error.requiredTier) ?? error.requiredTier} to continue.`)
    );
  }
  return error instanceof Error ? error.message : String(error);
}

function webUri(path: string, from: string): vscode.Uri {
  const url = new URL(path, getCloudWebOrigin());
  url.searchParams.set('from', from);
  return vscode.Uri.parse(url.toString());
}

export function eligibleAlternativeModel(
  tierInfo: TierInfo | undefined,
  standardOnly: boolean,
): string | undefined {
  if (tierInfo === undefined) return undefined;
  const tier = normalizeUIPlanTier(tierInfo.tier);
  const current = normalizeConfiguredModelId(Config.model());
  return getModelPickerOptionsForTier(tier).find(
    (option) =>
      option.reachable &&
      option.availability === 'live' &&
      option.id !== current &&
      (!standardOnly ||
        (!option.id.startsWith('auto') && getPickerModelTier(option.id) !== 'premium')) &&
      guardProviderSwitch(current, option.id, tier) === 'allow',
  )?.id;
}

export function limitResetAt(
  code: string | undefined,
  tierInfo: TierInfo | undefined,
): string | null {
  const bucket = code === undefined ? undefined : LIMIT_WINDOW_BUCKET[code];
  if (bucket === undefined) return null;
  const resetAt = tierInfo?.usageBuckets?.find((candidate) => candidate.bucket === bucket)?.resetAt;
  return typeof resetAt === 'string' ? resetAt : null;
}

function recoveryFor(error: AgiWorkforceUsageLimitError): { label: string; href: string } {
  if (error.recovery !== undefined) {
    return { label: RECOVERY_LABELS[error.recovery.action], href: error.recovery.href };
  }
  return error.block.showUpgradeCta
    ? { label: RECOVERY_LABELS.upgrade, href: '/pricing' }
    : { label: VIEW_USAGE_LABEL, href: USAGE_PATH };
}

async function switchToModel(
  modelId: string,
  options: CloudUtilityErrorActionOptions,
): Promise<void> {
  await vscode.workspace
    .getConfiguration('agiWorkforce')
    .update('model', modelId, vscode.ConfigurationTarget.Global);
  if (options.retry !== undefined) {
    await options.retry();
    return;
  }
  void vscode.window.showInformationMessage(
    `AGI Workforce model set to ${modelDisplayLabel(modelId)}. Run the command again to use it.`,
  );
}

async function showUsageLimitActions(
  error: AgiWorkforceUsageLimitError,
  options: CloudUtilityErrorActionOptions,
): Promise<void> {
  const tierInfo = options.secrets === undefined ? undefined : await fetchTierInfo(options.secrets);
  const resetLabel = error.block.showResetTime
    ? formatUsageResetIn(limitResetAt(error.code, tierInfo))
    : null;
  const alternative = error.block.suggestStandardModel
    ? eligibleAlternativeModel(tierInfo, true)
    : undefined;
  const switchLabel =
    alternative === undefined ? undefined : `Use ${modelDisplayLabel(alternative)}`;
  const recovery = recoveryFor(error);
  const actions = [
    ...(switchLabel === undefined ? [] : [switchLabel]),
    recovery.label,
    ...(recovery.label === VIEW_USAGE_LABEL ? [] : [VIEW_USAGE_LABEL]),
  ];
  const message =
    resetLabel === null
      ? `${options.title}, ${error.message}`
      : `${options.title}, ${error.message} ${resetLabel}.`;
  const choice = await vscode.window.showWarningMessage(message, ...actions);
  if (choice === undefined) return;
  if (choice === switchLabel && alternative !== undefined) {
    await switchToModel(alternative, options);
    return;
  }
  await vscode.env.openExternal(
    webUri(choice === recovery.label ? recovery.href : USAGE_PATH, 'vscode-extension-limit'),
  );
}

async function showPaywallActions(
  error: AgiWorkforcePaywallError,
  message: string,
  options: CloudUtilityErrorActionOptions,
): Promise<void> {
  const tierInfo =
    error.code === 'model_not_available' && options.secrets !== undefined
      ? await fetchTierInfo(options.secrets)
      : undefined;
  const alternative =
    error.code === 'model_not_available' ? eligibleAlternativeModel(tierInfo, false) : undefined;
  const switchLabel =
    alternative === undefined ? undefined : `Use ${modelDisplayLabel(alternative)}`;
  const actions = [
    ...(switchLabel === undefined ? [] : [switchLabel]),
    ...(error.recoveryAction === 'manage_billing' ? [] : ['Compare plans', 'Upgrade']),
    'Manage billing',
  ];
  const choice = await vscode.window.showWarningMessage(message, ...actions);
  if (choice === switchLabel && alternative !== undefined) {
    await switchToModel(alternative, options);
  } else if (choice === 'Compare plans') {
    await vscode.commands.executeCommand('agi-workforce.comparePlans');
  } else if (choice === 'Upgrade') {
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
}

export async function showCloudUtilityErrorActions(
  error: unknown,
  options: CloudUtilityErrorActionOptions,
): Promise<void> {
  const kind = classifyCloudUtilityFailure(error);
  if (kind === 'cancelled') return;

  const message = `${options.title}, ${failureMessage(error)}`;
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
    await showPaywallActions(error, message, options);
    return;
  }

  if (kind === 'usage-limit' && error instanceof AgiWorkforceUsageLimitError) {
    await showUsageLimitActions(error, options);
    return;
  }

  if (kind === 'retryable' && options.retry !== undefined) {
    const choice = await vscode.window.showErrorMessage(message, 'Retry');
    if (choice === 'Retry') await options.retry();
    return;
  }

  await vscode.window.showErrorMessage(message);
}

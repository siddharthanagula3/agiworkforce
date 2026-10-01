import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  classifyManagedQuotaErrorCode,
  formatUsageResetIn,
  getPickerModelTier,
  type ManagedQuotaBlockPresentation,
} from '@agiworkforce/types';
import {
  eligibleAlternativeModel,
  limitResetAt,
  showCloudUtilityErrorActions,
} from '../core/cloudUtilityErrorActions';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  AgiWorkforceUsageLimitError,
  fetchTierInfo,
  type ManagedQuotaRecovery,
  type TierInfo,
} from '../utils/api';
import {
  getModelPickerOptionsForTier,
  modelDisplayLabel,
} from '../features/model-picker/modelConstants';
type ScanModule0 = typeof import('../utils/api');

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  fetchTierInfo: vi.fn(),
}));

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const SESSION_RESET_AT = '2026-08-15T15:30:00.000Z';
const FLAGSHIP_RESET_AT = '2026-08-17T12:00:00.000Z';
const SECRETS = {} as vscode.SecretStorage;

const PRO_TIER_INFO: TierInfo = {
  tier: 'pro',
  subscriptionStatus: 'active',
  usageBuckets: [
    { bucket: 'session', percentRemaining: 0, resetAt: SESSION_RESET_AT },
    { bucket: 'weekly', percentRemaining: 40, resetAt: '2026-08-18T12:00:00.000Z' },
    { bucket: 'weeklyFlagship', percentRemaining: 0, resetAt: FLAGSHIP_RESET_AT },
    { bucket: 'period', percentRemaining: 60, resetAt: '2026-09-01T00:00:00.000Z' },
  ],
};

function limitBlock(code: string): ManagedQuotaBlockPresentation {
  const block = classifyManagedQuotaErrorCode(code);
  if (block === null) throw new Error(`${code} is not a managed plan limit`);
  return block;
}

function usageLimit(
  code: string,
  message: string,
  recovery?: ManagedQuotaRecovery,
): AgiWorkforceUsageLimitError {
  return new AgiWorkforceUsageLimitError(message, 429, code, limitBlock(code), recovery);
}

function configurationWith(update: ReturnType<typeof vi.fn>): vscode.WorkspaceConfiguration {
  return {
    get: vi.fn(<T>(_key: string, fallback?: T) => fallback),
    update,
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
  } as unknown as vscode.WorkspaceConfiguration;
}

describe('cloud utility recovery actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers AGI Cloud sign-in for an expired account session', async () => {
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue('Sign in' as never);

    await showCloudUtilityErrorActions(
      new AgiWorkforceApiError('Session expired.', 401, 'ACCOUNT_AUTH_REQUIRED'),
      { title: 'AGI Workforce: Request failed' },
    );

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, Session expired.',
      'Sign in',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.signIn');
  });

  it('offers Set API Key only when the saved key was rejected', async () => {
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue('Set API Key' as never);

    await showCloudUtilityErrorActions(
      new AgiWorkforceApiError('Invalid key.', 401, 'INVALID_API_KEY'),
      { title: 'AGI Workforce: Request failed' },
    );

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, Invalid key.',
      'Set API Key',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.setApiKey');
  });

  it('offers Compare plans, Upgrade and Manage billing for a plan paywall', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Upgrade' as never);
    const error = new AgiWorkforcePaywallError('chat', 'pro', 'IDE access requires Pro.');

    await showCloudUtilityErrorActions(error, { title: 'AGI Workforce: Request failed' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, IDE access requires Pro.',
      'Compare plans',
      'Upgrade',
      'Manage billing',
    );
    expect(vi.mocked(vscode.env.openExternal).mock.calls[0]?.[0].toString()).toMatch(
      /\/pricing\?.*tier=pro/u,
    );
  });

  it('opens the plan comparison when the reader asks to compare plans', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Compare plans' as never);
    const error = new AgiWorkforcePaywallError('video', 'max_15x', 'Video needs a larger plan.');

    await showCloudUtilityErrorActions(error, { title: 'AGI Workforce: Request failed' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.comparePlans');
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  it('names the required plan by its catalog label when the server gives no reason', async () => {
    const error = new AgiWorkforcePaywallError('video', 'max_15x', '');

    await showCloudUtilityErrorActions(error, { title: 'AGI Workforce: Request failed' });

    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toBe(
      'AGI Workforce: Request failed, Upgrade to Max 20x to continue.',
    );
  });

  it('routes an inactive subscription directly to billing', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Manage billing' as never);
    const error = new AgiWorkforcePaywallError(
      'managed_cloud',
      'pro',
      'Update billing.',
      'subscription_inactive',
    );

    await showCloudUtilityErrorActions(error, { title: 'AGI Workforce: Request failed' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, Update billing.',
      'Manage billing',
    );
    expect(vi.mocked(vscode.env.openExternal).mock.calls[0]?.[0].toString()).toContain(
      '/settings/billing?',
    );
  });

  it('offers Retry for throttling without showing credential actions', async () => {
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue('Retry' as never);
    const retry = vi.fn();

    await showCloudUtilityErrorActions(
      new AgiWorkforceApiError('Please wait.', 429, 'RATE_LIMITED'),
      { title: 'AGI Workforce: Request failed', retry },
    );

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, Please wait.',
      'Retry',
    );
    expect(retry).toHaveBeenCalledOnce();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('plan usage limit recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.mocked(fetchTierInfo).mockResolvedValue(PRO_TIER_INFO);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the reset of the window that refused, not the nearest one', () => {
    expect(limitResetAt('rolling_five_hour_limit_reached', PRO_TIER_INFO)).toBe(SESSION_RESET_AT);
    expect(limitResetAt('flagship_weekly_limit_reached', PRO_TIER_INFO)).toBe(FLAGSHIP_RESET_AT);
    expect(limitResetAt('monthly_credit_limit_reached', PRO_TIER_INFO)).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(limitResetAt('plan_upgrade_required', PRO_TIER_INFO)).toBeNull();
    expect(limitResetAt('rolling_five_hour_limit_reached', undefined)).toBeNull();
  });

  it('suggests only a standard model the plan can reach when a flagship limit refuses', () => {
    const alternative = eligibleAlternativeModel(PRO_TIER_INFO, true);

    expect(alternative).toBeDefined();
    expect(alternative?.startsWith('auto')).toBe(false);
    expect(getPickerModelTier(alternative)).not.toBe('premium');
    expect(
      getModelPickerOptionsForTier('pro').find((option) => option.id === alternative),
    ).toMatchObject({ reachable: true, availability: 'live' });
    expect(eligibleAlternativeModel(undefined, true)).toBeUndefined();
  });

  it('states when the refusing window resets and offers the server recovery and usage', async () => {
    const error = usageLimit(
      'rolling_five_hour_limit_reached',
      'You have used your rolling 5-hour capacity.',
      { action: 'top_up', href: '/settings/billing?intent=credits' },
    );

    await showCloudUtilityErrorActions(error, {
      title: 'AGI Workforce: Request failed',
      secrets: SECRETS,
    });

    expect(fetchTierInfo).toHaveBeenCalledWith(SECRETS);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, You have used your rolling 5-hour capacity. Resets in 3 hr 30 min.',
      'Add credits',
      'View usage',
    );
  });

  it('opens the recovery the server named on the web origin', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Add credits' as never);
    const error = usageLimit('monthly_limit_exceeded', 'Plan usage is used up.', {
      action: 'top_up',
      href: '/settings/billing?intent=credits',
    });

    await showCloudUtilityErrorActions(error, {
      title: 'AGI Workforce: Request failed',
      secrets: SECRETS,
    });

    const opened = new URL(vi.mocked(vscode.env.openExternal).mock.calls[0]![0].toString());
    expect(opened.pathname).toBe('/settings/billing');
    expect(opened.searchParams.get('intent')).toBe('credits');
    expect(opened.searchParams.get('from')).toBe('vscode-extension-limit');
  });

  it('switches to the eligible standard model and retries when a flagship limit refuses', async () => {
    const alternative = eligibleAlternativeModel(PRO_TIER_INFO, true)!;
    const switchLabel = `Use ${modelDisplayLabel(alternative)}`;
    const update = vi.fn().mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configurationWith(update));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(switchLabel as never);
    const retry = vi.fn();

    await showCloudUtilityErrorActions(
      usageLimit('flagship_weekly_limit_reached', 'Flagship capacity is used up.'),
      { title: 'AGI Workforce: Request failed', secrets: SECRETS, retry },
    );

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      `AGI Workforce: Request failed, Flagship capacity is used up. ${formatUsageResetIn(FLAGSHIP_RESET_AT, NOW)}.`,
      switchLabel,
      'Upgrade',
      'View usage',
    );
    expect(update).toHaveBeenCalledWith('model', alternative, vscode.ConfigurationTarget.Global);
    expect(retry).toHaveBeenCalledOnce();
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  it('tells the reader the model changed when there is no request to retry', async () => {
    const alternative = eligibleAlternativeModel(PRO_TIER_INFO, true)!;
    const switchLabel = `Use ${modelDisplayLabel(alternative)}`;
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      configurationWith(vi.fn().mockResolvedValue(undefined)),
    );
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(switchLabel as never);

    await showCloudUtilityErrorActions(
      usageLimit('flagship_weekly_limit_reached', 'Flagship capacity is used up.'),
      { title: 'AGI Workforce: Request failed', secrets: SECRETS },
    );

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      `AGI Workforce model set to ${modelDisplayLabel(alternative)}. Run the command again to use it.`,
    );
  });

  it('does not suggest a model for a limit a standard model would not clear', async () => {
    await showCloudUtilityErrorActions(
      usageLimit('rolling_weekly_limit_reached', 'Weekly capacity is used up.'),
      { title: 'AGI Workforce: Request failed', secrets: SECRETS },
    );

    const actions = vi.mocked(vscode.window.showWarningMessage).mock.calls[0]!.slice(1);
    expect(actions).toEqual(['Upgrade', 'View usage']);
  });

  it('states no reset for a refusal that does not reset and never repeats View usage', async () => {
    await showCloudUtilityErrorActions(
      usageLimit('free_trial_feature_unavailable', 'That capability requires a paid plan.', {
        action: 'view_usage',
        href: '/settings/usage',
      }),
      { title: 'AGI Workforce: Request failed', secrets: SECRETS },
    );

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, That capability requires a paid plan.',
      'View usage',
    );
  });

  it('still explains the limit when usage cannot be read', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);

    await showCloudUtilityErrorActions(
      usageLimit('flagship_weekly_limit_reached', 'Flagship capacity is used up.'),
      { title: 'AGI Workforce: Request failed', secrets: SECRETS },
    );

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed, Flagship capacity is used up.',
      'Upgrade',
      'View usage',
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { AgiWorkforceApiError, AgiWorkforcePaywallError } from '../utils/api';

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
      'AGI Workforce: Request failed — Session expired.',
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
      'AGI Workforce: Request failed — Invalid key.',
      'Set API Key',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.setApiKey');
  });

  it('offers Upgrade and Manage billing for a plan paywall', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Upgrade' as never);
    const error = new AgiWorkforcePaywallError('chat', 'pro', 'IDE access requires Pro.');

    await showCloudUtilityErrorActions(error, { title: 'AGI Workforce: Request failed' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Request failed — IDE access requires Pro.',
      'Upgrade',
      'Manage billing',
    );
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/\/pricing\?.*tier=pro/u),
      }),
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
      'AGI Workforce: Request failed — Update billing.',
      'Manage billing',
    );
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('/settings/billing?') }),
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
      'AGI Workforce: Request failed — Please wait.',
      'Retry',
    );
    expect(retry).toHaveBeenCalledOnce();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

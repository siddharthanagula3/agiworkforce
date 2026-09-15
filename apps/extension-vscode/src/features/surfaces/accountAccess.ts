import * as vscode from 'vscode';
import { getAccountToken } from '../../utils/api';
import { signInToAgiCloud, tryOpenDeviceAuthorizationUrl } from '../account-auth/deviceAuth';
import { type CliAccountStatus, type CliCapabilityAdapter } from './cliCapabilities';

export type AccountTokenSource = 'cli' | 'extension';

export interface ResolvedAccountToken {
  token: string;
  source: AccountTokenSource;
}

export async function resolveAccountToken(
  secrets: vscode.SecretStorage,
  adapter: CliCapabilityAdapter,
): Promise<ResolvedAccountToken | undefined> {
  const status = await adapter.accountStatus();
  if (status.status === 'ok' && status.value.signedIn) {
    const token = await adapter.accountToken();
    if (token !== undefined && token !== '') return { token, source: 'cli' };
  }
  const stored = await getAccountToken(secrets);
  return stored === undefined || stored === '' ? undefined : { token: stored, source: 'extension' };
}

export async function resolveAccountPresence(
  secrets: vscode.SecretStorage,
  adapter: CliCapabilityAdapter,
): Promise<{ signedIn: boolean; source: AccountTokenSource | 'none'; cli?: CliAccountStatus }> {
  const status = await adapter.accountStatus();
  if (status.status === 'ok' && status.value.signedIn) {
    return { signedIn: true, source: 'cli', cli: status.value };
  }
  const stored = await getAccountToken(secrets);
  return stored === undefined || stored === ''
    ? { signedIn: false, source: 'none' }
    : { signedIn: true, source: 'extension' };
}

export async function signIn(
  secrets: vscode.SecretStorage,
  adapter: CliCapabilityAdapter,
): Promise<boolean> {
  const challenge = await adapter.login();
  if (challenge.status !== 'ok') return signInToAgiCloud(secrets);
  const { loginId, verificationUrl, userCode } = challenge.value;
  const instruction =
    userCode === undefined
      ? `Finish signing in at ${verificationUrl}.`
      : `Enter code ${userCode} at ${verificationUrl} to finish signing in.`;
  if ((await tryOpenDeviceAuthorizationUrl(verificationUrl)) !== 'opened') {
    void vscode.window.showWarningMessage(instruction, 'Copy sign-in link').then(async (action) => {
      if (action !== 'Copy sign-in link') return;
      await vscode.env.clipboard.writeText(verificationUrl);
    });
  }
  return vscode.window.withProgress<boolean>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Signing in to AGI Cloud…',
      cancellable: true,
    },
    async (progress, cancelToken) => {
      progress.report({
        message:
          userCode === undefined
            ? 'Approve the sign-in in your browser.'
            : `Approve code ${userCode} in your browser.`,
      });
      const grant = await Promise.race([
        adapter.loginWait(loginId),
        new Promise<undefined>((resolve) => {
          cancelToken.onCancellationRequested(() => resolve(undefined));
        }),
      ]);
      if (grant === undefined) return false;
      if (grant.status !== 'ok') {
        vscode.window.showErrorMessage(grant.reason);
        return false;
      }
      if (grant.value.outcome === 'completed') {
        vscode.window.showInformationMessage('Signed in to AGI Cloud.');
        return true;
      }
      vscode.window.showWarningMessage(
        grant.value.message ?? 'AGI Cloud sign-in expired. Start again.',
      );
      return false;
    },
  );
}

import * as vscode from 'vscode';
import { getAccountToken } from '../../utils/api';
import { signInToAgiCloud } from '../account-auth/deviceAuth';
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
  const { verificationUrl, userCode } = challenge.value;
  const open = await vscode.window.showInformationMessage(
    userCode === undefined
      ? `Finish signing in at ${verificationUrl}.`
      : `Enter code ${userCode} at ${verificationUrl} to finish signing in.`,
    'Open sign-in page',
  );
  if (open !== undefined) await vscode.env.openExternal(vscode.Uri.parse(verificationUrl));
  return true;
}

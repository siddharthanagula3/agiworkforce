import * as WebBrowser from 'expo-web-browser';
import {
  GITHUB_INSTALL_APP_RETURN_URL,
  GITHUB_INSTALL_APP_START_PATH,
  GITHUB_INSTALL_COMPLETE_PATH,
  GitHubInstallAppStartResponseSchema,
  GitHubInstallCompleteRequestSchema,
  GitHubInstallCompleteResponseSchema,
  type GitHubInstallCompleteStatus,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export type GitHubInstallOutcome = GitHubInstallCompleteStatus | 'dismissed';

const GITHUB_HOSTS = new Set(['github.com']);

export async function connectGitHubInApp(): Promise<GitHubInstallOutcome> {
  const started = GitHubInstallAppStartResponseSchema.parse(
    await api.post<unknown>(GITHUB_INSTALL_APP_START_PATH),
  );
  const installUrl = new URL(started.url);
  if (installUrl.protocol !== 'https:' || !GITHUB_HOSTS.has(installUrl.hostname)) {
    return 'failed';
  }
  const session = await WebBrowser.openAuthSessionAsync(
    installUrl.toString(),
    GITHUB_INSTALL_APP_RETURN_URL,
  );
  if (session.type !== 'success') return 'dismissed';
  return completeGitHubInstall(session.url);
}

export async function completeGitHubInstall(
  returnUrl: string,
): Promise<GitHubInstallCompleteStatus> {
  let params: URLSearchParams;
  try {
    params = new URL(returnUrl).searchParams;
  } catch {
    return 'invalid_state';
  }
  const request = GitHubInstallCompleteRequestSchema.safeParse({
    state: params.get('state') ?? '',
    ...(params.get('code') ? { code: params.get('code') } : {}),
    ...(params.get('error') ? { error: params.get('error') } : {}),
  });
  if (!request.success) return 'invalid_state';
  const response = GitHubInstallCompleteResponseSchema.parse(
    await api.post<unknown>(GITHUB_INSTALL_COMPLETE_PATH, request.data),
  );
  return response.status;
}

export function describeGitHubInstallOutcome(outcome: GitHubInstallOutcome): string | null {
  switch (outcome) {
    case 'connected':
    case 'dismissed':
      return null;
    case 'already_linked':
      return 'That GitHub installation is already linked to another account.';
    case 'ownership_failed':
      return 'GitHub did not confirm that your account can reach that installation.';
    case 'denied':
      return 'GitHub access was not granted.';
    case 'invalid_state':
      return 'This GitHub connection expired. Start it again.';
    case 'failed':
      return 'GitHub could not be connected. Try again.';
  }
}

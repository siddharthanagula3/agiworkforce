import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  GITHUB_INSTALL_APP_RETURN_URL,
  GITHUB_INSTALL_APP_START_PATH,
  GITHUB_INSTALL_COMPLETE_PATH,
  GITHUB_INSTALL_PENDING_PATH,
  GitHubInstallAppStartResponseSchema,
  GitHubInstallCompleteRequestSchema,
  GitHubInstallCompleteResponseSchema,
  GitHubInstallPendingResponseSchema,
  type GitHubInstallCompleteRequest,
  type GitHubInstallCompleteStatus,
  type GitHubInstallPendingResponse,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export type GitHubInstallReturn = GitHubInstallCompleteRequest;

export type GitHubInstallStart =
  | { kind: 'returned'; result: GitHubInstallReturn }
  | { kind: 'opened' }
  | { kind: 'dismissed' }
  | { kind: 'failed' };

const GITHUB_HOSTS = new Set(['github.com']);

export function readGitHubInstallReturn(
  params: Readonly<Record<string, string | string[] | undefined>>,
): GitHubInstallReturn | null {
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value ? value : undefined;
  };
  const parsed = GitHubInstallCompleteRequestSchema.safeParse({
    state: pick('state') ?? '',
    ...(pick('code') ? { code: pick('code') } : {}),
    ...(pick('error') ? { error: pick('error') } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export async function startGitHubInstallInApp(): Promise<GitHubInstallStart> {
  const android = Platform.OS === 'android';
  const started = GitHubInstallAppStartResponseSchema.parse(
    await api.post<unknown>(GITHUB_INSTALL_APP_START_PATH, {
      platform: android ? 'android' : 'ios',
    }),
  );
  const installUrl = new URL(started.url);
  if (installUrl.protocol !== 'https:' || !GITHUB_HOSTS.has(installUrl.hostname)) {
    return { kind: 'failed' };
  }
  if (android) {
    await WebBrowser.openBrowserAsync(installUrl.toString());
    return { kind: 'opened' };
  }
  const session = await WebBrowser.openAuthSessionAsync(
    installUrl.toString(),
    GITHUB_INSTALL_APP_RETURN_URL,
  );
  if (session.type !== 'success') return { kind: 'dismissed' };
  let returned: URL;
  try {
    returned = new URL(session.url);
  } catch {
    return { kind: 'failed' };
  }
  const result = readGitHubInstallReturn(Object.fromEntries(returned.searchParams.entries()));
  return result ? { kind: 'returned', result } : { kind: 'failed' };
}

export async function fetchPendingGitHubInstall(
  state: string,
): Promise<GitHubInstallPendingResponse> {
  return GitHubInstallPendingResponseSchema.parse(
    await api.post<unknown>(GITHUB_INSTALL_PENDING_PATH, { state }),
  );
}

export async function completeGitHubInstall(
  request: GitHubInstallReturn,
): Promise<GitHubInstallCompleteStatus> {
  const response = GitHubInstallCompleteResponseSchema.parse(
    await api.post<unknown>(GITHUB_INSTALL_COMPLETE_PATH, request),
  );
  return response.status;
}

export function describeGitHubInstallOutcome(outcome: GitHubInstallCompleteStatus): string | null {
  switch (outcome) {
    case 'connected':
      return null;
    case 'already_linked':
      return 'That GitHub installation is already linked to another account.';
    case 'ownership_failed':
      return 'GitHub did not confirm that your account can reach that installation.';
    case 'denied':
      return 'GitHub was not linked.';
    case 'invalid_state':
      return 'This GitHub connection expired or was started by another account. Start it again.';
    case 'failed':
      return 'GitHub could not be connected. Try again.';
  }
}

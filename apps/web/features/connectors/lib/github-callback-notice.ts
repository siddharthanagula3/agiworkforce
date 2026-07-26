export interface GitHubCallbackNotice {
  kind: 'success' | 'error';
  message: string;
}

const GITHUB_CALLBACK_NOTICES: Readonly<Record<string, GitHubCallbackNotice>> = {
  connected: {
    kind: 'success',
    message: 'GitHub connected.',
  },
  unavailable: {
    kind: 'error',
    message: 'GitHub App is not configured in this deployment.',
  },
  invalid_state: {
    kind: 'error',
    message: 'GitHub connection failed a security check. Please try again.',
  },
  ownership_failed: {
    kind: 'error',
    message: 'GitHub could not verify that this installation belongs to your account.',
  },
  oauth_denied: {
    kind: 'error',
    message: 'GitHub authorization was canceled.',
  },
  oauth_failed: {
    kind: 'error',
    message: 'GitHub authorization failed. Please try again.',
  },
  already_linked: {
    kind: 'error',
    message: 'This GitHub installation is already linked to another AGI account.',
  },
  ownership_proof_required: {
    kind: 'error',
    message: 'GitHub ownership verification is required. Start the connection again.',
  },
  install_failed: {
    kind: 'error',
    message: 'GitHub installation could not be completed. Please try again.',
  },
};

export function getGitHubCallbackNotice(status: string | null): GitHubCallbackNotice | null {
  if (!status) return null;
  return (
    GITHUB_CALLBACK_NOTICES[status] ?? {
      kind: 'error',
      message: 'Could not complete the GitHub connection. Please try again.',
    }
  );
}

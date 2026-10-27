/**
 * GitHub refused to mint or use an installation token.
 *
 * 401 and 403 mean the credential is no longer accepted. 404 means the
 * installation is gone. None of these are a transient outage, and the message
 * carries only the status, never the token.
 */
export class GitHubInstallationAccessError extends Error {
  readonly status: number;

  constructor(status: number, action: 'token' | 'repositories') {
    super(
      action === 'token'
        ? `Failed to get installation token: ${status}`
        : `Failed to list GitHub repositories: ${status}`,
    );
    this.name = 'GitHubInstallationAccessError';
    this.status = status;
  }
}

export function gitHubInstallationAccessDenied(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

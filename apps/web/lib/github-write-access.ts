import { GITHUB_RECONNECT_REQUIRED_REASON } from './github-installation-access';

export class GitHubWriteAccessError extends Error {
  readonly reason = GITHUB_RECONNECT_REQUIRED_REASON;

  constructor(
    readonly installationId: number,
    readonly recorded: boolean,
    fullName: string,
  ) {
    super(
      recorded
        ? `Your GitHub account cannot push to ${fullName}, so AGI will not push or open pull requests there for you. If your access changed, reconnect GitHub to refresh it.`
        : 'Reconnect GitHub to push or open pull requests. This connection was made before AGI recorded which repositories your GitHub account can write to.',
    );
    this.name = 'GitHubWriteAccessError';
  }
}

/**
 * Refuses a write-scoped installation token for a repository the linking
 * account cannot itself push to. A missing set is a link made before the set
 * was recorded: it is refused, never read as "everything is writable".
 */
export function assertRepositoryIsWritable(
  installationId: number,
  writableRepositories: readonly string[] | null | undefined,
  fullName: string,
): void {
  if (!writableRepositories) throw new GitHubWriteAccessError(installationId, false, fullName);
  if (!writableRepositories.includes(fullName.toLowerCase())) {
    throw new GitHubWriteAccessError(installationId, true, fullName);
  }
}

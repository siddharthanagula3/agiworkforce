const REPOSITORY_URL_LIMIT = 500;

const GIT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export type GitHubRepositoryUrlResult =
  { ok: true; url: string } | { ok: false; reason: 'length' | 'invalid' | 'unsupported' };

export type GitHubRepositoryBranchResult = { ok: true; branch: string | null } | { ok: false };

/**
 * The only repository URL the managed Code clone accepts.
 *
 * Trailing slashes are removed before the `.git` suffix, so both
 * `owner/name/` and `owner/name.git/` become `https://github.com/owner/name.git`.
 * A URL is not authorization: callers still have to decide whether a credential
 * is required.
 */
export function canonicalGitHubRepositoryUrl(value: string): GitHubRepositoryUrlResult {
  if (value.length > REPOSITORY_URL_LIMIT) return { ok: false, reason: 'length' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  const pathParts = path.split('/').filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    pathParts.length !== 2
  ) {
    return { ok: false, reason: 'unsupported' };
  }
  return { ok: true, url: `https://github.com/${pathParts[0]}/${pathParts[1]}.git` };
}

/**
 * The same ref rules the clone uses, so a branch the picker accepts cannot be
 * read by git as an option.
 */
export function canonicalGitHubRepositoryBranch(value: string): GitHubRepositoryBranchResult {
  const branch = value.trim();
  if (!branch) return { ok: true, branch: null };
  const rejected =
    !GIT_REF_RE.test(branch) ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock');
  if (rejected) return { ok: false };
  return { ok: true, branch };
}

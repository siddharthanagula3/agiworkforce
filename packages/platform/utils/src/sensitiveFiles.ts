/**
 * sensitiveFiles.ts — Shared denylist of file patterns that should NEVER
 * be sent to an LLM, read by an agent, included in inline-completion
 * context, or otherwise exposed across a trust boundary.
 *
 * Used by:
 *   - apps/extension-vscode: readFiles, @file resolution, inline completions
 *   - apps/desktop (future): agent file-tool gate
 *
 * Patterns deliberately include both POSIX and Windows path shapes and use
 * forward-slash boundaries (`(^|/)`) because all consumers normalize paths
 * to forward slashes before checking (the caller passes either a relative
 * or absolute path — both are checked against the same regex set).
 */

export const SENSITIVE_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  // Environment / dotenv
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)\.envrc$/i,

  // Secrets / credentials by name
  /(^|\/)secrets?\.(json|ya?ml|toml|env|txt|js|ts)$/i,
  /(^|\/).*credentials?(\.[A-Za-z0-9]+)?$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.dockercfg$/i,
  /(^|\/)\.docker\/config\.json$/i,

  // Private keys / certs
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|p12|pfx|key|crt|cer|gpg|asc)$/i,
  /(^|\/)authorized_keys$/i,
  /(^|\/)known_hosts$/i,

  // Cloud / vendor credential dirs
  /(^|\/)\.ssh\//i,
  /(^|\/)\.gnupg\//i,
  /(^|\/)\.aws\//i,
  /(^|\/)\.gcloud\//i,
  /(^|\/)\.config\/gcloud\//i,
  /(^|\/)\.azure\//i,
  /(^|\/)\.kube\/config$/i,

  // Git internals (tokens often live here)
  /(^|\/)\.git\/(config|credentials)$/i,
  /(^|\/)\.git-credentials$/i,

  // Common token files
  /(^|\/)\.(github|gitlab)_token$/i,
];

/**
 * Returns true if the given path matches a sensitive-file pattern.
 *
 * Accepts either a relative path (e.g., `.env.production`) or an absolute
 * path (e.g., `/Users/x/secrets.json`, `C:\\Users\\x\\.aws\\credentials`).
 * Backslashes are normalized to forward slashes before matching.
 *
 * Callers should treat a `true` result as a hard refusal — surface a
 * user-visible message and do NOT fall back to "ask the user".
 */
export function isSensitiveFile(pathLike: string): boolean {
  if (typeof pathLike !== 'string' || pathLike.length === 0) return false;
  const normalized = pathLike.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Test-only escape hatch: returns the matching pattern (or undefined) so
 * unit tests can assert WHY a file was flagged. Not for production use.
 */
export function matchSensitivePattern(pathLike: string): RegExp | undefined {
  if (typeof pathLike !== 'string' || pathLike.length === 0) return undefined;
  const normalized = pathLike.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.find((re) => re.test(normalized));
}

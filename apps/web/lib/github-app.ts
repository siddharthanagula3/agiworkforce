import 'server-only';
import { createHmac, timingSafeEqual, randomBytes, createSign } from 'crypto';
import { z } from 'zod';
import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';
import { getNeonDb } from '@/lib/server/neon-db';
import { collectGitHubRestPages, findInGitHubRestPages } from './github-rest-pagination';

const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function validateGitHubPathSegment(value: string, label: string): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}: contains disallowed characters`);
  }
  return value;
}

function buildGitHubApiUrl(path: string): string {
  const url = new URL(path, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') {
    throw new Error('SSRF blocked: URL does not target api.github.com');
  }
  return url.toString();
}

const GITHUB_APP_ID = process.env['GITHUB_APP_ID'];
const GITHUB_APP_PRIVATE_KEY_BASE64 = process.env['GITHUB_APP_PRIVATE_KEY_BASE64'];
const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'];
const GITHUB_TOKEN_ENCRYPTION_KEY = process.env['GITHUB_TOKEN_ENCRYPTION_KEY'];
const GITHUB_APP_SLUG = process.env['GITHUB_APP_SLUG'];
const GITHUB_APP_CLIENT_ID = process.env['GITHUB_APP_CLIENT_ID'];
const GITHUB_APP_CLIENT_SECRET = process.env['GITHUB_APP_CLIENT_SECRET'];

const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;
const GITHUB_INSTALLATIONS_PER_PAGE = 100;
const MAX_GITHUB_INSTALLATION_PAGES = 100;
const GITHUB_REPOSITORIES_PER_PAGE = 100;
const MAX_GITHUB_VERIFIED_REPOSITORY_PAGES = 50;
const MAX_VERIFIED_REPOSITORIES = 5000;

const gitHubOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
});

const gitHubInstallationTokenResponseSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().datetime({ offset: true }),
});

const gitHubUserInstallationSchema = z.object({
  id: z.number().int().positive().safe(),
  account: z.object({
    login: z.string().min(1).max(255),
    type: z.enum(['User', 'Organization']),
  }),
});
type GitHubUserInstallation = z.infer<typeof gitHubUserInstallationSchema>;

const gitHubUserInstallationsResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  installations: z.array(gitHubUserInstallationSchema),
});

const gitHubUserInstallationRepositoriesResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(z.object({ full_name: z.string().min(1).max(512) })),
});

export interface VerifiedGitHubInstallation {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  /**
   * The `owner/name` repositories the OAuth'd account itself can reach through
   * this installation, lowercased. `GET /user/installations` lists an
   * installation to anyone who can see ONE of its repositories, so this set,
   * not the installation, is the caller's authorization.
   */
  verifiedRepositories: string[];
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY_BASE64);
}

/**
 * Whether this deployment can prove that a browser-supplied installation id
 * belongs to the signed-in AGI user.
 *
 * GitHub explicitly warns that a setup URL's `installation_id` can be spoofed
 * and requires a GitHub App user access token to verify the association.
 * Linking is therefore advertised only when both the installation credentials
 * and the separate user-authorization credentials are complete.
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
 */
export function missingGitHubInstallationLinkingVars(): string[] {
  return Object.entries({
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY_BASE64,
    GITHUB_APP_SLUG,
    GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

let linkingUnavailableLogged = false;

export function isGitHubInstallationLinkingAvailable(): boolean {
  const missing = missingGitHubInstallationLinkingVars();
  if (missing.length === 0) return true;
  if (!linkingUnavailableLogged) {
    linkingUnavailableLogged = true;
    console.warn(
      `[github-app] GitHub connector linking is disabled: missing ${missing.join(', ')}. ` +
        'The /api/connectors route answers 501 until every one of these is set.',
    );
  }
  return false;
}

export function getGitHubAppInstallUrl(): string | null {
  return GITHUB_APP_SLUG
    ? `https://github.com/apps/${encodeURIComponent(GITHUB_APP_SLUG)}/installations/new`
    : null;
}

export function getGitHubUserAuthorizationUrl(state: string, redirectUri: string): string {
  if (!isGitHubInstallationLinkingAvailable() || !GITHUB_APP_CLIENT_ID) {
    throw new Error('GitHub App user authorization is not configured');
  }
  if (!/^[a-f0-9]{64}$/i.test(state)) {
    throw new Error('Invalid GitHub OAuth state');
  }

  const callbackUrl = new URL(redirectUri);
  if (
    callbackUrl.protocol !== 'https:' &&
    !(process.env.NODE_ENV !== 'production' && callbackUrl.protocol === 'http:')
  ) {
    throw new Error('GitHub OAuth callback must use HTTPS');
  }

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', GITHUB_APP_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl.toString());
  authorizeUrl.searchParams.set('state', state);
  return authorizeUrl.toString();
}

export async function exchangeGitHubOAuthCode(code: string, redirectUri: string): Promise<string> {
  if (
    !isGitHubInstallationLinkingAvailable() ||
    !GITHUB_APP_CLIENT_ID ||
    !GITHUB_APP_CLIENT_SECRET
  ) {
    throw new Error('GitHub App user authorization is not configured');
  }
  if (!code || code.length > 512) {
    throw new Error('Invalid GitHub OAuth code');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GITHUB_APP_CLIENT_ID,
      client_secret: GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub OAuth code exchange failed: ${response.status}`);
  }

  const parsed = gitHubOAuthTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.token_type.toLowerCase() !== 'bearer') {
    throw new Error('GitHub OAuth code exchange returned an invalid response');
  }
  return parsed.data.access_token;
}

export async function findGitHubInstallationForUser(
  userAccessToken: string,
  targetInstallationId: number,
): Promise<VerifiedGitHubInstallation | null> {
  if (!userAccessToken) throw new Error('GitHub user access token is required');
  if (!Number.isSafeInteger(targetInstallationId) || targetInstallationId <= 0) {
    throw new Error('Invalid GitHub installation id');
  }

  const match = await findInGitHubRestPages<GitHubUserInstallation>({
    perPage: GITHUB_INSTALLATIONS_PER_PAGE,
    maxPages: MAX_GITHUB_INSTALLATION_PAGES,
    matches: (installation) => installation.id === targetInstallationId,
    loadPage: async (page) => {
      const response = await fetch(
        buildGitHubApiUrl(
          `/user/installations?per_page=${GITHUB_INSTALLATIONS_PER_PAGE}&page=${page}`,
        ),
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
          signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to verify GitHub installation ownership: ${response.status}`);
      }

      const parsed = gitHubUserInstallationsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error('GitHub installation ownership response was invalid');
      }
      return {
        items: parsed.data.installations,
        totalCount: parsed.data.total_count,
        linkHeader: response.headers.get('link'),
      };
    },
  });

  if (!match) return null;

  return {
    installationId: match.id,
    accountLogin: match.account.login,
    accountType: match.account.type,
    verifiedRepositories: await listUserAccessibleInstallationRepositories(
      userAccessToken,
      match.id,
    ),
  };
}

/**
 * The repositories the OAuth'd account can reach through one installation.
 *
 * This is the narrowing `/user/installations` does not do: that endpoint lists
 * an installation to anyone who can see a single repository under it, while the
 * installation credential the link grants covers every repository the
 * installation covers. Truncation is an error rather than a shorter set,
 * because a silently short list would be written as the caller's proved
 * authorization and quietly lock them out of their own repositories.
 */
async function listUserAccessibleInstallationRepositories(
  userAccessToken: string,
  installationId: number,
): Promise<string[]> {
  const collected = await collectGitHubRestPages({
    perPage: GITHUB_REPOSITORIES_PER_PAGE,
    maxPages: MAX_GITHUB_VERIFIED_REPOSITORY_PAGES,
    maxItems: MAX_VERIFIED_REPOSITORIES,
    loadPage: async (page) => {
      const response = await fetch(
        buildGitHubApiUrl(
          `/user/installations/${encodeURIComponent(String(installationId))}/repositories` +
            `?per_page=${GITHUB_REPOSITORIES_PER_PAGE}&page=${page}`,
        ),
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
          signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Failed to read your repositories for this installation: ${response.status}`,
        );
      }
      const parsed = gitHubUserInstallationRepositoriesResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        throw new Error('GitHub accessible-repository response was invalid');
      }
      return {
        items: parsed.data.repositories,
        totalCount: parsed.data.total_count,
        linkHeader: response.headers.get('link'),
      };
    },
  });

  if (collected.truncated) {
    throw new Error(
      `This account reaches more than ${MAX_VERIFIED_REPOSITORIES} repositories through that installation`,
    );
  }
  return [...new Set(collected.items.map((repository) => repository.full_name.toLowerCase()))];
}

export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(`sha256=${expected}`, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function getGitHubAppJwt(): Promise<string> {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY_BASE64) {
    throw new Error('GitHub App credentials not configured');
  }

  const privateKey = Buffer.from(GITHUB_APP_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: GITHUB_APP_ID,
      iat: now - 60,
      exp: now + 600,
    }),
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

export type GitHubInstallationDeletion =
  | { status: 'deleted' }
  | { status: 'already-absent' }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Uninstalls the GitHub App itself, which is the only act that stops GitHub
 * sending us webhooks and stops us minting installation tokens. Deleting our
 * own row leaves the app installed on the account, so the grant survives a
 * disconnect the user believes they completed.
 *
 * A 404 means GitHub has already forgotten the installation, which is the
 * caller's desired end state, so it is reported as absent rather than failed.
 * Every other outcome is a failure the caller must surface: an installation
 * this product can no longer see but GitHub still honours is worse than a
 * disconnect that visibly did not finish.
 */
export async function deleteGitHubAppInstallation(
  installationId: number,
): Promise<GitHubInstallationDeletion> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return { status: 'failed', reason: 'Invalid GitHub installation id' };
  }
  if (!isGitHubAppConfigured()) {
    return { status: 'unavailable', reason: 'GitHub App credentials are not configured' };
  }

  let response: Response;
  try {
    const jwt = await getGitHubAppJwt();
    response = await fetch(
      buildGitHubApiUrl(`/app/installations/${encodeURIComponent(String(installationId))}`),
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return {
      status: 'failed',
      reason: `GitHub was unreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (response.status === 404) return { status: 'already-absent' };
  if (response.ok) return { status: 'deleted' };
  return { status: 'failed', reason: `GitHub returned ${response.status}` };
}

let _devFallbackRing: KeyRing | null = null;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

function getKeyRing(): KeyRing {
  const keyHex = GITHUB_TOKEN_ENCRYPTION_KEY;
  if (keyHex && HEX_64_RE.test(keyHex)) {
    return loadKeyRing('GITHUB_TOKEN_ENCRYPTION_KEY');
  }

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'GITHUB_TOKEN_ENCRYPTION_KEY is missing or malformed (expected 64 hex characters). ' +
        'GitHub App installation tokens cannot be encrypted or decrypted without it.',
    );
  }

  if (!_devFallbackRing) {
    _devFallbackRing = { active: { id: '1', material: randomBytes(32) }, retired: [] };
  }
  return _devFallbackRing;
}

function encryptToken(token: string): string {
  return sealEnvelope(getKeyRing(), token, 'hex-triple');
}

function decryptToken(encryptedValue: string): string {
  return openEnvelope(getKeyRing(), encryptedValue, 'hex-triple').plaintext;
}

/**
 * Narrows a minted installation token to the repositories and permissions a
 * caller actually needs.
 *
 * A token minted with no scope carries every permission and every repository
 * the installation grants, for an hour. That is acceptable inside this process
 * and unacceptable anywhere the token is written down where other code can read
 * it, which is what handing one to a sandbox does.
 */
export interface GitHubTokenScope {
  /** Repository names, not `owner/name`: GitHub scopes by name within the installation account. */
  repositories: readonly string[];
  permissions: Readonly<Record<string, 'read' | 'write'>>;
}

export async function getInstallationAccessToken(
  installationId: number,
  scope?: GitHubTokenScope,
): Promise<string> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error('Invalid GitHub installation id');
  }
  if (!isGitHubInstallationLinkingAvailable()) {
    throw new Error(
      'GitHub installation ownership has not been verified; refusing to mint an access token',
    );
  }
  if (scope && scope.repositories.length === 0) {
    throw new Error('A scoped GitHub token must name at least one repository');
  }

  const db = getNeonDb();

  const rows = await db.query<{
    access_token_enc: string | null;
    access_token_expires_at: string | null;
    ownership_verified_at: string | null;
  }>(
    `SELECT access_token_enc, access_token_expires_at, ownership_verified_at
       FROM github_installations
      WHERE installation_id = $1
        AND ownership_verified_at IS NOT NULL
      LIMIT 1`,
    [installationId],
  );
  const installation = rows[0] ?? null;
  if (!installation?.ownership_verified_at) {
    throw new Error('GitHub installation ownership has not been verified');
  }

  // The cached token is the unscoped one. Serving it for a scoped request would
  // hand back exactly the credential the scope exists to avoid, and caching a
  // scoped token under the same column would widen the next unscoped caller's
  // answer down to this scope. Scoped tokens are therefore always minted fresh
  // and never written down.
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (
    !scope &&
    installation?.access_token_enc &&
    installation?.access_token_expires_at &&
    new Date(installation.access_token_expires_at) > fiveMinFromNow
  ) {
    return decryptToken(installation.access_token_enc);
  }

  const jwt = await getGitHubAppJwt();
  const res = await fetch(
    buildGitHubApiUrl(
      `/app/installations/${encodeURIComponent(String(installationId))}/access_tokens`,
    ),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(scope ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(scope
        ? {
            body: JSON.stringify({
              repositories: [...scope.repositories],
              permissions: { ...scope.permissions },
            }),
          }
        : {}),
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to get installation token: ${res.status}`);
  }

  const parsed = gitHubInstallationTokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error('GitHub installation token response was invalid');
  }
  const { token, expires_at } = parsed.data;

  if (scope) return token;

  await db.execute(
    `UPDATE github_installations
        SET access_token_enc = $1, access_token_expires_at = $2
      WHERE installation_id = $3
        AND ownership_verified_at IS NOT NULL`,
    [encryptToken(token), expires_at, installationId],
  );

  return token;
}

const gitHubInstallationRepositorySchema = z.object({
  full_name: z.string().min(1).max(512),
  name: z.string().min(1).max(255),
  private: z.boolean(),
  default_branch: z.string().min(1).max(255).nullish(),
  owner: z.object({ login: z.string().min(1).max(255) }),
});

const gitHubInstallationRepositoriesResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(gitHubInstallationRepositorySchema),
});

export interface GitHubInstallationRepository {
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  isPrivate: boolean;
}

export interface ListInstallationRepositoriesResult {
  repositories: GitHubInstallationRepository[];
  truncated: boolean;
}

/**
 * Raised when an installation row carries no proved repository set, which is
 * every row linked before 0188. Listing or cloning on such a row would hand the
 * caller the whole installation on the strength of one repository, so it is
 * refused until the owner reconnects.
 */
export class GitHubInstallationUnverifiedError extends Error {
  constructor(readonly installationId: number) {
    super(
      'This GitHub connection was made before repository access was checked. Reconnect it to list its repositories.',
    );
    this.name = 'GitHubInstallationUnverifiedError';
  }
}

export function assertRepositoryIsVerified(
  installationId: number,
  verifiedRepositories: readonly string[] | null,
  fullName: string,
): void {
  if (verifiedRepositories === null) throw new GitHubInstallationUnverifiedError(installationId);
  if (!verifiedRepositories.includes(fullName.toLowerCase())) {
    throw new Error('That repository is not one this GitHub connection proved access to');
  }
}

/**
 * The repositories one installation grants this app, narrowed to the ones the
 * linking account proved it can reach, as the picker lists them.
 *
 * The caller must have already proved the installation belongs to the signed-in
 * account: {@link getInstallationAccessToken} checks only that the row is
 * ownership-verified, so an unchecked id from a request body would mint a token
 * for someone else's installation. `/installation/repositories` then answers at
 * full installation scope, which is wider than the caller's own GitHub access,
 * so `verifiedRepositories` from the same row is the bound applied here. A null
 * set is refused rather than treated as "everything".
 */
export async function listInstallationRepositories(
  installationId: number,
  limits: { maxItems: number; maxPages: number; perPage: number },
  verifiedRepositories: readonly string[] | null,
): Promise<ListInstallationRepositoriesResult> {
  if (verifiedRepositories === null) throw new GitHubInstallationUnverifiedError(installationId);
  const allowed = new Set(verifiedRepositories);
  const token = await getInstallationAccessToken(installationId);
  const collected = await collectGitHubRestPages({
    perPage: limits.perPage,
    maxPages: limits.maxPages,
    maxItems: limits.maxItems,
    loadPage: async (page) => {
      const response = await fetch(
        buildGitHubApiUrl(`/installation/repositories?per_page=${limits.perPage}&page=${page}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
          signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to list GitHub repositories: ${response.status}`);
      }
      const parsed = gitHubInstallationRepositoriesResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error('GitHub repository listing response was invalid');
      }
      return {
        items: parsed.data.repositories,
        totalCount: parsed.data.total_count,
        linkHeader: response.headers.get('link'),
      };
    },
  });

  return {
    truncated: collected.truncated,
    repositories: collected.items
      .filter((repository) => allowed.has(repository.full_name.toLowerCase()))
      .map((repository) => ({
        installationId,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch ?? null,
        isPrivate: repository.private,
      })),
  };
}

const MAX_GITHUB_ERROR_LENGTH = 500;

/**
 * Carries GitHub's own status and body so the caller can tell a refusal it can
 * answer (a pull request that already exists, a head with no commits on it)
 * from one it cannot.
 */
export class GitHubPullRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`GitHub refused the pull request: ${status}`);
    this.name = 'GitHubPullRequestError';
  }
}

const gitHubRepositorySchema = z.object({
  default_branch: z.string().min(1).max(255),
});

const gitHubPullRequestSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.string().url(),
});

export interface GitHubPullRequest {
  number: number;
  url: string;
}

export interface CreateGitHubPullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  /** Opens the pull request as a draft, so nothing requests review yet. */
  draft?: boolean;
}

export async function getGitHubRepositoryDefaultBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<string> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const response = await fetch(
    buildGitHubApiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to read the repository default branch: ${response.status}`);
  }
  const parsed = gitHubRepositorySchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('GitHub repository response was invalid');
  }
  return parsed.data.default_branch;
}

/**
 * The pull request already open from `head`, if there is one. GitHub refuses a
 * second pull request for the same head with a 422 that carries no id, so this
 * is what turns that refusal into the caller's own already-open answer instead
 * of an error the reader cannot act on.
 */
export async function findOpenGitHubPullRequest(
  token: string,
  owner: string,
  repo: string,
  head: string,
): Promise<GitHubPullRequest | null> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const response = await fetch(
    buildGitHubApiUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}`,
    ),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to look up an open pull request: ${response.status}`);
  }
  const parsed = z.array(gitHubPullRequestSchema).safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('GitHub pull request listing response was invalid');
  }
  const match = parsed.data[0];
  return match ? { number: match.number, url: match.html_url } : null;
}

export async function createGitHubPullRequest(
  token: string,
  input: CreateGitHubPullRequestInput,
): Promise<GitHubPullRequest> {
  validateGitHubPathSegment(input.owner, 'owner');
  validateGitHubPathSegment(input.repo, 'repo');
  const response = await fetch(
    buildGitHubApiUrl(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls`,
    ),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft === true,
      }),
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new GitHubPullRequestError(response.status, detail.slice(0, MAX_GITHUB_ERROR_LENGTH));
  }
  const parsed = gitHubPullRequestSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('GitHub pull request response was invalid');
  }
  return { number: parsed.data.number, url: parsed.data.html_url };
}

const GITHUB_UNAUTHORIZED_STATUSES = new Set([401, 403]);

/**
 * GitHub refused the credential itself. The installation's permissions can be
 * narrowed or revoked at any time by someone who is not the AGI user, so this
 * is separated from every other failure: it is the one the reader fixes by
 * reauthorizing rather than by retrying.
 */
export class GitHubAuthorizationRevokedError extends Error {
  constructor(
    readonly status: number,
    readonly installUrl: string | null,
  ) {
    super(
      'GitHub refused this connection. Reauthorize the AGI Workforce GitHub App to restore access.',
    );
    this.name = 'GitHubAuthorizationRevokedError';
  }
}

function assertGitHubResponseAuthorized(status: number): void {
  if (!GITHUB_UNAUTHORIZED_STATUSES.has(status)) return;
  throw new GitHubAuthorizationRevokedError(status, getGitHubAppInstallUrl());
}

function githubNumberSegment(value: number, label: string): string {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return String(value);
}

const gitHubPullRequestStatusSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean().optional(),
  merged: z.boolean().optional(),
  mergeable: z.boolean().nullish(),
  mergeable_state: z.string().nullish(),
  head: z.object({ sha: z.string().min(1).max(64) }),
  body: z.string().nullish(),
});

const gitHubReviewsSchema = z.array(
  z.object({ state: z.string().min(1).max(64), submitted_at: z.string().nullish() }),
);

const gitHubCheckRunsSchema = z.object({
  check_runs: z.array(
    z.object({
      name: z.string().min(1).max(255),
      status: z.string().min(1).max(32),
      conclusion: z.string().nullish(),
    }),
  ),
});

export type GitHubChecksState = 'passing' | 'failing' | 'pending' | 'none';
export type GitHubReviewState = 'approved' | 'changes_requested' | 'commented' | 'none';

export interface GitHubPullRequestStatus {
  number: number;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  mergeableState: string | null;
  headSha: string;
  reviewState: GitHubReviewState;
  checksState: GitHubChecksState;
  failedChecks: string[];
  linkedIssues: string[];
}

const REVIEW_STATE_RANK: Readonly<Record<string, number>> = Object.freeze({
  CHANGES_REQUESTED: 3,
  APPROVED: 2,
  COMMENTED: 1,
});

const LINKED_ISSUE_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+))?#(\d{1,7})\b/gi;

/** The issues a pull request body says it closes, as GitHub itself reads them. */
export function parseLinkedIssues(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(LINKED_ISSUE_RE)) {
    const reference = `${match[1] ?? ''}#${match[2]}`;
    if (!found.includes(reference)) found.push(reference);
  }
  return found;
}

async function readGitHubJson(token: string, path: string, label: string): Promise<unknown> {
  const response = await fetch(buildGitHubApiUrl(path), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    assertGitHubResponseAuthorized(response.status);
    throw new Error(`Failed to ${label}: ${response.status}`);
  }
  return response.json();
}

/**
 * Everything a reader needs to say where a pull request stands: whether it is a
 * draft, what reviewers decided, whether CI is green, and whether it merged.
 */
export async function getGitHubPullRequestStatus(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubPullRequestStatus> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const number = githubNumberSegment(prNumber, 'pull request number');
  const parsed = gitHubPullRequestStatusSchema.safeParse(
    await readGitHubJson(token, `${base}/pulls/${number}`, 'read the pull request'),
  );
  if (!parsed.success) throw new Error('GitHub pull request response was invalid');

  const reviews = gitHubReviewsSchema.safeParse(
    await readGitHubJson(
      token,
      `${base}/pulls/${number}/reviews?per_page=100`,
      'list pull request reviews',
    ),
  );
  let reviewRank = 0;
  let reviewState: GitHubReviewState = 'none';
  for (const review of reviews.success ? reviews.data : []) {
    const rank = REVIEW_STATE_RANK[review.state.toUpperCase()] ?? 0;
    if (rank <= reviewRank) continue;
    reviewRank = rank;
    reviewState = review.state.toLowerCase() as GitHubReviewState;
  }

  const checks = gitHubCheckRunsSchema.safeParse(
    await readGitHubJson(
      token,
      `${base}/commits/${encodeURIComponent(parsed.data.head.sha)}/check-runs?per_page=100`,
      'list check runs',
    ),
  );
  const runs = checks.success ? checks.data.check_runs : [];
  const failedChecks = runs
    .filter((run) => run.conclusion !== null && run.conclusion !== undefined)
    .filter((run) => !['success', 'neutral', 'skipped'].includes(run.conclusion ?? ''))
    .map((run) => run.name);
  const pending = runs.some((run) => run.status !== 'completed');
  const checksState: GitHubChecksState =
    runs.length === 0
      ? 'none'
      : failedChecks.length > 0
        ? 'failing'
        : pending
          ? 'pending'
          : 'passing';

  return {
    number: parsed.data.number,
    state: parsed.data.state,
    draft: parsed.data.draft === true,
    merged: parsed.data.merged === true,
    mergeableState: parsed.data.mergeable_state ?? null,
    headSha: parsed.data.head.sha,
    reviewState,
    checksState,
    failedChecks,
    linkedIssues: parseLinkedIssues(parsed.data.body ?? ''),
  };
}

const MAX_GITHUB_ISSUE_BODY_LENGTH = 20_000;
const GITHUB_ISSUES_PER_PAGE_MAX = 100;

const gitHubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(1024),
  body: z.string().nullish(),
  state: z.enum(['open', 'closed']),
  html_url: z.string().url(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])).default([]),
  pull_request: z.unknown().optional(),
});

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  url: string;
  labels: string[];
}

function toGitHubIssue(raw: z.infer<typeof gitHubIssueSchema>): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: (raw.body ?? '').slice(0, MAX_GITHUB_ISSUE_BODY_LENGTH),
    state: raw.state,
    url: raw.html_url,
    labels: raw.labels.map((label) => (typeof label === 'string' ? label : label.name)),
  };
}

/**
 * Open issues on a repository. `/issues` also answers with pull requests, which
 * carry a `pull_request` key; they are dropped so a caller asking for issues
 * never gets a pull request wearing an issue's shape.
 */
export async function listGitHubIssues(
  token: string,
  owner: string,
  repo: string,
  options: { state?: 'open' | 'closed' | 'all'; perPage?: number; labels?: string } = {},
): Promise<GitHubIssue[]> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const perPage = Math.min(Math.max(options.perPage ?? 30, 1), GITHUB_ISSUES_PER_PAGE_MAX);
  const query = new URLSearchParams({ state: options.state ?? 'open', per_page: String(perPage) });
  if (options.labels) query.set('labels', options.labels);
  const parsed = z
    .array(gitHubIssueSchema)
    .safeParse(
      await readGitHubJson(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query.toString()}`,
        'list issues',
      ),
    );
  if (!parsed.success) throw new Error('GitHub issue listing response was invalid');
  return parsed.data.filter((raw) => raw.pull_request === undefined).map(toGitHubIssue);
}

export async function getGitHubIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const parsed = gitHubIssueSchema.safeParse(
    await readGitHubJson(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${githubNumberSegment(issueNumber, 'issue number')}`,
      'read the issue',
    ),
  );
  if (!parsed.success) throw new Error('GitHub issue response was invalid');
  return toGitHubIssue(parsed.data);
}

export async function getPrDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const res = await fetch(
    buildGitHubApiUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}`,
    ),
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.diff',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!res.ok) {
    assertGitHubResponseAuthorized(res.status);
    throw new Error(`Failed to fetch PR diff: ${res.status}`);
  }

  let diff = await res.text();
  // The reviewer chunks what it gets, so this is a memory bound rather than a
  // review bound. At 50,000 it was the review bound, and everything past the
  // first few files went unreviewed without anyone being told.
  const MAX_CHARS = 300_000;
  if (diff.length > MAX_CHARS) {
    diff = diff.substring(0, MAX_CHARS) + `\n\n[... diff truncated at ${MAX_CHARS} characters ...]`;
  }
  return diff;
}

export interface GitHubReviewLineComment {
  path: string;
  /** Line in the head revision. GitHub rejects one that is not in the diff. */
  line: number;
  body: string;
}

export async function postPrReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' = 'COMMENT',
  comments: readonly GitHubReviewLineComment[] = [],
): Promise<void> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const res = await fetch(
    buildGitHubApiUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}/reviews`,
    ),
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        body,
        event,
        ...(comments.length > 0
          ? {
              comments: comments.map((comment) => ({
                path: comment.path,
                line: comment.line,
                side: 'RIGHT',
                body: comment.body,
              })),
            }
          : {}),
      }),
    },
  );
  if (!res.ok) {
    assertGitHubResponseAuthorized(res.status);
    throw new Error(`Failed to post PR review: ${res.status}`);
  }
}

const REVIEW_COMMENT_PAGE_SIZE = 100;
const MAX_REVIEW_COMMENT_PAGES = 10;

/**
 * Bodies of the line comments already on this pull request.
 *
 * The pull request is the authority on what has been said, not our own attempt
 * table: a redeploy, a lost row or a second installation would otherwise post
 * the same comment again on every push.
 */
export async function listPrReviewCommentBodies(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string[]> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const bodies: string[] = [];
  for (let page = 1; page <= MAX_REVIEW_COMMENT_PAGES; page += 1) {
    const res = await fetch(
      buildGitHubApiUrl(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}/comments?per_page=${REVIEW_COMMENT_PAGE_SIZE}&page=${page}`,
      ),
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) throw new Error(`Failed to list PR review comments: ${res.status}`);
    const batch = (await res.json()) as Array<{ body?: unknown }>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const comment of batch) {
      if (typeof comment.body === 'string') bodies.push(comment.body);
    }
    if (batch.length < REVIEW_COMMENT_PAGE_SIZE) break;
  }
  return bodies;
}

export async function postIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  validateGitHubPathSegment(owner, 'owner');
  validateGitHubPathSegment(repo, 'repo');
  const res = await fetch(
    buildGitHubApiUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(String(issueNumber))}/comments`,
    ),
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    assertGitHubResponseAuthorized(res.status);
    throw new Error(`Failed to post comment: ${res.status}`);
  }
}

export function generateGitHubInstallState(): string {
  return randomBytes(32).toString('hex');
}

export { GITHUB_WEBHOOK_SECRET };

import 'server-only';
import { createHmac, timingSafeEqual, randomBytes, createSign } from 'crypto';
import { z } from 'zod';
import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';
import { getNeonDb } from '@/lib/server/neon-db';
import { findInGitHubRestPages } from './github-rest-pagination';

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

export interface VerifiedGitHubInstallation {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
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

  return match
    ? {
        installationId: match.id,
        accountLogin: match.account.login,
        accountType: match.account.type,
      }
    : null;
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

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error('Invalid GitHub installation id');
  }
  if (!isGitHubInstallationLinkingAvailable()) {
    throw new Error(
      'GitHub installation ownership has not been verified; refusing to mint an access token',
    );
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

  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (
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
      },
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

  await db.execute(
    `UPDATE github_installations
        SET access_token_enc = $1, access_token_expires_at = $2
      WHERE installation_id = $3
        AND ownership_verified_at IS NOT NULL`,
    [encryptToken(token), expires_at, installationId],
  );

  return token;
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

  if (!res.ok) throw new Error(`Failed to fetch PR diff: ${res.status}`);

  let diff = await res.text();
  const MAX_CHARS = 50000;
  if (diff.length > MAX_CHARS) {
    diff = diff.substring(0, MAX_CHARS) + '\n\n[... diff truncated at 50,000 characters ...]';
  }
  return diff;
}

export async function postPrReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' = 'COMMENT',
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
      body: JSON.stringify({ body, event }),
    },
  );
  if (!res.ok) throw new Error(`Failed to post PR review: ${res.status}`);
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
  if (!res.ok) throw new Error(`Failed to post comment: ${res.status}`);
}

export function generateGitHubInstallState(): string {
  return randomBytes(32).toString('hex');
}

export { GITHUB_WEBHOOK_SECRET };

import 'server-only';
import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createSign,
} from 'crypto';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * SECURITY: Validate GitHub API path segments to prevent SSRF and path traversal.
 * Only allows alphanumeric, hyphen, underscore, and dot - the valid characters
 * for GitHub owner/repo names.
 */
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

/**
 * Build a GitHub App JWT using Node.js built-in crypto (RS256).
 * jose is not available in this project - we implement manually.
 */
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

// Cache the dev fallback key so encrypt/decrypt use the same key within a process
let _devFallbackKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const keyHex = GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    // Fallback for development - in production GITHUB_TOKEN_ENCRYPTION_KEY must be set
    if (!_devFallbackKey) {
      _devFallbackKey = randomBytes(32);
    }
    return _devFallbackKey;
  }
  return Buffer.from(keyHex, 'hex');
}

function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

function decryptToken(encryptedValue: string): string {
  const key = getEncryptionKey();
  const [ivHex, dataHex, tagHex] = encryptedValue.split(':');
  if (!ivHex || !dataHex || !tagHex) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const supabase = await createSupabaseServerClient();

  // Check cached token
  const { data: installation } = await supabase
    .from('github_installations')
    .select('access_token_enc, access_token_expires_at')
    .eq('installation_id', installationId)
    .single();

  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (
    installation?.access_token_enc &&
    installation?.access_token_expires_at &&
    new Date(installation.access_token_expires_at) > fiveMinFromNow
  ) {
    return decryptToken(installation.access_token_enc);
  }

  // Fetch new installation token
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
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to get installation token: ${res.status}`);
  }

  const { token, expires_at } = (await res.json()) as { token: string; expires_at: string };

  // Cache encrypted token
  await supabase
    .from('github_installations')
    .update({
      access_token_enc: encryptToken(token),
      access_token_expires_at: expires_at,
    })
    .eq('installation_id', installationId);

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

/**
 * Generate a cryptographically random state parameter for GitHub App installation.
 * The caller must set this as a cookie (`github_install_state`) before redirecting
 * the user to GitHub. The callback handler in /api/github/install validates it.
 */
export function generateGitHubInstallState(): string {
  return randomBytes(32).toString('hex');
}

export { GITHUB_WEBHOOK_SECRET };

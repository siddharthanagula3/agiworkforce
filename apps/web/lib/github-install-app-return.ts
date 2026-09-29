import 'server-only';

import { GITHUB_INSTALL_APP_LINK_RETURN_URL } from '@agiworkforce/cloud-contracts';
import { generatePkcePair, hashOAuthState } from '@/lib/connectors/pkce';
import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { generateGitHubInstallState, type VerifiedGitHubInstallation } from '@/lib/github-app';
import { getNeonDb } from '@/lib/server/neon-db';

const APP_INSTALL_TTL_MINUTES = 10;

const VERIFIER_PURPOSE = 'oauth-code-verifier';

export interface AppInstallAuthorization {
  oauthState: string;
  codeChallenge: string;
}

export interface ConsumedAppInstall {
  installationId: number;
  codeVerifier: string;
}

export async function startAppInstall(userId: string): Promise<string> {
  const state = generateGitHubInstallState();
  const db = getNeonDb();
  await db.query(
    `delete from public.github_install_authorizations
      where user_id = $1
        and (expires_at < now() or consumed_at is not null)`,
    [userId],
  );
  await db.query(
    `insert into public.github_install_authorizations (user_id, install_state_hash, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [userId, hashOAuthState(state), APP_INSTALL_TTL_MINUTES],
  );
  return state;
}

export async function recordAppInstallation(
  installState: string,
  installationId: number,
): Promise<AppInstallAuthorization | null> {
  const oauthState = generateGitHubInstallState();
  const pkce = generatePkcePair();
  const rows = await getNeonDb().query<{ user_id: string }>(
    `update public.github_install_authorizations
        set installation_id = $2,
            oauth_state_hash = $3,
            code_verifier_enc = $4
      where install_state_hash = $1
        and installation_id is null
        and consumed_at is null
        and expires_at > now()
      returning user_id`,
    [
      hashOAuthState(installState),
      installationId,
      hashOAuthState(oauthState),
      encryptConnectorToken(pkce.verifier, VERIFIER_PURPOSE),
    ],
  );
  return rows.length > 0 ? { oauthState, codeChallenge: pkce.challenge } : null;
}

export async function appInstallOwner(oauthState: string): Promise<string | null> {
  const rows = await getNeonDb().query<{ user_id: string }>(
    `select user_id
       from public.github_install_authorizations
      where oauth_state_hash = $1
        and consumed_at is null
        and expires_at > now()
      limit 1`,
    [hashOAuthState(oauthState)],
  );
  return rows[0]?.user_id ?? null;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export async function appInstallRequester(installState: string): Promise<string | null> {
  const db = getNeonDb();
  const rows = await db.query<{ user_id: string }>(
    `select user_id
       from public.github_install_authorizations
      where install_state_hash = $1
        and installation_id is null
        and consumed_at is null
        and expires_at > now()
      limit 1`,
    [hashOAuthState(installState)],
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  const profiles = await db.query<{ email: string | null }>(
    'select email from public.profiles where id = $1 limit 1',
    [userId],
  );
  const email = profiles[0]?.email;
  return email ? maskEmail(email) : 'an AGI Workforce account';
}

export async function pendingAppInstallation(
  userId: string,
  oauthState: string,
): Promise<number | null> {
  const rows = await getNeonDb().query<{ installation_id: string | number }>(
    `select installation_id
       from public.github_install_authorizations
      where oauth_state_hash = $1
        and user_id = $2
        and installation_id is not null
        and consumed_at is null
        and expires_at > now()
      limit 1`,
    [hashOAuthState(oauthState), userId],
  );
  const installationId = Number(rows[0]?.installation_id);
  return Number.isSafeInteger(installationId) && installationId > 0 ? installationId : null;
}

export async function consumeAppInstall(
  userId: string,
  oauthState: string,
): Promise<ConsumedAppInstall | null> {
  const rows = await getNeonDb().query<{
    installation_id: string | number;
    code_verifier_enc: string | null;
  }>(
    `update public.github_install_authorizations
        set consumed_at = now()
      where oauth_state_hash = $1
        and user_id = $2
        and installation_id is not null
        and code_verifier_enc is not null
        and consumed_at is null
        and expires_at > now()
      returning installation_id, code_verifier_enc`,
    [hashOAuthState(oauthState), userId],
  );
  const row = rows[0];
  const installationId = Number(row?.installation_id);
  if (!row?.code_verifier_enc || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return null;
  }
  try {
    return {
      installationId,
      codeVerifier: decryptConnectorToken(row.code_verifier_enc, VERIFIER_PURPOSE),
    };
  } catch {
    return null;
  }
}

export function appInstallReturnUrl(params: Readonly<Record<string, string | null>>): URL {
  const target = new URL(GITHUB_INSTALL_APP_LINK_RETURN_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value) target.searchParams.set(key, value);
  }
  return target;
}

export async function linkVerifiedGitHubInstallation(
  userId: string,
  installation: VerifiedGitHubInstallation,
): Promise<boolean> {
  const rows = await getNeonDb().query<{ id: string }>(
    `insert into github_installations (
       user_id,
       installation_id,
       account_login,
       account_type,
       verified_repositories,
       ownership_verified_at
     )
     values ($1, $2, $3, $4, $5, now())
     on conflict (installation_id)
     do update set
       user_id = excluded.user_id,
       account_login = excluded.account_login,
       account_type = excluded.account_type,
       verified_repositories = excluded.verified_repositories,
       ownership_verified_at = now(),
       access_token_enc = null,
       access_token_expires_at = null
     where github_installations.ownership_verified_at is null
        or github_installations.user_id = excluded.user_id
     returning id`,
    [
      userId,
      installation.installationId,
      installation.accountLogin,
      installation.accountType,
      installation.verifiedRepositories,
    ],
  );
  return rows.length > 0;
}

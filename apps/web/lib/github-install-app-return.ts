import 'server-only';

import {
  GITHUB_INSTALL_APP_LINK_RETURN_URL,
  GITHUB_INSTALL_APP_RETURN_URL,
} from '@agiworkforce/cloud-contracts';
import { generatePkcePair, hashOAuthState } from '@/lib/connectors/pkce';
import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { generateGitHubInstallState, type VerifiedGitHubInstallation } from '@/lib/github-app';
import { getNeonDb } from '@/lib/server/neon-db';

const APP_INSTALL_TTL_MINUTES = 10;

const VERIFIER_PURPOSE = 'oauth-code-verifier';

export type AppInstallReturnTarget = 'app_scheme' | 'app_link';

export interface AppInstallReturn {
  userId: string;
  returnTarget: AppInstallReturnTarget;
}

export interface AppInstallAuthorization {
  oauthState: string;
  codeChallenge: string;
  returnTarget: AppInstallReturnTarget;
}

export interface ConsumedAppInstall {
  installationId: number;
  codeVerifier: string;
}

export async function startAppInstall(
  userId: string,
  returnTarget: AppInstallReturnTarget,
): Promise<string> {
  const state = generateGitHubInstallState();
  const db = getNeonDb();
  await db.query(
    `delete from public.github_install_authorizations
      where user_id = $1
        and (expires_at < now() or consumed_at is not null)`,
    [userId],
  );
  await db.query(
    `insert into public.github_install_authorizations
       (user_id, install_state_hash, expires_at, return_target)
     values ($1, $2, now() + make_interval(mins => $3), $4)`,
    [userId, hashOAuthState(state), APP_INSTALL_TTL_MINUTES, returnTarget],
  );
  return state;
}

export async function recordAppInstallation(
  installState: string,
  installationId: number,
): Promise<AppInstallAuthorization | null> {
  const oauthState = generateGitHubInstallState();
  const pkce = generatePkcePair();
  const rows = await getNeonDb().query<{ user_id: string; return_target: string }>(
    `update public.github_install_authorizations
        set installation_id = $2,
            oauth_state_hash = $3,
            code_verifier_enc = $4
      where install_state_hash = $1
        and installation_id is null
        and consumed_at is null
        and expires_at > now()
      returning user_id, return_target`,
    [
      hashOAuthState(installState),
      installationId,
      hashOAuthState(oauthState),
      encryptConnectorToken(pkce.verifier, VERIFIER_PURPOSE),
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    oauthState,
    codeChallenge: pkce.challenge,
    returnTarget: row.return_target === 'app_link' ? 'app_link' : 'app_scheme',
  };
}

export async function appInstallReturn(oauthState: string): Promise<AppInstallReturn | null> {
  const rows = await getNeonDb().query<{ user_id: string; return_target: string }>(
    `select user_id, return_target
       from public.github_install_authorizations
      where oauth_state_hash = $1
        and consumed_at is null
        and expires_at > now()
      limit 1`,
    [hashOAuthState(oauthState)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    returnTarget: row.return_target === 'app_link' ? 'app_link' : 'app_scheme',
  };
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

export function appInstallReturnUrl(
  returnTarget: AppInstallReturnTarget,
  params: Readonly<Record<string, string | null>>,
): URL {
  const target = new URL(
    returnTarget === 'app_link'
      ? GITHUB_INSTALL_APP_LINK_RETURN_URL
      : GITHUB_INSTALL_APP_RETURN_URL,
  );
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

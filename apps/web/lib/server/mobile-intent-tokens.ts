import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';

const TOKEN_PREFIX = 'agi_it_';
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^agi_it_[A-Za-z0-9_-]{43}$/;
const TOKEN_LIFETIME_DAYS = 30;

export interface MobileIntentTokenOwner {
  tokenId: string;
  userId: string;
  organizationId: string | null;
  installId: string;
  defaultModelId: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueMobileIntentToken(
  db: DatabaseAdapter,
  owner: {
    userId: string;
    organizationId: string | null;
    installId: string;
    defaultModelId: string | null;
  },
): Promise<{ token: string; tokenId: string }> {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
  const tokenId = await db.transaction(async (tx) => {
    await tx.execute(
      `update public.mobile_intent_tokens
          set revoked_at = now()
        where user_id = $1 and install_id = $2 and revoked_at is null`,
      [owner.userId, owner.installId],
    );
    const inserted = await tx.query<{ id: string }>(
      `insert into public.mobile_intent_tokens
         (user_id, organization_id, install_id, token_hash, default_model_id, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       returning id`,
      [
        owner.userId,
        owner.organizationId,
        owner.installId,
        hashToken(token),
        owner.defaultModelId,
        TOKEN_LIFETIME_DAYS,
      ],
    );
    const id = inserted[0]?.id;
    if (!id) throw new Error('The Ask from Siri token was not stored');
    return id;
  });
  return { token, tokenId };
}

export async function revokeMobileIntentTokens(
  db: DatabaseAdapter,
  userId: string,
  installId: string | null,
): Promise<void> {
  await db.execute(
    `update public.mobile_intent_tokens
        set revoked_at = now()
      where user_id = $1
        and revoked_at is null
        and ($2::text is null or install_id = $2)`,
    [userId, installId],
  );
}

export async function revokeMobileIntentTokenById(
  db: DatabaseAdapter,
  userId: string,
  tokenId: string,
): Promise<void> {
  await db.execute(
    `update public.mobile_intent_tokens
        set revoked_at = now()
      where user_id = $1 and id = $2 and revoked_at is null`,
    [userId, tokenId],
  );
}

export async function revokeOrganizationMobileIntentTokens(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `update public.mobile_intent_tokens
        set revoked_at = now()
      where user_id = $1 and organization_id = $2 and revoked_at is null
      returning id`,
    [userId, organizationId],
  );
  return rows.length;
}

export async function revokeSessionMobileIntentTokens(
  db: DatabaseAdapter,
  userId: string,
  identitySessionId: string,
): Promise<void> {
  await db.execute(
    `update public.mobile_intent_tokens
        set revoked_at = now()
      where user_id = $1
        and revoked_at is null
        and install_id in (
          select install_id from public.device_registrations
           where user_id = $1 and surface = 'mobile' and identity_session_id = $2
        )`,
    [userId, identitySessionId],
  );
}

export async function resolveMobileIntentToken(
  token: string,
): Promise<MobileIntentTokenOwner | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const rows = await getNeonDb().query<{
    id: string;
    user_id: string;
    organization_id: string | null;
    install_id: string;
    default_model_id: string | null;
  }>(
    `update public.mobile_intent_tokens
        set last_used_at = now()
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
        and capability = 'chat_completion'
      returning id, user_id, organization_id, install_id, default_model_id`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row
    ? {
        tokenId: row.id,
        userId: row.user_id,
        organizationId: row.organization_id,
        installId: row.install_id,
        defaultModelId: row.default_model_id,
      }
    : null;
}

export async function revokeEveryMobileIntentToken(userId: string): Promise<void> {
  await revokeMobileIntentTokens(getNeonDb(), userId, null);
}

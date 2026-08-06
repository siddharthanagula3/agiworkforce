/**
 * @file Executor: regenerate one of the CALLER'S OWN API keys.
 *
 * SCOPE IS NEVER ESCALATED. The replacement is created with the same `name`
 * and the same `scopes` read from the caller's existing row. Neither value can
 * come from a request body or from the model, so there is no path by which
 * "regenerate my key" quietly widens what that key can do.
 *
 * The returned key is LIVE CREDENTIAL MATERIAL. It is returned once, marked
 * `doNotPersist: true`, and must never be written into a support transcript, an
 * escalation email, an audit detail, or a model prompt. See the note on
 * `SupportActionResult` in ../types.ts.
 */

import 'server-only';

import { resolveApiKeyScopes, type ApiKeyScope } from '@/lib/api-key-scopes';
import { getNeonDb } from '@/lib/server/neon-db';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { SupportActionRefusal, type SupportActionResult } from '../types';

interface OwnedKeyRow {
  id: string;
  name: string;
  /** `api_keys.scopes` is a text[]; a legacy row can be null. */
  scopes: string[] | null;
}

async function readOwnedKey(userId: string, keyId: string): Promise<OwnedKeyRow | null> {
  const db = getNeonDb();
  // The `user_id = $2` predicate is the authorization. It is present on the
  // READ, so a key belonging to someone else is invisible rather than merely
  // un-mutated — the executor never learns it exists.
  const [row] = await db.query<OwnedKeyRow>(
    `select id, name, scopes
       from public.api_keys
      where id = $1 and user_id = $2 and revoked_at is null
      limit 1`,
    [keyId, userId],
  );
  return row ?? null;
}

/**
 * Ownership pre-check, run at PROPOSE time and again after the token claim.
 * Between the two the key may have been revoked elsewhere, so the second call
 * is the one that decides whether the mutation runs.
 */
export async function assertApiKeyOwned(userId: string, keyId: string): Promise<void> {
  const row = await readOwnedKey(userId, keyId);
  if (!row) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_TARGET_NOT_FOUND',
      404,
      'That API key is not on your account, or it has already been revoked.',
    );
  }
}

export async function executeRegenerateApiKey(args: {
  userId: string;
  keyId: string;
}): Promise<SupportActionResult> {
  const { userId, keyId } = args;
  const existing = await readOwnedKey(userId, keyId);
  if (!existing) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_TARGET_NOT_FOUND',
      404,
      'That API key is not on your account, or it has already been revoked.',
    );
  }

  const db = getNeonDb();
  // `resolveApiKeyScopes` is the SAME resolver the auth path uses to decide what
  // a stored row may do (`apiKeyHasScope` in lib/api-auth.ts). Reusing it means
  // the replacement's scopes are exactly the old key's EFFECTIVE scopes — not a
  // wider set and not a narrower one — including for the legacy empty/null case
  // that already resolves to the full set at authorization time.
  const scopes: ApiKeyScope[] = resolveApiKeyScopes(existing.scopes ?? []);

  // Only reachable when the stored row carries scopes that are ALL unrecognised
  // — a key from a retired scope vocabulary. `createApiKey` would throw a raw
  // error and surface as a 500 after the user already confirmed. Refuse with an
  // explanation instead, and do not invent a scope set to replace it with.
  if (scopes.length === 0) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNAVAILABLE',
      409,
      'That key uses a set of permissions this version no longer issues, so it cannot be regenerated automatically. Create a replacement in Settings and revoke the old one there.',
    );
  }

  // Revoke first. If creation then fails the user is left with one fewer key,
  // which is the safe direction: a key the user asked to rotate is never left
  // live after the rotation was confirmed.
  await ApiKeyService.revokeApiKey(db, existing.id, userId);
  const { apiKey, rawKey } = await ApiKeyService.createApiKey(db, userId, existing.name, scopes);

  return {
    kind: 'secret_once',
    message:
      'Your old key is revoked and a new one is issued with the same name and scopes. Copy it now — it is not shown again and is not stored in plain text.',
    apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.key_prefix },
    fullKey: rawKey,
    doNotPersist: true,
  };
}

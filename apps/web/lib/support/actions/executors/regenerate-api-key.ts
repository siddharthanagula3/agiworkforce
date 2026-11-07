import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveApiKeyScopes, type ApiKeyScope } from '@/lib/api-key-scopes';
import { ApiKeyService, apiKeyExpiryProblem } from '@/lib/services/api-key-service';
import { isUuid } from '@/lib/uuid';
import { SupportActionRefusal, type SupportActionResult } from '../types';

interface OwnedKeyRow {
  id: string;
  name: string;
  scopes: string[] | null;
  expires_at: string | Date | null;
  project_id: string | null;
}

async function readOwnedKey(
  db: DatabaseAdapter,
  userId: string,
  keyId: string,
  lock = false,
): Promise<OwnedKeyRow | null> {
  const [row] = await db.query<OwnedKeyRow>(
    `select id, name, scopes, expires_at, project_id
       from public.api_keys
      where id = $1 and user_id = $2 and revoked_at is null
      limit 1${lock ? ' for update' : ''}`,
    [keyId, userId],
  );
  return row ?? null;
}

export async function assertApiKeyOwned(
  db: DatabaseAdapter,
  userId: string,
  keyId: string,
): Promise<void> {
  const row = await readOwnedKey(db, userId, keyId);
  if (!row) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_TARGET_NOT_FOUND',
      404,
      'That API key is not on your account, or it has already been revoked.',
    );
  }
}

export async function executeRegenerateApiKey(args: {
  db: DatabaseAdapter;
  userId: string;
  keyId: string;
}): Promise<SupportActionResult> {
  const { db, userId, keyId } = args;
  const { apiKey, rawKey } = await db.transaction(async (tx) => {
    const existing = await readOwnedKey(tx, userId, keyId, true);
    if (!existing) {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_TARGET_NOT_FOUND',
        404,
        'That API key is not on your account, or it has already been revoked.',
      );
    }

    const scopes: ApiKeyScope[] = resolveApiKeyScopes(existing.scopes ?? []);

    if (scopes.length === 0) {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_UNAVAILABLE',
        409,
        'That key uses a set of permissions this version no longer issues, so it cannot be regenerated automatically. Create a replacement in Settings and revoke the old one there.',
      );
    }

    const expiresAt =
      existing.expires_at === null
        ? null
        : existing.expires_at instanceof Date
          ? existing.expires_at
          : typeof existing.expires_at === 'string'
            ? new Date(existing.expires_at)
            : new Date(Number.NaN);
    if (
      (expiresAt !== null && apiKeyExpiryProblem(expiresAt, Date.now()) !== null) ||
      (existing.project_id !== null &&
        (typeof existing.project_id !== 'string' || !isUuid(existing.project_id)))
    ) {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_UNAVAILABLE',
        409,
        'That key cannot be regenerated with its existing expiry and project. Create a replacement in Settings and revoke the old one there.',
      );
    }

    if ((await ApiKeyService.revokeApiKey(tx, existing.id, userId)) !== 1) {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_TARGET_NOT_FOUND',
        409,
        'That API key changed while it was being regenerated. Ask again with the current key.',
      );
    }
    return ApiKeyService.createApiKey(
      tx,
      userId,
      existing.name,
      scopes,
      expiresAt,
      existing.project_id,
    );
  });

  return {
    kind: 'secret_once',
    message:
      'Your old key is revoked and a new one is issued with the same name, scopes, expiry and project. Copy it now, it is not shown again and is not stored in plain text.',
    apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.key_prefix },
    fullKey: rawKey,
    doNotPersist: true,
  };
}

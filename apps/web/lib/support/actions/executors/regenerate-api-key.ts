import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveApiKeyScopes, type ApiKeyScope } from '@/lib/api-key-scopes';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { SupportActionRefusal, type SupportActionResult } from '../types';

interface OwnedKeyRow {
  id: string;
  name: string;
  scopes: string[] | null;
}

async function readOwnedKey(
  db: DatabaseAdapter,
  userId: string,
  keyId: string,
): Promise<OwnedKeyRow | null> {
  const [row] = await db.query<OwnedKeyRow>(
    `select id, name, scopes
       from public.api_keys
      where id = $1 and user_id = $2 and revoked_at is null
      limit 1`,
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
  const existing = await readOwnedKey(db, userId, keyId);
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

  await ApiKeyService.revokeApiKey(db, existing.id, userId);
  const { apiKey, rawKey } = await ApiKeyService.createApiKey(db, userId, existing.name, scopes);

  return {
    kind: 'secret_once',
    message:
      'Your old key is revoked and a new one is issued with the same name and scopes. Copy it now, it is not shown again and is not stored in plain text.',
    apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.key_prefix },
    fullKey: rawKey,
    doNotPersist: true,
  };
}

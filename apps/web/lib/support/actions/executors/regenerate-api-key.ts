import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { ApiKeyService, ApiKeyRotationRefusal } from '@/lib/services/api-key-service';
import { SupportActionRefusal, type SupportActionResult } from '../types';

export async function assertApiKeyOwned(
  db: DatabaseAdapter,
  userId: string,
  keyId: string,
): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `select id
       from public.api_keys
      where id = $1 and user_id = $2 and revoked_at is null
      limit 2`,
    [keyId, userId],
  );
  if (
    rows.length !== 1 ||
    typeof rows[0]?.id !== 'string' ||
    rows[0].id.toLowerCase() !== keyId.toLowerCase()
  ) {
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
  let issued: Awaited<ReturnType<typeof ApiKeyService.rotateApiKey>>;
  try {
    issued = await ApiKeyService.rotateApiKey(db, userId, keyId);
  } catch (error) {
    if (!(error instanceof ApiKeyRotationRefusal)) throw error;
    if (error.reason === 'not_found') {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_TARGET_NOT_FOUND',
        404,
        'That API key is not on your account, or it has already been revoked.',
      );
    }
    if (error.reason === 'changed') {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_TARGET_NOT_FOUND',
        409,
        'That API key changed while it was being regenerated. Ask again with the current key.',
      );
    }
    if (error.reason === 'permissions') {
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_UNAVAILABLE',
        409,
        'That key uses a set of permissions this version no longer issues, so it cannot be regenerated automatically. Create a replacement in Settings and revoke the old one there.',
      );
    }
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNAVAILABLE',
      409,
      'That key cannot be regenerated with its existing expiry and project. Create a replacement in Settings and revoke the old one there.',
    );
  }
  const { apiKey, rawKey } = issued;

  return {
    kind: 'secret_once',
    message:
      'Your old key is revoked and a new one is issued with the same name, scopes, expiry and project. Copy it now, it is not shown again and is not stored in plain text.',
    apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.key_prefix },
    fullKey: rawKey,
    doNotPersist: true,
  };
}

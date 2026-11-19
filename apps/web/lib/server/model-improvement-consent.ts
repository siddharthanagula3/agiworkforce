import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { PRIVACY_PREFERENCES_NAMESPACE } from './provider-training-opt-out';

export const CHAT_MODEL_IMPROVEMENT_KEY = 'allowChatsForModelImprovement';
export const VOICE_MODEL_IMPROVEMENT_KEY = 'allowVoiceForModelImprovement';

export const MODEL_IMPROVEMENT_CONSENT_KEYS = [
  CHAT_MODEL_IMPROVEMENT_KEY,
  VOICE_MODEL_IMPROVEMENT_KEY,
] as const;

export type ModelImprovementContent = 'chats' | 'voice';

const CONSENT_KEY: Record<ModelImprovementContent, string> = {
  chats: CHAT_MODEL_IMPROVEMENT_KEY,
  voice: VOICE_MODEL_IMPROVEMENT_KEY,
};

export async function readModelImprovementConsent(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  content: ModelImprovementContent,
): Promise<boolean> {
  const consentChoice = CONSENT_KEY[content];
  try {
    const [row] = await db.query<{ choice: unknown }>(
      `select settings -> $2 -> $3 as choice
         from public.user_settings
        where user_id = $1
        limit 1`,
      [userId, PRIVACY_PREFERENCES_NAMESPACE, consentChoice],
    );
    return row?.choice === true;
  } catch (error) {
    logger.warn(
      { error, userId, choice: consentChoice },
      'Model improvement consent unreadable; treated as off',
    );
    return false;
  }
}

export function hasInvalidModelImprovementConsent(settings: Record<string, unknown>): boolean {
  const privacy = settings[PRIVACY_PREFERENCES_NAMESPACE];
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) return false;
  return MODEL_IMPROVEMENT_CONSENT_KEYS.some(
    (key) =>
      Object.hasOwn(privacy, key) && typeof (privacy as Record<string, unknown>)[key] !== 'boolean',
  );
}

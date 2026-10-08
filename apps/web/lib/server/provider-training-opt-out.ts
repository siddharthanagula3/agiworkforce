import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getDefaultModelFor,
  getModelMetadataById,
} from '@agiworkforce/types';

export const PRIVACY_PREFERENCES_NAMESPACE = 'privacy';
export const PROVIDER_TRAINING_OPT_OUT_KEY = 'keepOutOfProviderTraining';

export const MODEL_MAY_TRAIN_MESSAGE =
  "This model's provider may train on what you send. Choose another model, or turn off Only use models that do not train on your chats in Settings > Privacy.";

export async function readProviderTrainingOptOut(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ opted_out: boolean | null }>(
    `select (settings -> $2 ->> $3)::boolean as opted_out
       from public.user_settings
      where user_id = $1
      limit 1`,
    [userId, PRIVACY_PREFERENCES_NAMESPACE, PROVIDER_TRAINING_OPT_OUT_KEY],
  );
  return row?.opted_out === true;
}

export function modelKeepsInputsOutOfTraining(modelId: string): boolean {
  const provider = getModelMetadataById(modelId)?.provider;
  return provider ? providerKeepsInputsOutOfTraining(provider) : false;
}

export function noTrainingChatModelFor(planTier: string): string | null {
  const preferred = getDefaultModelFor(planTier, 'chat');
  if (modelKeepsInputsOutOfTraining(preferred)) return preferred;
  return (
    getAllowedModelsForTier('economy').find(
      (modelId) =>
        canAccessModelForSubscriptionTier(modelId, planTier) &&
        modelKeepsInputsOutOfTraining(modelId),
    ) ?? null
  );
}

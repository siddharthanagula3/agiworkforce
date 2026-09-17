import { z } from 'zod';
import {
  WORKSPACE_FEATURES,
  WORKSPACE_REASONING_EFFORTS,
  getModelMetadataById,
  isAutoModeModelId,
} from '@agiworkforce/types';

const MAX_ALLOWED_COUNTRIES = 250;
const FeatureAccessSchema = z
  .object(Object.fromEntries(WORKSPACE_FEATURES.map((feature) => [feature, z.boolean()])))
  .partial()
  .strict();
const ModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (id) => isAutoModeModelId(id) || Boolean(getModelMetadataById(id)),
    'That model is not in the model catalog',
  );
export const ControlsPatchSchema = z
  .object({
    featureAccess: FeatureAccessSchema,
    defaultModelId: ModelIdSchema.nullable(),
    maxReasoningEffort: z.enum(WORKSPACE_REASONING_EFFORTS).nullable(),
    allowedCountries: z
      .array(z.string().regex(/^[A-Za-z]{2}$/, 'Use two-letter country codes'))
      .max(MAX_ALLOWED_COUNTRIES),
    allowedSurfaces: z
      .array(z.enum(['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome']))
      .min(1)
      .max(6)
      .nullable(),
  })
  .partial()
  .strict();

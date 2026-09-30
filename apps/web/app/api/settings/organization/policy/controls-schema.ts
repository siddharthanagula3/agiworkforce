import { z } from 'zod';
import {
  WORKSPACE_CODE_TOGGLE_KEYS,
  WORKSPACE_FEATURES,
  WORKSPACE_REASONING_EFFORTS,
  getModelMetadataById,
  isAutoModeModelId,
  type WorkspaceCodeToggleKey,
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
const MAX_CODE_HOSTS = 100;
const CodeHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
    'Use a hostname such as example.com or *.example.com',
  );

export const CodeControlsPatchSchema = z
  .object(
    Object.fromEntries(WORKSPACE_CODE_TOGGLE_KEYS.map((key) => [key, z.boolean()])) as Record<
      WorkspaceCodeToggleKey,
      z.ZodBoolean
    >,
  )
  .extend({
    allowedMcpServers: z.array(CodeHostSchema).max(MAX_CODE_HOSTS),
    allowedEgressHosts: z.array(CodeHostSchema).max(MAX_CODE_HOSTS),
    sessionRetentionDays: z.number().int().min(1).max(3650).nullable(),
  })
  .partial()
  .strict();

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

/**
 * An override layer, not the workspace controls: `WorkspaceControlsLayer` is
 * the only shape that carries `code`. `ControlsPatchSchema` stays without it
 * because the policy route's `mergeControls` rebuilds the controls object field
 * by field and would drop a `code` key rather than refuse it.
 */
export const OverrideLayerPatchSchema = ControlsPatchSchema.extend({
  code: CodeControlsPatchSchema.optional(),
}).strict();

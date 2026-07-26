import { z } from 'zod';
import { listCanonicalModels, normalizeModelId, type ModelType } from '@agiworkforce/types';
import {
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudUpdateConversationRequestSchema,
} from '@agiworkforce/cloud-contracts';

/**
 * Chat validation schemas
 *
 * AUDIT-008-002, AUDIT-008-003, AUDIT-008-004: Input validation for chat endpoints
 */

const CHAT_MODEL_TYPES = new Set<ModelType>(['chat', 'code', 'reasoning', 'multimodal', 'search']);
const MESSAGE_MODEL_TYPES = new Set<ModelType>([...CHAT_MODEL_TYPES, 'image']);
const AUTO_MODEL_IDS = ['auto', 'auto-economy', 'auto-balanced', 'auto-premium'] as const;
const ACTIVE_CANONICAL_MODELS = listCanonicalModels().filter(
  (model) => model.status !== 'deprecated',
);

export const SUPPORTED_MODELS: readonly string[] = [
  ...AUTO_MODEL_IDS,
  ...ACTIVE_CANONICAL_MODELS.filter((model) => CHAT_MODEL_TYPES.has(model.modelType)).map(
    (model) => model.id,
  ),
];

/**
 * Conversations must remain on a text-capable model, but an individual
 * assistant turn can be produced by an image model. Keeping these catalogs
 * separate prevents an image-only model from becoming the conversation
 * default while allowing generated image cards to survive reload.
 */
export const SUPPORTED_MESSAGE_MODELS: readonly string[] = [
  ...AUTO_MODEL_IDS,
  ...ACTIVE_CANONICAL_MODELS.filter((model) => MESSAGE_MODEL_TYPES.has(model.modelType)).map(
    (model) => model.id,
  ),
];

export type SupportedModel = string;

function isSupportedModel(val: string): val is SupportedModel {
  const canonicalModelId = normalizeModelId(val) ?? val;
  return SUPPORTED_MODELS.includes(canonicalModelId);
}

function isSupportedMessageModel(val: string): val is SupportedModel {
  const canonicalModelId = normalizeModelId(val) ?? val;
  return SUPPORTED_MESSAGE_MODELS.includes(canonicalModelId);
}

// AUDIT-008-002: Validation schema for conversation updates
export const UpdateConversationSchema = ManagedCloudUpdateConversationRequestSchema.extend({
  model: z
    .string()
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional(),
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

// AUDIT-008-003: Validation schema for conversation creation
export const CreateConversationSchema = ManagedCloudCreateConversationRequestSchema.extend({
  model: z
    .string()
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional()
    .default('auto'),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

// Valid message roles
// AUDIT-008-004: Validation schema for message creation
export const CreateMessageSchema = ManagedCloudCreateMessageRequestSchema.extend({
  model: z
    .string()
    .refine(isSupportedMessageModel, {
      message: 'Invalid model specified',
    })
    .optional()
    .default('auto'),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

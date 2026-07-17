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

export const SUPPORTED_MODELS: readonly string[] = [
  'auto',
  'auto-economy',
  'auto-balanced',
  'auto-premium',
  ...listCanonicalModels()
    .filter((model) => model.status !== 'deprecated')
    .filter((model) => CHAT_MODEL_TYPES.has(model.modelType))
    .map((model) => model.id),
];

export type SupportedModel = string;

function isSupportedModel(val: string): val is SupportedModel {
  const canonicalModelId = normalizeModelId(val) ?? val;
  return SUPPORTED_MODELS.includes(canonicalModelId);
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
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional()
    .default('auto'),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

import { z } from 'zod';
import { listCanonicalModels, normalizeModelId, type ModelType } from '@agiworkforce/types';
import {
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudUpdateConversationRequestSchema,
} from '@agiworkforce/cloud-contracts';

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

export const UpdateConversationSchema = ManagedCloudUpdateConversationRequestSchema.extend({
  model: z
    .string()
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional(),
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

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

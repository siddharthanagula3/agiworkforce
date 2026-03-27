import { z } from 'zod';
import { listCanonicalModels, normalizeModelId, type ModelType } from '@agiworkforce/types';

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
export const UpdateConversationSchema = z.object({
  title: z.string().max(500, 'Title must be 500 characters or less').optional(),
  model: z
    .string()
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional(),
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

// AUDIT-008-003: Validation schema for conversation creation
export const CreateConversationSchema = z.object({
  title: z
    .string()
    .max(500, 'Title must be 500 characters or less')
    .optional()
    .default('New conversation'),
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
const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
type MessageRole = (typeof MESSAGE_ROLES)[number];

// AUDIT-008-004: Validation schema for message creation
// Max content length: 100k characters (approximately 25k tokens)
export const CreateMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(100000, 'Message content exceeds maximum length of 100,000 characters')
    .refine((val) => val.trim().length > 0, 'Message content cannot be only whitespace'),
  model: z
    .string()
    .refine(isSupportedModel, {
      message: 'Invalid model specified',
    })
    .optional()
    .default('auto'),
  role: z
    .string()
    .refine((val): val is MessageRole => MESSAGE_ROLES.includes(val as MessageRole), {
      message: 'Invalid role specified',
    })
    .optional()
    .default('user'),
  skipLlm: z.boolean().optional().default(false),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

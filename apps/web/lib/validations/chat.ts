import { z } from 'zod';
import { listCanonicalModels, normalizeModelId, type ModelType } from '@agiworkforce/types';
import { MAX_MESSAGE_LENGTH } from './llm';

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
  projectId: z.string().max(200, 'Project ID must be 200 characters or less').nullable().optional(),
  /** Pin or unpin the conversation. Persisted in web_conversations.pinned. */
  pinned: z.boolean().optional(),
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

// AUDIT-008-003: Validation schema for conversation creation
export const CreateConversationSchema = z.object({
  // Offline-first clients (mobile/desktop) generate a UUIDv7 id locally so the
  // conversation has a stable cloud identity before the round-trip. Optional:
  // web omits it and the DB default (gen_random_uuid) applies.
  id: z.string().uuid().optional(),
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
  projectId: z.string().max(200, 'Project ID must be 200 characters or less').nullable().optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

// Valid message roles
const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
type MessageRole = (typeof MESSAGE_ROLES)[number];

// AUDIT-008-004: Validation schema for message creation
// Max content length: shared with the llm gateway via MAX_MESSAGE_LENGTH.
export const CreateMessageSchema = z.object({
  id: z.string().uuid('Message ID must be a valid UUID').optional(),
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(
      MAX_MESSAGE_LENGTH,
      `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH.toLocaleString()} characters`,
    )
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
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  skipLlm: z.boolean().optional().default(false),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

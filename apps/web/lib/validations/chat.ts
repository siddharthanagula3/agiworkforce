import { z } from 'zod';

/**
 * Chat validation schemas
 *
 * AUDIT-008-002, AUDIT-008-003, AUDIT-008-004: Input validation for chat endpoints
 */

// Supported model identifiers - auto routes to best available
export const SUPPORTED_MODELS = [
  'auto',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-3.5-sonnet',
  'claude-opus-4',
  'claude-sonnet-4',
  'gemini-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'deepseek-chat',
  'deepseek-reasoner',
] as const;

// Type for supported models
export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

// AUDIT-008-002: Validation schema for conversation updates
export const UpdateConversationSchema = z.object({
  title: z.string().max(500, 'Title must be 500 characters or less').optional(),
  model: z
    .string()
    .refine((val): val is SupportedModel => SUPPORTED_MODELS.includes(val as SupportedModel), {
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
    .refine((val): val is SupportedModel => SUPPORTED_MODELS.includes(val as SupportedModel), {
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
    .max(100000, 'Message content exceeds maximum length of 100,000 characters'),
  model: z
    .string()
    .refine((val): val is SupportedModel => SUPPORTED_MODELS.includes(val as SupportedModel), {
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

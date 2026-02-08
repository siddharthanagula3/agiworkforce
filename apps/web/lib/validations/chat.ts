import { z } from 'zod';

/**
 * Chat validation schemas
 *
 * AUDIT-008-002, AUDIT-008-003, AUDIT-008-004: Input validation for chat endpoints
 */

// Supported model identifiers - auto routes to best available
// NOTE: Keep in sync with apps/web/lib/llm-providers/factory.ts MODEL_ID_TO_API_ID
export const SUPPORTED_MODELS = [
  'auto',
  // Anthropic Claude 4.5 models
  'claude-opus-4.5',
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
  // Legacy Claude models
  'claude-3.5-sonnet',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-opus-4',
  'claude-sonnet-4',
  // OpenAI GPT-5 models
  'gpt-5.2',
  'gpt-5-pro',
  'gpt-5-nano',
  'o3',
  // OpenAI GPT-4 models
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  // Google Gemini 3 models
  'gemini-3-ultra',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  // Legacy Google models
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro',
  // xAI Grok models
  'grok-4',
  'grok-4-fast-reasoning',
  'grok-4-fast',
  'grok-4-mini',
  // Qwen models
  'qwen-max',
  'qwen-coder-plus',
  'qwen-coder-flash',
  'qwen-turbo',
  'qwen-flash',
  // Moonshot/Kimi models
  'kimi-k2.5',
  'kimi-k2.5-thinking',
  'kimi-k2.5-turbo',
  // DeepSeek models
  'deepseek-chat',
  'deepseek-r1',
  'deepseek-chat',
  'deepseek-reasoner',
  // Perplexity models
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-deep-research',
  // ZhipuAI GLM models
  'glm-4.7',
  'glm-4.6v',
  'glm-4.6v-flash',
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
    .max(100000, 'Message content exceeds maximum length of 100,000 characters')
    .refine((val) => val.trim().length > 0, 'Message content cannot be only whitespace'),
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

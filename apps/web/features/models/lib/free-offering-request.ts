import { z } from 'zod';
import { hasExplicitWebFetchIntent, hasExplicitWebSearchIntent } from '@agiworkforce/search';
import { hasExplicitCodeExecutionIntent } from '@/lib/code-execution/explicit-execution-intent';
import {
  ManagedCloudMessageMetadataSchema,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';
import { MAX_MESSAGE_LENGTH } from '@/lib/validations/llm';

const FreeOfferingContentSchema = z.union([
  z.string().max(MAX_MESSAGE_LENGTH),
  z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('text'), text: z.string().max(MAX_MESSAGE_LENGTH) }),
        z.object({ type: z.literal('file'), file: z.object({ asset_id: z.string().uuid() }) }),
      ]),
    )
    .min(1)
    .max(MAX_CHAT_ATTACHMENT_COUNT + 1),
]);

export function freeOfferingContentText(
  content: string | readonly { type: string; text?: string }[],
): string {
  return typeof content === 'string'
    ? content
    : content
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
}

export const FreeOfferingRequestSchema = z.object({
  model: z.string().min(1),
  conversation_id: z.string().uuid(),
  assistant_message_id: z.string().uuid(),
  user_message: z
    .object({
      id: z.string().uuid(),
      metadata: ManagedCloudMessageMetadataSchema.optional().default({}),
      parent_id: z.string().uuid().nullable().optional(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: FreeOfferingContentSchema,
      }),
    )
    .min(1)
    .refine(
      (messages) =>
        messages.reduce(
          (total, message) => total + freeOfferingContentText(message.content).length,
          0,
        ) <= MAX_MESSAGE_LENGTH,
    ),
  max_tokens: z.number().int().positive().optional(),
  work_mode: z.literal('chat').optional(),
  web_search: z.boolean().optional(),
  web_fetch: z.boolean().optional(),
  research: z.literal(false).optional(),
  code_execution: z.literal(false).optional(),
  office_creation: z.literal(false).optional(),
  skill_name: z.undefined().optional(),
  mcp_context: z.undefined().optional(),
});

export type FreeOfferingMessage = z.infer<typeof FreeOfferingRequestSchema>['messages'][number];

export function freeOfferingRequiresWebAccess(
  request: z.infer<typeof FreeOfferingRequestSchema>,
): boolean {
  const latestUserMessage = request.messages.findLast((message) => message.role === 'user');
  const text = latestUserMessage ? freeOfferingContentText(latestUserMessage.content) : '';
  return (
    request.web_search === true ||
    request.web_fetch === true ||
    hasExplicitWebSearchIntent(text) ||
    hasExplicitWebFetchIntent(text)
  );
}

export function freeOfferingRequiresCodeExecution(
  request: z.infer<typeof FreeOfferingRequestSchema>,
): boolean {
  const latestUserMessage = request.messages.findLast((message) => message.role === 'user');
  return hasExplicitCodeExecutionIntent(
    latestUserMessage ? freeOfferingContentText(latestUserMessage.content) : '',
  );
}

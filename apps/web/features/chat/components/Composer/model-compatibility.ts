import { estimateTokens } from '@agiworkforce/routing';
import { getModelMetadataById, getProviderOffering } from '@agiworkforce/types';

export const CONTEXT_RESERVE_TOKENS = 2_048;
export const MIN_CONTEXT_BUDGET_TOKENS = 1_024;
export const MULTIMODAL_PART_TOKENS = 800;
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

export type ContextSizedMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  multimodal_content?: unknown[];
  tool_calls?: unknown[];
};

export function estimateMessageTokens(message: ContextSizedMessage, model: string): number {
  const parts = Array.isArray(message.multimodal_content) ? message.multimodal_content.length : 0;
  const toolCallJson = message.tool_calls ? JSON.stringify(message.tool_calls) : '';
  return (
    estimateTokens(typeof message.content === 'string' ? message.content : '', model) +
    estimateTokens(toolCallJson, model) +
    parts * MULTIMODAL_PART_TOKENS +
    PER_MESSAGE_OVERHEAD_TOKENS
  );
}

export function estimateConversationTokens(
  messages: readonly ContextSizedMessage[],
  model: string,
): number {
  let total = 0;
  for (const message of messages) total += estimateMessageTokens(message, model);
  return total;
}

/**
 * How much of a model's window is left for history once the reply and the
 * fixed reserve are set aside. The composer's pre-switch check and the server's
 * trim have to agree, so both read this.
 */
export function contextBudgetTokens(contextWindow: number, maxOutputTokens: number): number {
  return Math.max(
    MIN_CONTEXT_BUDGET_TOKENS,
    contextWindow - Math.max(0, maxOutputTokens) - CONTEXT_RESERVE_TOKENS,
  );
}

export type ModelCompatibilityCode =
  'unknown_model' | 'context_overflow' | 'no_vision' | 'no_tools' | 'no_attachments';

export interface ModelCompatibilityFinding {
  code: ModelCompatibilityCode;
  message: string;
}

export interface ModelCompatibilityRequest {
  /** Conversation history the next turn would carry, oldest first. */
  messages: readonly ContextSizedMessage[];
  /** The turn sends at least one image, so the model has to read images. */
  hasImages: boolean;
  hasAttachments?: boolean;
  hasNonImageAttachments?: boolean;
  historicalAttachments?: boolean;
  /** The turn has web search, connectors, code execution or another tool armed. */
  needsTools: boolean;
  /** What the tool controls are called in this state, for the copy. */
  toolLabel?: string;
}

export interface ModelCompatibilityResult {
  modelId: string;
  modelName: string | null;
  findings: ModelCompatibilityFinding[];
  estimatedTokens: number;
  budgetTokens: number | null;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * Everything the composer has to know before it moves a conversation onto
 * another model: whether the history still fits, and whether the model can do
 * what this turn is asking for. Capability and limit both come from the
 * catalogue, never from a provider name.
 */
export function evaluateModelCompatibility(
  modelId: string | null | undefined,
  request: ModelCompatibilityRequest,
): ModelCompatibilityResult {
  const offering = modelId ? getProviderOffering(modelId) : undefined;
  if (offering?.quotaProbeProtocol) {
    return {
      modelId: modelId!,
      modelName: offering.displayName,
      findings: [
        ...(request.hasAttachments &&
        (!offering.quotaChatImageInput || request.hasNonImageAttachments)
          ? [
              {
                code: 'no_attachments' as const,
                message: offering.quotaChatImageInput
                  ? 'This free model accepts images only. Remove other files or use Free Auto.'
                  : 'This free model accepts text only. Remove attached files or use Free Auto.',
              },
            ]
          : []),
        ...(request.historicalAttachments
          ? [
              {
                code: 'no_vision' as const,
                message:
                  'Earlier attachments will not be sent to this promotional free model. Use Free Auto if your next answer depends on them.',
              },
            ]
          : []),
        ...(request.needsTools
          ? [
              {
                code: 'no_tools' as const,
                message: 'Turn off tools to use this free model.',
              },
            ]
          : []),
      ],
      estimatedTokens: 0,
      budgetTokens: null,
    };
  }
  const metadata = getModelMetadataById(modelId);
  const resolvedId = metadata?.id ?? modelId ?? '';
  if (!metadata) {
    return {
      modelId: resolvedId,
      modelName: null,
      findings: modelId
        ? [
            {
              code: 'unknown_model',
              message: 'This model is not in the catalogue, so its limits cannot be checked.',
            },
          ]
        : [],
      estimatedTokens: 0,
      budgetTokens: null,
    };
  }

  const estimatedTokens = estimateConversationTokens(request.messages, metadata.id);
  const contextWindow = metadata.contextWindow ?? 0;
  const budgetTokens =
    contextWindow > 0 ? contextBudgetTokens(contextWindow, metadata.maxOutputTokens ?? 0) : null;

  const findings: ModelCompatibilityFinding[] = [];
  if (budgetTokens !== null && estimatedTokens > budgetTokens) {
    findings.push({
      code: 'context_overflow',
      message: `This conversation is about ${formatTokens(estimatedTokens)} tokens and ${metadata.name} holds ${formatTokens(budgetTokens)}. Older messages will be left out of the next reply.`,
    });
  }
  if (request.hasImages && !metadata.capabilities.vision) {
    findings.push({
      code: 'no_vision',
      message: `${metadata.name} cannot read images, so the images in this conversation will be ignored.`,
    });
  }
  if (request.needsTools && !metadata.capabilities.tools) {
    findings.push({
      code: 'no_tools',
      message: `${metadata.name} cannot call tools, so ${request.toolLabel ?? 'the tools you switched on'} will be off for this turn.`,
    });
  }

  return {
    modelId: metadata.id,
    modelName: metadata.name,
    findings,
    estimatedTokens,
    budgetTokens,
  };
}

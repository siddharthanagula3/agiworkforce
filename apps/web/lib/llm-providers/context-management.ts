import 'server-only';

/**
 * Context Management Module for AGI Workforce Web App
 *
 * Provides server-side context compaction and context editing support
 * for Anthropic Claude models. Uses the Anthropic `compact_20260112`
 * beta API format for automatic context compaction when conversations
 * grow large.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface ContextManagementOptions {
  /**
   * Compaction mode:
   *   - 'compact'           → Anthropic automatic context compaction (compact_20260112)
   *   - 'clear_tool_uses'   → Remove tool use/result pairs from older turns
   *   - 'clear_thinking'    → Remove thinking blocks from older turns
   *   - 'none'              → No context management
   */
  mode: 'compact' | 'clear_tool_uses' | 'clear_thinking' | 'none';

  /** Custom instructions for the compaction summary (compact mode only) */
  compactionInstructions?: string;

  /**
   * Token threshold at which to trigger compaction.
   * Defaults to 80% of the model's context window.
   */
  triggerTokens?: number;

  /**
   * Number of recent turns to preserve when clearing thinking blocks.
   * Used with 'clear_thinking' mode. Defaults to 2.
   */
  preserveRecentMessages?: number;
}

/**
 * Model context window sizes in tokens.
 * These define how large a conversation can grow before compaction is beneficial.
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic Claude 4.x — 200K standard (1M via beta header)
  'claude-opus-4-6-20251101': 200_000,
  'claude-opus-4-5-20251101': 200_000,
  'claude-sonnet-4-6-20251029': 200_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Internal aliases
  'claude-opus-4.6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-opus-4.5': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4.6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4.5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4.5': 200_000,
  'claude-haiku-4-5': 200_000,
  // OpenAI GPT-5
  'gpt-5.2': 128_000,
  'gpt-5-pro': 128_000,
  'gpt-5-nano': 128_000,
  'gpt-5-codex': 128_000,
  o3: 200_000,
  // Google Gemini
  'gemini-3-pro-preview': 1_000_000,
  'gemini-3-flash-preview': 1_000_000,
  'gemini-2.5-flash-lite': 1_000_000,
  // xAI Grok 4
  'grok-4': 128_000,
  'grok-4-fast-reasoning': 128_000,
  'grok-4-fast-non-reasoning': 128_000,
  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-r1': 64_000,
  // Qwen
  'qwen-max': 32_000,
  'qwen-flash': 32_000,
  // Moonshot
  'kimi-k2.5': 128_000,
  // Perplexity
  sonar: 127_000,
  'sonar-pro': 200_000,
  'sonar-reasoning': 127_000,
  'sonar-deep-research': 127_000,
  // ZhipuAI
  'glm-4.7': 128_000,
  'glm-4.6v': 128_000,
  'glm-4.6v-flash': 128_000,
};

/**
 * Get the context window size (in tokens) for a given model.
 * Falls back to a conservative 128K default for unknown models.
 */
export function getModelContextWindow(modelId: string): number {
  const normalized = modelId.toLowerCase();
  if (MODEL_CONTEXT_WINDOWS[normalized] !== undefined) {
    return MODEL_CONTEXT_WINDOWS[normalized]!;
  }

  // Prefix-based pattern matching for dynamic/versioned model IDs
  if (normalized.includes('claude-')) return 200_000;
  if (normalized.includes('gemini-')) return 1_000_000;
  if (normalized.includes('gpt-5')) return 128_000;
  if (normalized.includes('grok-')) return 128_000;
  if (normalized.includes('deepseek')) return 64_000;
  if (normalized.includes('sonar')) return 127_000;

  // Conservative fallback
  return 128_000;
}

/**
 * Estimate the token count for a list of messages.
 *
 * Uses the 3.5-chars-per-token heuristic (closer to GPT-4/Claude tokenizer average).
 * Includes per-message overhead (role label + framing ≈ 4 tokens each).
 */
export function estimateTokenCount(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : '';
    // 3.5 chars ≈ 1 token; add 4 tokens overhead per message for role + framing
    total += Math.ceil(text.length / 3.5) + 4;
  }
  return total;
}

/**
 * Determine whether compaction should be triggered for the given messages + model.
 *
 * Returns true when the estimated token count exceeds 80% of the model's
 * context window, giving headroom for the model's response.
 */
export function shouldCompact(messages: ChatMessage[], model: string): boolean {
  const contextWindow = getModelContextWindow(model);
  const estimatedTokens = estimateTokenCount(messages);
  const threshold = Math.floor(contextWindow * 0.8);
  return estimatedTokens > threshold;
}

/**
 * Build the Anthropic `context_management` request object.
 *
 * Formats the correct API object for each supported mode:
 *   - compact           → { type: "compact_20260112", ... }
 *   - clear_tool_uses   → { type: "clear_tool_uses_20250919", ... }
 *   - clear_thinking    → { type: "clear_thinking_20251015", ... }
 *   - none              → null (caller should omit field)
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/context-management
 */
export function buildAnthropicContextManagement(
  options: ContextManagementOptions,
): Record<string, unknown> | null {
  switch (options.mode) {
    case 'compact': {
      const obj: Record<string, unknown> = {
        type: 'compact_20260112',
      };
      if (options.compactionInstructions) {
        obj['compaction_instructions'] = options.compactionInstructions;
      }
      if (options.triggerTokens !== undefined) {
        obj['threshold_tokens'] = options.triggerTokens;
      }
      return obj;
    }

    case 'clear_tool_uses': {
      const obj: Record<string, unknown> = {
        type: 'clear_tool_uses_20250919',
      };
      if (options.triggerTokens !== undefined) {
        obj['threshold_tokens'] = options.triggerTokens;
      }
      return obj;
    }

    case 'clear_thinking': {
      const obj: Record<string, unknown> = {
        type: 'clear_thinking_20251015',
      };
      const recentTurns = options.preserveRecentMessages ?? 2;
      obj['recent_turns_to_keep'] = recentTurns;
      return obj;
    }

    case 'none':
    default:
      return null;
  }
}

/**
 * Return the Anthropic beta header value required for a given context management mode.
 *
 * The compact mode requires 'compact-2026-01-12'.
 * clear_tool_uses and clear_thinking use 'context-management-2025-06-27'.
 * Returns null for 'none' (no extra beta header needed).
 */
export function getContextManagementBetaHeader(
  mode: ContextManagementOptions['mode'],
): string | null {
  switch (mode) {
    case 'compact':
      return 'compact-2026-01-12';
    case 'clear_tool_uses':
    case 'clear_thinking':
      return 'context-management-2025-06-27';
    case 'none':
    default:
      return null;
  }
}

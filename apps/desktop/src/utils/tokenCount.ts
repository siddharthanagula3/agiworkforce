/**
 * Token counting utilities
 *
 * Provides token estimation for context items.
 * Uses a simple heuristic for now (~4 chars per token for English text).
 * Can be upgraded to use tiktoken or similar library for more accuracy.
 */

import { getModelMetadata } from '../constants/llm';

/**
 * Token breakdown for input and output
 */
export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Estimate token count for text content
 *
 * This is a simple heuristic:
 * - English text: ~4 characters per token
 * - Code: ~3 characters per token (more symbols/punctuation)
 *
 * For more accurate counting, consider using tiktoken library.
 */
export function estimateTokens(text: string, isCode = false): number {
  if (!text) return 0;

  const charsPerToken = isCode ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate input tokens for a user message
 */
export function estimateInputTokens(
  message: string,
  systemPrompt?: string,
  contextItems?: Array<{ content?: string; type?: string }>,
): number {
  let total = 0;

  // System prompt tokens
  if (systemPrompt) {
    total += estimateTokens(systemPrompt, false);
  }

  // User message tokens
  total += estimateTokens(message, false);

  // Context items tokens
  if (contextItems) {
    for (const item of contextItems) {
      if (item.content) {
        const isCode = item.type === 'file' || item.type === 'code-snippet';
        total += estimateTokens(item.content, isCode);
      }
    }
  }

  // Add overhead for message formatting
  total += 20;

  return total;
}

/**
 * Estimate output tokens for a response
 */
export function estimateOutputTokens(response: string, includesCode = false): number {
  if (!response) return 0;

  // If the response contains code blocks, use a weighted average
  const codeBlockMatches = response.match(/```[\s\S]*?```/g);
  if (codeBlockMatches || includesCode) {
    const codeContent = codeBlockMatches?.join('') || '';
    const textContent = response.replace(/```[\s\S]*?```/g, '');
    return estimateTokens(codeContent, true) + estimateTokens(textContent, false);
  }

  return estimateTokens(response, false);
}

/**
 * Calculate cost for input tokens for a specific model
 */
export function calculateInputCost(inputTokens: number, modelId: string): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;
  return (inputTokens / 1_000_000) * metadata.inputCost;
}

/**
 * Calculate cost for output tokens for a specific model
 */
export function calculateOutputCost(outputTokens: number, modelId: string): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;
  return (outputTokens / 1_000_000) * metadata.outputCost;
}

/**
 * Calculate complete token breakdown with costs for a model
 */
export function calculateTokenBreakdown(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
): TokenBreakdown {
  const inputCost = calculateInputCost(inputTokens, modelId);
  const outputCost = calculateOutputCost(outputTokens, modelId);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Format token count for display
 */
export function formatTokens(count: number): string {
  if (count < 1000) {
    return `${count}`;
  }

  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  }

  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token breakdown for display
 */
export function formatTokenBreakdown(breakdown: TokenBreakdown): {
  input: string;
  output: string;
  total: string;
  inputCost: string;
  outputCost: string;
  totalCost: string;
} {
  return {
    input: formatTokens(breakdown.inputTokens),
    output: formatTokens(breakdown.outputTokens),
    total: formatTokens(breakdown.totalTokens),
    inputCost: formatCost(breakdown.inputCost),
    outputCost: formatCost(breakdown.outputCost),
    totalCost: formatCost(breakdown.totalCost),
  };
}

/**
 * Estimate tokens for a context item based on its type
 */
export function estimateContextItemTokens(item: {
  type: string;
  content?: string;
  excerpt?: string;
  description?: string;
}): number {
  let total = 0;

  // Base overhead for context item structure
  total += 10;

  // Content tokens (main body)
  if (item.content) {
    const isCode = item.type === 'file' || item.type === 'code-snippet';
    total += estimateTokens(item.content, isCode);
  }

  // Excerpt tokens (for files without full content)
  if (item.excerpt && !item.content) {
    total += estimateTokens(item.excerpt, true);
  }

  // Description tokens
  if (item.description) {
    total += estimateTokens(item.description, false);
  }

  return total;
}

/**
 * Get context window utilization percentage
 */
export function getContextUtilization(
  currentTokens: number,
  modelId: string,
): { percentage: number; remaining: number; maxTokens: number } {
  const metadata = getModelMetadata(modelId);
  const maxTokens = metadata?.contextWindow || 4096;
  const percentage = (currentTokens / maxTokens) * 100;
  const remaining = Math.max(0, maxTokens - currentTokens);

  return { percentage, remaining, maxTokens };
}

/**
 * Check if token count is within safe limits for a model
 */
export function isWithinContextLimit(
  currentTokens: number,
  modelId: string,
  reserveRatio = 0.1, // Reserve 10% for output by default
): boolean {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return true;

  const reservedTokens = metadata.contextWindow * reserveRatio;
  return currentTokens < metadata.contextWindow - reservedTokens;
}

/**
 * Estimate tokens for a conversation history
 */
export function estimateConversationTokens(messages: Array<{ role: string; content: string }>): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    const tokens = estimateTokens(message.content, false);
    if (message.role === 'user' || message.role === 'system') {
      inputTokens += tokens;
    } else {
      outputTokens += tokens;
    }
    // Add overhead for message formatting
    inputTokens += 4;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

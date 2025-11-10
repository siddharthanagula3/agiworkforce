/**
 * Token counting utilities
 *
 * Provides token estimation for context items.
 * Uses a simple heuristic for now (~4 chars per token for English text).
 * Can be upgraded to use tiktoken or similar library for more accuracy.
 */

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

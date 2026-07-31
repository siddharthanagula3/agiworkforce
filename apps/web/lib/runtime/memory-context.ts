/**
 * Memory context injection
 *
 * Turns the user's saved memory facts (the ones they curate in the Settings →
 * Memory editor, persisted client-side in the unified-chat memory store) into a
 * single system message that gets prepended to outgoing chat requests. This is
 * what makes the Memory settings section actually affect the assistant's
 * answers: without it the facts only live in local storage and never reach the
 * model.
 *
 * Kept as a pure function (facts in, system content out) so it can be unit
 * tested without a running store, and so the budget/formatting rules live in one
 * place rather than inline in the runtime.
 */
import type { MemoryFact } from '@agiworkforce/unified-chat';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils';

/** Hard caps so a large memory list can't blow up the prompt or cost. */
const MAX_FACTS = 50;
const MAX_TOTAL_CHARS = 4000;

/**
 * Build the system message that carries the user's saved memory facts, or
 * `null` when there is nothing to inject. Facts are taken newest-first (the
 * store keeps that order) and trimmed to the count / character budget so an
 * unbounded list degrades gracefully instead of bloating every request.
 */
export function buildMemorySystemContent(facts: readonly MemoryFact[]): string | null {
  if (!facts.length) return null;

  const lines: string[] = [];
  let used = 0;
  for (const fact of facts) {
    if (lines.length >= MAX_FACTS) break;
    const text = fact.text.trim();
    if (!text) continue;
    const line = `- ${text}`;
    if (used + line.length > MAX_TOTAL_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }

  if (!lines.length) return null;

  return fenceUntrustedMemoryContent(lines.join('\n'));
}

/**
 * Prepend the memory system message to a message history. If the history already
 * starts with a system message, the memory block is merged into it (memory
 * first, a blank line, then the existing system content) so providers that only
 * honor a single leading system message still receive both. Returns a new array;
 * the input is not mutated. A `null`/empty content is a no-op.
 */
export function withMemorySystemMessage<T extends { role: string; content: string }>(
  history: T[],
  memoryContent: string | null,
): T[] {
  if (!memoryContent) return history;

  const head = history[0];
  if (head?.role === 'system') {
    const merged = { ...head, content: `${memoryContent}\n\n${head.content}` } as T;
    return [merged, ...history.slice(1)];
  }

  const systemMessage = { role: 'system', content: memoryContent } as unknown as T;
  return [systemMessage, ...history];
}

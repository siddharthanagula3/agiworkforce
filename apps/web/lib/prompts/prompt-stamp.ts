/**
 * The `id@version` stamp written to the cost ledger and the routing trace.
 *
 * Kept free of manifest imports so the writers of those two tables can validate
 * a stamp without pulling the prompt texts, and so the shape the database
 * stores is defined in one place rather than at each writer.
 */

const PROMPT_STAMP_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*@\d+$/;

export const MAX_PROMPT_STAMPS_PER_ROW = 16;

export function isPromptStamp(value: string): boolean {
  return PROMPT_STAMP_PATTERN.test(value);
}

export function normalizePromptStamps(stamps: readonly string[] | null | undefined): string[] {
  if (!stamps) return [];
  const unique = new Set<string>();
  for (const stamp of stamps) {
    if (typeof stamp === 'string' && isPromptStamp(stamp)) unique.add(stamp);
  }
  return [...unique].sort().slice(0, MAX_PROMPT_STAMPS_PER_ROW);
}

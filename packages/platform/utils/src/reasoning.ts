/**
 * Shared reasoning/thinking-block presentation logic.
 *
 * Used by the web, desktop, and mobile chat surfaces' collapsible reasoning
 * UI (apps/web ThinkingBlock.tsx, apps/mobile ThinkingChip.tsx) so the status
 * copy, duration formatting and the live "Analyzing / Searching / Writing…"
 * verb-phrase inference, stays identical across surfaces instead of being
 * reimplemented (and drifting) per app.
 *
 * @module reasoning
 * @packageDocumentation
 */

/**
 * Format seconds as "Xs" (under a minute) or "Xm Ys" (a minute or more).
 *
 * @example
 * ```typescript
 * formatThinkingDuration(4);   // "4s"
 * formatThinkingDuration(65);  // "1m 5s"
 * ```
 */
export function formatThinkingDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function deriveReasoningPhrase(content: string): string {
  const lines = content.split('\n');
  const activeLine =
    [...lines]
      .reverse()
      .find((l) => l.trim().length > 0)
      ?.trim()
      .toLowerCase() ?? '';

  if (!activeLine) return 'Thinking';

  if (/\b(analyz|analys|examin|review)\w*/.test(activeLine)) return 'Analyzing';
  if (/\b(calculat|comput|count|measur)\w*/.test(activeLine)) return 'Calculating';
  if (/\b(search|look|find|check)\w*/.test(activeLine)) return 'Searching';
  if (/\b(read|pars|scan|skim)\w*/.test(activeLine)) return 'Reading';
  if (/\b(writ|draft|generat|creat|compil)\w*/.test(activeLine)) return 'Writing';
  if (/\b(plan|outlin|structur|organiz)\w*/.test(activeLine)) return 'Planning';
  if (/\b(reason|infer|deduc|conclud)\w*/.test(activeLine)) return 'Reasoning';
  if (/\b(translat|convert|transform)\w*/.test(activeLine)) return 'Translating';
  if (/\b(debug|fix|correct|repair)\w*/.test(activeLine)) return 'Debugging';
  if (/\b(summar|condens|distil)\w*/.test(activeLine)) return 'Summarizing';
  if (/\b(compar|contrast|evaluat|assess)\w*/.test(activeLine)) return 'Comparing';
  if (/\b(explain|describ|clarif)\w*/.test(activeLine)) return 'Explaining';

  return 'Thinking';
}

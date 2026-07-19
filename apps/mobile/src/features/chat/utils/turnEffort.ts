/**
 * Decide which reasoning-effort value (if any) to send on a turn.
 *
 * Fixes the silently-dropped-effort bug:
 *  - only send an effort the SELECTED model actually supports (the per-turn value
 *    may have been chosen for a previously-selected model);
 *  - for `effort_levels` models, effort IS the native reasoning control, so it is
 *    sent regardless of the (default-off) Thinking toggle; for toggle-based models
 *    effort still rides with thinking;
 *  - `none`/`minimal` are valid values here — the server accepts any effort string
 *    and validates it per model — so they are NOT dropped when supported.
 */
export function resolveTurnEffort<E extends string>(opts: {
  selectedEffort: E;
  supportedEfforts: readonly string[];
  reasoningControl?: string;
  thinkingEnabled: boolean;
}): E | undefined {
  const supported = opts.supportedEfforts.includes(opts.selectedEffort);
  const isEffortControlModel = opts.reasoningControl === 'effort_levels';
  return supported && (isEffortControlModel || opts.thinkingEnabled)
    ? opts.selectedEffort
    : undefined;
}

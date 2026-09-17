/**
 * Routing stages are ON unless an operator turns one off.
 *
 * Each variable is a kill switch, not a launch switch: an unset environment runs
 * the stage, and `0`, `false` or `off` withdraws it on every surface in one
 * edit. A stage whose inputs are absent is already a no-op, so a default of on
 * never changes a decision the caller has no evidence for.
 */
const ROUTING_STAGE_KILL_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'off']);

export function routingStageEnabled(envName: string): boolean {
  if (typeof process === 'undefined') return true;
  const raw = process.env?.[envName];
  if (raw === undefined) return true;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return !ROUTING_STAGE_KILL_VALUES.has(normalized);
}

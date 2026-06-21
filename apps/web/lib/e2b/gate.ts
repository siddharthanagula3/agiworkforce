/**
 * E2B execution gating — three independent, fail-closed gates.
 *
 * E2B is managed cloud, so it inherits the managed-compute private-beta gate (locked
 * rule: managed compute stays gated until abuse/fraud/limits/retention are proven).
 * The cut-over flag additionally controls whether the universal E2B execution tools
 * are offered INSTEAD of today's provider-native code tools. Off by default, so this
 * whole layer is dormant — no behavior change — until the founder flips it.
 */
import 'server-only';

import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

/** Cut-over flag: '1' offers the universal E2B execution tools. Off by default. */
export const E2B_EXECUTION_ENV = 'AGI_E2B_EXECUTION';
/** E2B API key env. Absent → no executor (fail-closed). */
export const E2B_API_KEY_ENV = 'E2B_API_KEY';

/**
 * Whether E2B execution is configured for this deployment. Per the founder's hybrid
 * cut-over: E2B routing is active when an E2B API key OR the explicit cut-over flag is
 * present. Both are SERVER env vars (operator-controlled, never user-controlled), so
 * this is a deliberate deployment opt-in — consistent with the managed-cloud gating
 * principle (managed compute is operator-gated, not publicly open). Off by default.
 *
 * When false, the conditional router falls back to provider-native code execution for
 * providers that support it, and fail-closes for providers that don't.
 */
export function e2bExecutionEnabled(): boolean {
  const key = process.env[E2B_API_KEY_ENV];
  const hasKey = typeof key === 'string' && key.length > 0;
  const flagOn = process.env[E2B_EXECUTION_ENV] === '1';
  return hasKey || flagOn;
}

/**
 * Managed-compute private-beta status — a SEPARATE, broader gate (used by the
 * route-level managed-compute enforcement). Re-exported here for callers that need to
 * reason about both gates together. Not required for `e2bExecutionEnabled()`.
 */
export function managedComputeBetaEnabled(): boolean {
  return isManagedComputePrivateBetaEnabled();
}

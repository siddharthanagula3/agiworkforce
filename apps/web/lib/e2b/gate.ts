/**
 * E2B execution gating — fail-closed.
 *
 * E2B is managed cloud, so it inherits the managed-compute private-beta gate (locked
 * rule: managed compute stays gated until abuse/fraud/limits/retention are proven).
 *
 * SCOPE (important): `e2bExecutionEnabled()` gates ONLY `getE2BExecutor()` (runtime.ts) —
 * whether the live @e2b binding is constructed. It does NOT change what tools the chat
 * request offers: `resolveCodeExecutionTools()` is native-always / fail-closed and
 * ignores this flag, because the server-side loop that would run platform-executed E2B
 * tools is unreachable in prod (a pre-existing architectural gap). So setting E2B_API_KEY
 * activates the dormant binding (and the verifier) but does NOT cut request traffic over
 * to E2B — that cut-over needs a reachable, approval-gated execution loop first.
 */
import 'server-only';

import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

/** Cut-over flag: '1' offers the universal E2B execution tools. Off by default. */
export const E2B_EXECUTION_ENV = 'AGI_E2B_EXECUTION';
/** E2B API key env. Absent → no executor (fail-closed). */
export const E2B_API_KEY_ENV = 'E2B_API_KEY';

/**
 * Whether the live E2B binding may be constructed for this deployment. True when an E2B
 * API key OR the explicit flag is present. Both are SERVER env vars (operator-controlled,
 * never user-controlled), so this is a deliberate deployment opt-in — consistent with the
 * managed-cloud gating principle (managed compute is operator-gated, not publicly open).
 * Off by default. See the scope note above: this gates `getE2BExecutor()` only, NOT the
 * tools offered on the chat request path.
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

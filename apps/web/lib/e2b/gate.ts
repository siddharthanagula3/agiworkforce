/**
 * E2B execution gating — fail-closed.
 *
 * E2B is managed cloud, so it inherits the managed-compute private-beta gate (locked
 * rule: managed compute stays gated until abuse/fraud/limits/retention are proven).
 *
 * SCOPE (important): `e2bExecutionEnabled()` gates ONLY `getE2BExecutor()` (runtime.ts) —
 * whether the live @e2b binding is constructed.
 *
 * `e2bCutoverEnabled()` is the separate, explicit operator flag that enables the
 * reachable execution loop: it gates tool-offering in request-processor AND loop entry
 * in route.ts. When this flag is ON, E2B tool defs are offered to E2B-tier providers
 * (OpenAI, DeepSeek, etc.) on the streaming non-free-trial path, and the agentic loop
 * is entered to run them. When OFF (default), the chat request path is byte-for-byte
 * the pre-P3 behavior regardless of E2B configuration.
 *
 * CRITICAL SEPARATION: `e2bCutoverEnabled()` must gate on the EXPLICIT FLAG only — never
 * on key presence alone. `e2bExecutionEnabled()` returns true when E2B_API_KEY is present
 * even without the flag; if cut-over gated on that, dropping the key into a prod env would
 * silently open managed compute to all authed users, violating the locked "managed compute
 * stays gated" rule. The explicit flag is the operator's deliberate opt-in.
 */
import 'server-only';

import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

/** Cut-over flag: '1' enables the reachable E2B execution loop (tool-offering + loop entry). Off by default. */
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
 * Whether the reachable E2B execution cut-over is enabled for this deployment.
 *
 * TRUE only when `AGI_E2B_EXECUTION=1`. This gates:
 *   - Tool-offering: request-processor offers `e2bExecutionToolDefs()` to E2B-tier
 *     providers on streaming non-free-trial requests (instead of native tools).
 *   - Loop entry: route.ts enters the agentic loop in 'auto' mode so the tools
 *     are actually executed by `runMcpTool` via `routeExecutionTool`.
 *
 * FALSE (default) → byte-for-byte the pre-P3 behavior: `resolveCodeExecutionTools()`
 * for all providers, no loop entry for E2B tools, zero regression.
 *
 * NEVER gate on key presence alone (see module doc). The flag is the deliberate
 * operator opt-in that proves the loop is available; the key is provisioned separately.
 * Caveat: flag ON without E2B_API_KEY → `getE2BExecutor()` returns null → E2B-tier
 * providers get an explicit "execution environment unavailable" tool result. The operator
 * must provision E2B_API_KEY together with the flag for actual execution to work.
 */
export function e2bCutoverEnabled(): boolean {
  return process.env[E2B_EXECUTION_ENV] === '1';
}

/**
 * Code-session provisioning requires BOTH the deliberate operator cut-over and
 * a usable credential. This is stricter than the low-level executor gate so
 * the product never advertises an environment that cannot be created.
 */
export function e2bProvisioningReady(): boolean {
  const key = process.env[E2B_API_KEY_ENV];
  return e2bCutoverEnabled() && typeof key === 'string' && key.trim().length > 0;
}

/**
 * Managed-compute private-beta status — a SEPARATE, broader gate (used by the
 * route-level managed-compute enforcement). Re-exported here for callers that need to
 * reason about both gates together. Not required for `e2bExecutionEnabled()`.
 */
export function managedComputeBetaEnabled(): boolean {
  return isManagedComputePrivateBetaEnabled();
}

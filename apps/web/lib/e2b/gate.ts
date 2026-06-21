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
 * Whether E2B execution should be offered for this deployment. ALL of:
 *  1. managed-compute private beta is enabled (the managed-cloud trust gate), AND
 *  2. the E2B cut-over flag is explicitly on, AND
 *  3. an E2B API key is configured.
 * Any miss → false (fail-closed). The picker-level `requiresEnvironment` gate and the
 * per-request managed-compute gate are separate, complementary enforcement layers.
 */
export function e2bExecutionEnabled(): boolean {
  if (!isManagedComputePrivateBetaEnabled()) return false;
  if (process.env[E2B_EXECUTION_ENV] !== '1') return false;
  const key = process.env[E2B_API_KEY_ENV];
  return typeof key === 'string' && key.length > 0;
}

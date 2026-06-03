/**
 * tierResolver.ts — Resolves the current user's subscription tier.
 *
 * Priority chain:
 *   1. agi-workforce.tier setting (explicit override — useful for testing)
 *   2. desktopBridge tier capability, when explicitly supported
 *   3. Cached value from globalState (populated by fetchTierInfo on activation)
 *   4. 'byok' fallback (safe default — never over-gates)
 *
 * This module is intentionally free of side-effects and VS Code window calls
 * so that it can be unit-tested in isolation.
 */

import * as vscode from 'vscode';
import { type UIPlanTier, tierAtLeast } from '@agiworkforce/types';
import { getDesktopBridge } from '../features/desktop-bridge';

// ─── Tier type ────────────────────────────────────────────────────────────────

/**
 * Local alias for the canonical {@link UIPlanTier} from `@agiworkforce/types`.
 * Re-exported so existing call sites can keep `import type { Tier }` working.
 */
export type Tier = UIPlanTier;

const VALID_TIERS: ReadonlySet<string> = new Set<UIPlanTier>([
  'local',
  'byok',
  'hobby',
  'pro',
  'pro_plus',
  'max',
]);

/**
 * Tier ordering — lower index = lower tier.
 * Used to compare tiers (e.g. is 'hobby' < 'pro_plus'?).
 *
 * Kept here as a local convenience for tests that introspect order; the
 * canonical comparator is {@link tierAtLeast} from `@agiworkforce/types`.
 */
export const TIER_ORDER: readonly Tier[] = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'];

/** Re-export of the canonical {@link tierAtLeast} comparator. */
export { tierAtLeast };

// ─── Validation ───────────────────────────────────────────────────────────────

function coerceTier(raw: string | undefined): Tier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  // Also accept "pro+" as alias for "pro_plus" (API may return either form)
  const remapped = normalized === 'pro+' ? 'pro_plus' : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as Tier) : undefined;
}

// ─── Bridge fetch ─────────────────────────────────────────────────────────────

/**
 * Attempt to fetch tier from the desktop bridge.
 *
 * Wave 1: the VS Code bridge does not have a supported HTTP `/billing/tier`
 * route. Return undefined instead of probing a nonexistent endpoint; callers
 * fall back to the cached cloud tier or BYOK.
 */
export async function fetchTierFromBridge(): Promise<Tier | undefined> {
  const bridge = getDesktopBridge();
  if (bridge === undefined || !bridge.isConnected) return undefined;
  return undefined;
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the current subscription tier.
 *
 * @param context - ExtensionContext used to read cached globalState tier.
 * @param preferBridge - When true (default), attempt a live bridge fetch first.
 *   Pass false in hot paths (e.g. per-keystroke) to skip the async bridge call.
 */
export async function resolveTier(
  context: vscode.ExtensionContext,
  preferBridge = true,
): Promise<Tier> {
  // 1. Explicit user override via setting — read globalValue only so an untrusted
  //    workspace cannot escalate tier by placing "agiWorkforce.tier": "max" in
  //    .vscode/settings.json. The workspace value is intentionally ignored here;
  //    `agiWorkforce.tier` is also listed in restrictedConfigurations as defense-in-depth.
  const settingRaw = vscode.workspace
    .getConfiguration('agiWorkforce')
    .inspect<string>('tier')?.globalValue;
  const settingTier = coerceTier(settingRaw);
  if (settingTier !== undefined && settingTier !== 'byok') {
    // If set to 'byok' (the default), fall through so the bridge can provide
    // the real tier. Any other explicit value is treated as an override.
    return settingTier;
  }

  // 2. Live bridge fetch (async, gated by connection status)
  if (preferBridge) {
    const bridgeTier = await fetchTierFromBridge();
    if (bridgeTier !== undefined) return bridgeTier;
  }

  // 3. Cached tier from globalState (populated during activation by fetchTierInfo)
  const cachedRaw = context.globalState.get<string>('tierStatus.cachedTier');
  const cachedTier = coerceTier(cachedRaw);
  if (cachedTier !== undefined) return cachedTier;

  // 4. Safe fallback
  return 'byok';
}

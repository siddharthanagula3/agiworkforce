/**
 * tierResolver.ts — Resolves the current user's subscription tier.
 *
 * Priority chain:
 *   1. agi-workforce.tier setting (explicit override — useful for testing)
 *   2. desktopBridge GET /billing/tier (real-time from desktop if connected)
 *   3. Cached value from globalState (populated by fetchTierInfo on activation)
 *   4. 'byok' fallback (safe default — never over-gates)
 *
 * This module is intentionally free of side-effects and VS Code window calls
 * so that it can be unit-tested in isolation.
 */

import * as vscode from 'vscode';
import { type UIPlanTier, tierAtLeast } from '@agiworkforce/types';
import { getDesktopBridge } from './desktopBridge';

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

const BRIDGE_TIER_TIMEOUT_MS = 2_000;

/**
 * Attempt to fetch tier from desktopBridge GET /billing/tier.
 * Returns undefined if the bridge is not connected or the call fails.
 * Never throws.
 */
export async function fetchTierFromBridge(): Promise<Tier | undefined> {
  const bridge = getDesktopBridge();
  if (bridge === undefined || !bridge.isConnected) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIER_TIMEOUT_MS);

  try {
    const res = await fetch(`${bridge.baseUrl}/billing/tier`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) return undefined;

    const json = (await res.json()) as Record<string, unknown>;
    const raw = typeof json['tier'] === 'string' ? json['tier'] : undefined;
    return coerceTier(raw);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
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
  // 1. Explicit user override via setting — highest priority (testing / bypass)
  const settingRaw = vscode.workspace.getConfiguration('agiWorkforce').get<string>('tier');
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

/**
 * tierResolver.ts — Resolves the current user's subscription tier.
 *
 * Priority chain:
 *   1. Cached value from globalState (populated only by account tier refresh)
 *   2. 'byok' fallback (safe default — never over-gates)
 *
 * This module is intentionally free of side-effects and VS Code window calls
 * so that it can be unit-tested in isolation.
 */

import * as vscode from 'vscode';
import { type UIPlanTier, tierAtLeast } from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';

// ─── Tier type ────────────────────────────────────────────────────────────────

/**
 * Local alias for the canonical {@link UIPlanTier} from `@agiworkforce/types`.
 * Re-exported so existing call sites can keep `import type { Tier }` working.
 */
export type Tier = UIPlanTier;

const VALID_TIERS: ReadonlySet<string> = new Set<UIPlanTier>([
  'local',
  'byok',
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'enterprise',
]);

/**
 * Tier ordering — lower index = lower tier.
 * Used to compare tiers (e.g. is 'basic' < 'pro'?).
 *
 * Kept here as a local convenience for tests that introspect order; the
 * canonical comparator is {@link tierAtLeast} from `@agiworkforce/types`.
 */
export const TIER_ORDER: readonly Tier[] = [
  'local',
  'byok',
  'free',
  'basic',
  'pro',
  'team',
  'max',
  'max_15x',
  'enterprise',
];

/** Re-export of the canonical {@link tierAtLeast} comparator. */
export { tierAtLeast };

// ─── Validation ───────────────────────────────────────────────────────────────

function coerceTier(raw: string | undefined): Tier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  // Legacy aliases from before the 2026-06-30 tier rename: 'hobby' -> 'basic',
  // 'pro+'/'pro_plus' -> 'max' (pro_plus was never shipped and was removed
  // with no direct successor; anything gated on it now gates on 'max').
  const remapped =
    normalized === 'hobby'
      ? 'basic'
      : normalized === 'pro+' || normalized === 'pro_plus'
        ? 'max'
        : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as Tier) : undefined;
}

export type AccountTierLoader = (secrets: vscode.SecretStorage) => Promise<TierInfo | undefined>;

/**
 * Remove account-derived tier state when a device session ends or cannot be
 * revalidated. Leaving a previous Pro/Team tier cached after sign-out makes
 * managed models appear reachable even though the account token is gone.
 */
export async function clearAccountTierCache(context: vscode.ExtensionContext): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  const updates: Thenable<void>[] = [];
  if (context.globalState.get<string>('tierStatus.cachedTier') !== undefined) {
    updates.push(context.globalState.update('tierStatus.cachedTier', undefined));
  }
  if (configuration.inspect<string>('currentTier')?.globalValue !== 'unknown') {
    updates.push(configuration.update('currentTier', 'unknown', vscode.ConfigurationTarget.Global));
  }
  await Promise.all(updates);
}

/**
 * Refresh the server-owned account tier and replace any prior cache.
 *
 * A failed or malformed refresh clears the old account tier so model and Auto
 * admission fail closed instead of retaining paid reachability from an earlier
 * session. Provider BYOK remains available through the independent app-server.
 */
export async function refreshAccountTierCache(
  context: vscode.ExtensionContext,
  loadTier: AccountTierLoader = fetchTierInfo,
): Promise<Tier | undefined> {
  let tierInfo: TierInfo | undefined;
  try {
    tierInfo = await loadTier(context.secrets);
  } catch {
    tierInfo = undefined;
  }
  const tier = coerceTier(tierInfo?.tier);
  if (tier === undefined) {
    await clearAccountTierCache(context);
    return undefined;
  }

  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  const updates: Thenable<void>[] = [];
  if (context.globalState.get<string>('tierStatus.cachedTier') !== tier) {
    updates.push(context.globalState.update('tierStatus.cachedTier', tier));
  }
  if (configuration.inspect<string>('currentTier')?.globalValue !== tier) {
    updates.push(configuration.update('currentTier', tier, vscode.ConfigurationTarget.Global));
  }
  await Promise.all(updates);
  return tier;
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Synchronous tier resolution for callers that cannot await — currently the
 * webview HTML builders, which run inside `resolveWebviewView` / a constructor.
 *
 * Identical to {@link resolveTier}; kept for webview builders that cannot await.
 */
export function resolveTierSync(context: vscode.ExtensionContext): Tier {
  const cachedTier = coerceTier(context.globalState.get<string>('tierStatus.cachedTier'));
  if (cachedTier !== undefined) return cachedTier;

  return 'byok';
}

/**
 * Resolve the current subscription tier.
 *
 * @param context - ExtensionContext used to read cached globalState tier.
 */
export async function resolveTier(context: vscode.ExtensionContext): Promise<Tier> {
  // Cached tier is populated only by the authenticated account refresh. There
  // is intentionally no user/workspace entitlement override: diagnostics must
  // not make a paid model appear reachable without server-owned admission.
  const cachedRaw = context.globalState.get<string>('tierStatus.cachedTier');
  const cachedTier = coerceTier(cachedRaw);
  if (cachedTier !== undefined) return cachedTier;

  // Safe fallback keeps Local/provider BYOK available without inventing plan access.
  return 'byok';
}

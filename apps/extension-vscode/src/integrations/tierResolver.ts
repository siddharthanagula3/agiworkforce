import * as vscode from 'vscode';
import { type UIPlanTier, tierAtLeast } from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';
import { onAccountTierMayHaveChanged } from './tierRevalidation';

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
 * Tier ordering: lower index = lower tier.
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

function coerceTier(raw: string | undefined): Tier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  const remapped =
    normalized === 'hobby'
      ? 'basic'
      : normalized === 'pro+' || normalized === 'pro_plus'
        ? 'max'
        : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as Tier) : undefined;
}

const CACHED_TIER_KEY = 'tierStatus.cachedTier';
const CACHED_AT_KEY = 'tierStatus.cachedAtMs';

/**
 * Matches the CLI's own tier cache (`apps/cli/src/tier_cache.rs`), so a plan
 * change reaches both surfaces inside the same window.
 */
export const TIER_CACHE_TTL_MS = 300_000;

export type AccountTierLoader = (secrets: vscode.SecretStorage) => Promise<TierInfo | undefined>;

function cachedAtMs(context: vscode.ExtensionContext): number {
  const stored = context.globalState.get<number>(CACHED_AT_KEY);
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : 0;
}

export function isAccountTierStale(context: vscode.ExtensionContext): boolean {
  return Date.now() - cachedAtMs(context) >= TIER_CACHE_TTL_MS;
}

/** Drops the freshness stamp, not the tier: the next read revalidates. */
export async function markAccountTierStale(context: vscode.ExtensionContext): Promise<void> {
  if (cachedAtMs(context) !== 0) await context.globalState.update(CACHED_AT_KEY, undefined);
}

export function watchAccountTierInvalidation(context: vscode.ExtensionContext): void {
  onAccountTierMayHaveChanged(() => {
    void markAccountTierStale(context);
  });
}

const inFlight = new WeakMap<vscode.ExtensionContext, Promise<Tier | undefined>>();

/**
 * Re-reads the account tier when the cache has aged past the TTL.
 *
 * Unlike {@link refreshAccountTierCache}, an unreachable account API leaves the
 * cached tier in place: an offline editor must keep working at the plan the
 * user last verified, and the stamp stays stale so the next read retries.
 */
export async function revalidateAccountTier(
  context: vscode.ExtensionContext,
  loadTier: AccountTierLoader = fetchTierInfo,
): Promise<Tier | undefined> {
  const cached = coerceTier(context.globalState.get<string>(CACHED_TIER_KEY));
  if (!isAccountTierStale(context)) return cached;

  const pending = inFlight.get(context);
  if (pending) return pending;

  const run = (async (): Promise<Tier | undefined> => {
    let tierInfo: TierInfo | undefined;
    try {
      tierInfo = await loadTier(context.secrets);
    } catch {
      tierInfo = undefined;
    }
    const tier = coerceTier(tierInfo?.tier);
    if (tier === undefined) return cached;
    await writeAccountTier(context, tier);
    return tier;
  })().finally(() => inFlight.delete(context));

  inFlight.set(context, run);
  return run;
}

async function writeAccountTier(context: vscode.ExtensionContext, tier: Tier): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  const updates: Thenable<void>[] = [];
  if (context.globalState.get<string>(CACHED_TIER_KEY) !== tier) {
    updates.push(context.globalState.update(CACHED_TIER_KEY, tier));
  }
  updates.push(context.globalState.update(CACHED_AT_KEY, Date.now()));
  if (configuration.inspect<string>('currentTier')?.globalValue !== tier) {
    updates.push(configuration.update('currentTier', tier, vscode.ConfigurationTarget.Global));
  }
  await Promise.all(updates);
}

/**
 * Records the tier that a successful `GET /api/me` already reported, so the
 * account read the extension performs anyway doubles as the revalidation and
 * a plan change never waits for the TTL.
 */
export async function recordAccountIdentityTier(
  context: vscode.ExtensionContext,
  rawTier: string | undefined,
): Promise<Tier | undefined> {
  const tier = coerceTier(rawTier);
  if (tier === undefined) return undefined;
  await writeAccountTier(context, tier);
  return tier;
}

export async function clearAccountTierCache(context: vscode.ExtensionContext): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  const updates: Thenable<void>[] = [];
  if (context.globalState.get<string>(CACHED_TIER_KEY) !== undefined) {
    updates.push(context.globalState.update(CACHED_TIER_KEY, undefined));
  }
  if (cachedAtMs(context) !== 0) updates.push(context.globalState.update(CACHED_AT_KEY, undefined));
  if (configuration.inspect<string>('currentTier')?.globalValue !== 'unknown') {
    updates.push(configuration.update('currentTier', 'unknown', vscode.ConfigurationTarget.Global));
  }
  await Promise.all(updates);
}

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

  await writeAccountTier(context, tier);
  return tier;
}

/**
 * Synchronous tier resolution for callers that cannot await, currently the
 * webview HTML builders, which run inside `resolveWebviewView` / a constructor.
 *
 * Identical to {@link resolveTier}; kept for webview builders that cannot await.
 */
export function resolveTierSync(context: vscode.ExtensionContext): Tier {
  void revalidateAccountTier(context).catch(() => undefined);
  return coerceTier(context.globalState.get<string>(CACHED_TIER_KEY)) ?? 'byok';
}

/**
 * Resolve the current subscription tier.
 *
 * @param context - ExtensionContext used to read cached globalState tier.
 */
export async function resolveTier(
  context: vscode.ExtensionContext,
  loadTier: AccountTierLoader = fetchTierInfo,
): Promise<Tier> {
  return (await revalidateAccountTier(context, loadTier)) ?? 'byok';
}

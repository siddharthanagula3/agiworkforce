/**
 * usageMeter.ts -- Resolves the UsageMeter contract for the sidebar banner.
 *
 * Source classification (in order):
 *   1. Local provider (Ollama / LMStudio model prefix) → 'unbounded'
 *   2. AGI Cloud API reports a managed tier → 'managed-plan' with reported quota fields
 *   3. Otherwise → 'user-api-key' / not AGI-managed, with no invented quota
 */

import * as vscode from 'vscode';
import {
  formatPrivacyModeLabel,
  isFreePlan,
  type UsageMeter,
  type UIPlanTier,
} from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';

// ─── Local-provider detection ─────────────────────────────────────────────────

/** Model-ID prefixes that indicate a local LLM (no AGI-managed quota). */
const LOCAL_PREFIXES = ['ollama/', 'lmstudio/', 'lms/', 'local/'];
const VALID_TIERS: ReadonlySet<string> = new Set<UIPlanTier>([
  'local',
  'byok',
  'hobby',
  'pro',
  'pro_plus',
  'max',
]);

function isLocalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return LOCAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function coercePlanTier(raw: string | undefined): UIPlanTier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  const remapped = normalized === 'pro+' ? 'pro_plus' : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as UIPlanTier) : undefined;
}

function buildManagedMeter(tierInfo: TierInfo): UsageMeter | null {
  const tier = coercePlanTier(tierInfo.tier);
  if (tier === undefined || isFreePlan(tier)) return null;

  if (
    typeof tierInfo.tokensUsed === 'number' &&
    typeof tierInfo.tokenCap === 'number' &&
    tierInfo.tokenCap > 0
  ) {
    const remaining = Math.max(0, Math.min(1, 1 - tierInfo.tokensUsed / tierInfo.tokenCap));
    return {
      remaining,
      resetsAt: tierInfo.resetsAt ?? null,
      usedTokens: tierInfo.tokensUsed,
      limitTokens: tierInfo.tokenCap,
      source: 'managed-plan',
    };
  }

  return {
    remaining: null,
    resetsAt: tierInfo.resetsAt ?? null,
    source: 'managed-plan',
  };
}

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Classify the active model + auth state into a UIPlanTier.
 * Uses AGI Cloud tier data when available; otherwise falls back to BYOK because
 * no AGI-managed quota can be proven.
 */
export async function resolvePlanTier(secrets: vscode.SecretStorage): Promise<UIPlanTier> {
  const model = vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? '';
  if (isLocalModel(model)) return 'local';

  const tierInfo = await fetchTierInfo(secrets);
  const tier = coercePlanTier(tierInfo?.tier);
  if (tier !== undefined) return tier;

  return 'byok';
}

// ─── UsageMeter builder ───────────────────────────────────────────────────────

/**
 * Build a UsageMeter value from the current tier and session token counter.
 */
export async function resolveUsageMeter(
  secrets: vscode.SecretStorage,
  _sessionTokens: number,
): Promise<UsageMeter> {
  const model = vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? '';
  if (isLocalModel(model)) {
    return {
      remaining: null,
      resetsAt: null,
      source: 'unbounded',
    };
  }

  const tierInfo = await fetchTierInfo(secrets);
  if (tierInfo !== undefined) {
    const managedMeter = buildManagedMeter(tierInfo);
    if (managedMeter !== null) return managedMeter;
  }

  return {
    remaining: null,
    resetsAt: null,
    source: 'user-api-key',
  };
}

// ─── Formatting helpers (consumed by sidebarProvider HTML template) ──────────

/** Format usage as "used / total k" label. E.g. "6.2k/50k". */
export function formatManagedUsageLabel(
  remaining: number,
  limitTokens: number,
  reportedUsedTokens?: number,
): string {
  const usedTokens = reportedUsedTokens ?? Math.round((1 - remaining) * limitTokens);
  return `${fmtK(usedTokens)}/${fmtK(limitTokens)} tokens`;
}

export function formatUsageMeterFallbackLabel(source: UsageMeter['source']): string | null {
  switch (source) {
    case 'unbounded':
      return `${formatPrivacyModeLabel('local')} model - no quota tracking`;
    case 'user-api-key':
      return `${formatPrivacyModeLabel('byok')} mode - no AGI-managed quota is active`;
    case 'managed-plan':
      return `${formatPrivacyModeLabel('managed')} usage unavailable`;
  }
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Returns the number of days until the ISO reset timestamp. */
export function daysUntilReset(resetsAt: string): number {
  const diff = new Date(resetsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

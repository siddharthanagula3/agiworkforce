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
  canUseBillingPlanCapability,
  formatPrivacyModeLabel,
  type UsageMeter,
  type UIPlanTier,
} from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';
import { Config } from '../platform/config';

// ─── Local-provider detection ─────────────────────────────────────────────────

/** Model-ID prefixes that indicate a local LLM (no AGI-managed quota). */
const LOCAL_PREFIXES = ['ollama/', 'lmstudio/', 'lms/', 'local/'];
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

function isLocalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return LOCAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function coercePlanTier(raw: string | undefined): UIPlanTier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  // Legacy aliases from before the 2026-06-30 tier rename: 'hobby' -> 'basic',
  // 'pro+'/'pro_plus' -> 'max' (pro_plus was never shipped and was removed
  // with no direct successor).
  const remapped =
    normalized === 'hobby'
      ? 'basic'
      : normalized === 'pro+' || normalized === 'pro_plus'
        ? 'max'
        : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as UIPlanTier) : undefined;
}

export type ExtensionUsageMeter = UsageMeter & {
  accountPlanTier?: UIPlanTier;
  managedDeveloperEligible?: boolean;
  subscriptionStatus?: string;
};

function buildManagedMeter(tierInfo: TierInfo): ExtensionUsageMeter | null {
  const tier = coercePlanTier(tierInfo.tier);
  if (tier === undefined || tier === 'local' || tier === 'byok') return null;
  // `/api/usage` reports both the effective entitlement tier and, when billing
  // paused that entitlement, the recorded account plan. Keep those facts
  // separate: a past-due Pro account is not a Free account and should be sent
  // to billing rather than an upgrade funnel.
  const accountPlanTier = coercePlanTier(tierInfo.accountPlanTier) ?? tier;

  if (!canUseBillingPlanCapability(tier, 'developer_surfaces')) {
    return {
      remaining: null,
      resetsAt: tierInfo.resetsAt ?? null,
      source: 'user-api-key',
      accountPlanTier,
      managedDeveloperEligible: false,
      ...(tierInfo.subscriptionStatus === undefined
        ? {}
        : { subscriptionStatus: tierInfo.subscriptionStatus }),
    };
  }

  // Percentage-only contract: the server never returns exact token/cent counts,
  // so the meter carries a 0-1 remaining fraction derived from usage_percentage
  // and no usedTokens/limitTokens.
  if (typeof tierInfo.usagePercentage === 'number') {
    const remaining = Math.max(0, Math.min(1, 1 - tierInfo.usagePercentage / 100));
    return {
      remaining,
      resetsAt: tierInfo.resetsAt ?? null,
      source: 'managed-plan',
      accountPlanTier,
      managedDeveloperEligible: true,
      ...(tierInfo.subscriptionStatus === undefined
        ? {}
        : { subscriptionStatus: tierInfo.subscriptionStatus }),
    };
  }

  return {
    remaining: null,
    resetsAt: tierInfo.resetsAt ?? null,
    source: 'managed-plan',
    accountPlanTier,
    managedDeveloperEligible: true,
    ...(tierInfo.subscriptionStatus === undefined
      ? {}
      : { subscriptionStatus: tierInfo.subscriptionStatus }),
  };
}

// ─── Active-model context ─────────────────────────────────────────────────────

/**
 * The model the next request will actually use, plus whatever the caller already
 * knows about its trust boundary.
 *
 * Callers that dispatch a model other than the persisted `agiWorkforce.model`
 * setting (the sidebar composer can send a model with the turn) MUST pass it
 * here — resolving the boundary from the setting would describe a provider the
 * request is not going to.
 */
export interface ActiveModelContext {
  /** Model id that will be dispatched. Defaults to the `agiWorkforce.model` setting. */
  modelId?: string;
  /**
   * `true` when the workspace-scoped CLI discovery admitted this id as a local
   * runtime model. Trusted over prefix matching, which only recognises the
   * `ollama/` / `lmstudio/` / `lms/` / `local/` naming conventions.
   *
   * Never pass `true` for a model that has not been proven local: it suppresses
   * the cloud lookup and makes the surface claim nothing leaves the machine.
   */
  isLocalRuntimeModel?: boolean;
}

function resolveActiveModel(context: ActiveModelContext): {
  modelId: string;
  isLocal: boolean;
} {
  const modelId = context.modelId ?? Config.model();
  // Either signal is proof of a local runtime; neither is required to be present.
  return { modelId, isLocal: context.isLocalRuntimeModel === true || isLocalModel(modelId) };
}

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Classify the active model + auth state into a UIPlanTier.
 * Uses AGI Cloud tier data when available; otherwise falls back to BYOK because
 * no AGI-managed quota can be proven.
 */
export async function resolvePlanTier(
  secrets: vscode.SecretStorage,
  context: ActiveModelContext = {},
): Promise<UIPlanTier> {
  if (resolveActiveModel(context).isLocal) return 'local';

  const tierInfo = await fetchTierInfo(secrets);
  const tier = coercePlanTier(tierInfo?.tier);
  if (tier !== undefined) return tier;

  return 'byok';
}

// ─── UsageMeter builder ───────────────────────────────────────────────────────

/**
 * Build a UsageMeter value from the current tier and session token counter.
 *
 * `source` is the trust boundary the surface renders, so a local model must
 * never reach the cloud lookup: returning early keeps the account token off the
 * wire while a Local-boundary model is selected.
 */
export async function resolveUsageMeter(
  secrets: vscode.SecretStorage,
  _sessionTokens: number,
  context: ActiveModelContext = {},
): Promise<ExtensionUsageMeter> {
  if (resolveActiveModel(context).isLocal) {
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

/**
 * Trust-mode label for a meter with no numeric quota. Exhaustive over
 * `UsageMeter['source']`, so the caller always gets a real sentence to render
 * rather than an empty banner.
 */
export function formatUsageMeterFallbackLabel(source: UsageMeter['source']): string {
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

/**
 * usageMeter.ts -- Resolves the UsageMeter contract for the sidebar banner.
 *
 * Source classification (in order):
 *   1. Local provider (Ollama / LMStudio model prefix) → 'unbounded'
 *   2. BYOK: any non-empty agiWorkforce.apiKey stored in SecretStorage → 'user-api-key'
 *   3. Otherwise → 'managed-plan' with stub quota data (6 200 / 50 000 tokens, resets in 4 days)
 *
 * When real billing data is available from the AGI Cloud API it should replace
 * the stub values below — this service intentionally isolates that concern.
 */

import * as vscode from 'vscode';
import { isFreePlan, type UsageMeter, type UIPlanTier } from '@agiworkforce/types';
import { getApiKey } from '../utils/api';

// ─── Local-provider detection ─────────────────────────────────────────────────

/** Model-ID prefixes that indicate a local LLM (no AGI-managed quota). */
const LOCAL_PREFIXES = ['ollama/', 'lmstudio/', 'lms/', 'local/'];

function isLocalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return LOCAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Classify the active model + auth state into a UIPlanTier.
 * Does NOT make any network calls — reads only local config + SecretStorage.
 */
export async function resolvePlanTier(secrets: vscode.SecretStorage): Promise<UIPlanTier> {
  const model = vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? '';
  if (isLocalModel(model)) return 'local';

  const hasApiKey = (await getApiKey(secrets)) !== undefined;
  if (hasApiKey) return 'byok';

  return 'hobby'; // managed-plan stub
}

// ─── UsageMeter builder ───────────────────────────────────────────────────────

/**
 * Build a UsageMeter value from the current tier and session token counter.
 *
 * Managed-plan data is stubbed at 6 200 / 50 000 tokens with a 4-day reset.
 * Replace stub values with real API data when the billing endpoint is wired.
 */
export async function resolveUsageMeter(
  secrets: vscode.SecretStorage,
  sessionTokens: number,
): Promise<UsageMeter> {
  const tier = await resolvePlanTier(secrets);

  if (tier === 'local') {
    return {
      remaining: null,
      resetsAt: null,
      source: 'unbounded',
    };
  }

  if (isFreePlan(tier)) {
    // BYOK — show session-level token count; no AGI-managed quota
    return {
      remaining: null,
      resetsAt: null,
      source: 'user-api-key',
    };
  }

  // Managed plan (hobby / pro / max) — use stub data until billing API is wired
  const MANAGED_LIMIT = 50_000;
  const used = sessionTokens;
  const remaining = Math.max(0, MANAGED_LIMIT - used) / MANAGED_LIMIT;

  const resetsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

  return {
    remaining,
    resetsAt,
    source: 'managed-plan',
  };
}

// ─── Formatting helpers (consumed by sidebarProvider HTML template) ──────────

/** Format a 0–1 remaining fraction as "used / total k" label. E.g. "6.2k/50k". */
export function formatManagedUsageLabel(remaining: number, limitTokens: number): string {
  const usedTokens = Math.round((1 - remaining) * limitTokens);
  return `${fmtK(usedTokens)}/${fmtK(limitTokens)} tokens`;
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

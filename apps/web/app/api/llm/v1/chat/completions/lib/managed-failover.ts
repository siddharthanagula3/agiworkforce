import 'server-only';

/**
 * Managed provider failover for the Web twin (AUTO-ROUTER-MIGRATION-01).
 *
 * Mirrors the gateway's landed semantics (services/api-gateway/src/routes/
 * llm.ts failover section, commit "feat(gateway): execute the resolver's
 * fallback plan"): rotate to the resolver's next candidate ONLY
 *   - on availability-class failures (connection / server_error /
 *     server_overload / capacity_off_switch / api_timeout) — never on
 *     credential failures, rate limits, aborts, safety stops, context or
 *     invalid-model errors, or billing errors;
 *   - before the first byte reaches the client — route.ts's rotation point
 *     is `startProviderStream`'s first-chunk peek, so a rotated attempt has
 *     by construction produced NO content (failed-attempt text cannot leak);
 *   - for Auto-profile requests — explicit selections are structurally
 *     rotation-free because the resolver emits an empty fallback plan for
 *     them (`processed.fallbackModels` is `[]`);
 *   - after re-checking candidate admission at attempt time (tier ladder,
 *     provider resolution, adapter availability) — a stale plan entry is
 *     skipped, never served.
 *
 * Deliberately NARROWER than the gateway in one dimension: requests carrying
 * tools (provider-native tool definitions ride `llmRequest.tools` in the
 * provider's own wire shape) do not rotate — a fallback on a different
 * provider could not consume them. The gateway's fallback traffic never
 * carries such tools; on web this guard makes that assumption explicit.
 *
 * Billing: rotation happens INSIDE one managed-usage lifecycle — the single
 * reservation taken by the request processor spans all attempts, and
 * settlement happens once, priced by the model that actually served (the
 * attempt view below swaps `chatRequest.model`/`llmRequest.model`, which is
 * what `settleStreamBilling`/`finalizeBilling` price from, while carrying
 * `managedUsage` through unchanged).
 */

import { classifyError } from '@agiworkforce/provider-runtime';
import { canAccessModel } from '@/lib/model-tiers';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { logger } from '@/lib/logger';
import type { ProcessedRequest } from './request-processor';
import { buildThinkingConfig, resolveRequestEffort } from './request-processor';

/** Same five availability classes the gateway rotates on — see
 *  services/api-gateway/src/lib/providerStreamSafety.ts's
 *  FAILOVER_ELIGIBLE_CATEGORIES. */
const FAILOVER_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set([
  'connection',
  'server_error',
  'server_overload',
  'capacity_off_switch',
  'api_timeout',
]);

export function isFailoverEligibleError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  return FAILOVER_ELIGIBLE_CATEGORIES.has(classifyError(error).category);
}

export interface FailoverAttempt {
  model: string;
  provider: string;
  /** The derived per-attempt request view — same reservation, serving model. */
  processed: ProcessedRequest;
}

function requestCarriesTools(processed: ProcessedRequest): boolean {
  return Array.isArray(processed.llmRequest.tools) && processed.llmRequest.tools.length > 0;
}

/**
 * Derived per-attempt view of the processed request. The managed-usage
 * reservation, messages, caps, and request identity are the primary's; only
 * the serving route (model + provider) and the model-shaped tuning that
 * cannot transfer across providers (thinking config, effort) are recomputed.
 * `usedFallback`/`fallbackReason` are set so the existing response/persistence
 * rule (`usedFallback ? chatRequest.model : requestedModel`) stamps the model
 * that ACTUALLY served, and settlement prices by it.
 */
export function buildFailoverAttemptView(
  processed: ProcessedRequest,
  model: string,
  provider: string,
): ProcessedRequest {
  const providerLower = provider.toLowerCase();
  const effort = resolveRequestEffort(providerLower, model, processed.llmRequest.effort);
  const thinking = buildThinkingConfig({
    provider: providerLower,
    model,
    explicitThinking: processed.chatRequest.thinking,
    thinkingMode: processed.chatRequest.thinking_mode,
    effort,
  });
  return {
    ...processed,
    provider,
    usedFallback: true,
    fallbackReason: 'managed_failover',
    chatRequest: { ...processed.chatRequest, model },
    llmRequest: {
      ...processed.llmRequest,
      model,
      effort,
      thinking: thinking ?? undefined,
    },
  };
}

/**
 * Create the bounded rotation state for one request. `next(error)` returns
 * the next admissible attempt view, or null when rotation is not permitted
 * (ineligible failure class, aborted, tools present, plan exhausted, or no
 * candidate passes the per-attempt admission re-check).
 */
export function createFailoverPlan(
  processed: ProcessedRequest,
  options: {
    signal: AbortSignal;
    /** Providers route.ts can actually dispatch (ADAPTER_PROVIDERS keys). */
    isProviderDispatchable: (provider: string) => boolean;
  },
): { next: (error: unknown) => FailoverAttempt | null } {
  const remaining = [...(processed.fallbackModels ?? [])];
  const tier = processed.subscriptionTier;

  const nextAdmissibleCandidate = (): FailoverAttempt | null => {
    while (remaining.length > 0) {
      const candidate = remaining.shift() as string;
      let provider: string;
      try {
        provider = resolveProviderFromModel(candidate);
      } catch {
        logger.warn(
          { requestId: processed.requestId, model: candidate },
          'Managed failover candidate skipped: provider resolution failed',
        );
        continue;
      }
      if (!options.isProviderDispatchable(provider)) {
        logger.warn(
          { requestId: processed.requestId, model: candidate, provider },
          'Managed failover candidate skipped: provider not dispatchable',
        );
        continue;
      }
      // Fresh tier admission at attempt time — the plan was admitted at
      // resolve time, but the ladder is re-checked per attempt like the
      // gateway's enforcePlanTier re-check.
      if (tier !== undefined && !canAccessModel(candidate, tier)) {
        logger.warn(
          { requestId: processed.requestId, model: candidate, tier },
          'Managed failover candidate skipped: admission re-check failed',
        );
        continue;
      }
      return {
        model: candidate,
        provider,
        processed: buildFailoverAttemptView(processed, candidate, provider),
      };
    }
    return null;
  };

  return {
    next: (error: unknown): FailoverAttempt | null => {
      if (remaining.length === 0) return null;
      if (requestCarriesTools(processed)) return null;
      if (!isFailoverEligibleError(error, options.signal)) return null;
      const attempt = nextAdmissibleCandidate();
      if (attempt) {
        logger.warn(
          {
            requestId: processed.requestId,
            fromModel: processed.chatRequest.model,
            fromProvider: processed.provider,
            toModel: attempt.model,
            toProvider: attempt.provider,
            category: classifyError(error).category,
          },
          'Managed failover: rotating to fallback route',
        );
      }
      return attempt;
    },
  };
}

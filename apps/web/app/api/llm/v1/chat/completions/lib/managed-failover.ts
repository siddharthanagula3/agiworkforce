import 'server-only';

/**
 * Managed provider failover for the Web twin (AUTO-ROUTER-MIGRATION-01).
 *
 * Mirrors the gateway's landed semantics (services/api-gateway/src/routes/
 * llm.ts failover section): rotate to the resolver's next candidate ONLY
 *   - on availability-class failures (connection / server_error /
 *     server_overload / capacity_off_switch / api_timeout, plus
 *     direct-provider rate limits), or on a credential rejection, which
 *     condemns the ONE provider account whose managed key was refused and
 *     therefore skips that provider's remaining routes instead of replaying
 *     the same rejected key — never on aborts, safety stops, context or
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
 * provider's own wire shape) may rotate only within the same provider. A
 * different provider could not consume those definitions safely.
 *
 * Billing: rotation happens INSIDE one managed-usage lifecycle — the single
 * reservation taken by the request processor spans all attempts, and
 * settlement happens once, priced by the model that actually served (the
 * attempt view below swaps `chatRequest.model`/`llmRequest.model`, which is
 * what `settleStreamBilling`/`finalizeBilling` price from, while carrying
 * `managedUsage` through unchanged).
 */

import { classifyError, CredentialFailoverState } from '@agiworkforce/provider-runtime';
import { canAccessModel } from '@/lib/model-tiers';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { canFailoverToOpenRouter } from '@/lib/services/aggregator-routing';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { logger } from '@/lib/logger';
import type { ProcessedRequest } from './request-processor';
import { buildThinkingConfig, resolveRequestEffort } from './request-processor';

/** Same five availability classes the gateway rotates on — see
 *  services/api-gateway/src/lib/providerStreamSafety.ts's
 *  FAILOVER_ELIGIBLE_CATEGORIES, plus direct-provider rate limits. A managed
 *  Auto request should not fail because one upstream project exhausted quota;
 *  explicit selections remain rotation-free by construction.
 *
 *  Availability only: credential rejections rotate under the separate
 *  provider-scoped rule below (`CredentialFailoverState`), exactly as in the
 *  gateway. */
const FAILOVER_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set([
  'connection',
  'server_error',
  'server_overload',
  'capacity_off_switch',
  'api_timeout',
  'rate_limit',
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
    // CPST Stage-0 telemetry (managed cloud only,
    // docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.2): this is
    // the only place an ADDITIONAL provider attempt is created inside one billed
    // request, so it is the only honest place to count one. The counter rides
    // the attempt view, so whichever attempt finally settles carries the number
    // of rotations it took to get there. Observability only — nothing reads it
    // to decide anything.
    retries: (processed.retries ?? 0) + 1,
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
 * (ineligible failure class, aborted, plan exhausted, or no candidate passes
 * the per-attempt admission and tool-compatibility re-checks).
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
  const mustStayOnProvider = requestCarriesTools(processed);
  // Every attempt on this route authenticates with the PLATFORM's key for the
  // upstream it targets, so a rejected credential (401/403, revoked OAuth
  // token, disabled org, exhausted credit balance) condemns one provider
  // account and says nothing about the request or the other providers on the
  // plan. Per-request, never cached across requests: a suspension can lift.
  const credentialFailover = new CredentialFailoverState();
  // CPST `retries` lineage: each attempt view must be built from the LATEST
  // attempt view, not the original request view, or the counter re-computes
  // `(original.retries ?? 0) + 1 = 1` on every rotation and the ledger
  // under-counts multi-rotation requests. Only the counter lineage rides this
  // variable — admission, tool checks, and the OpenRouter route-retry all still
  // read the original `processed` on purpose.
  let latestView: ProcessedRequest = processed;

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
      if (credentialFailover.blocksRoute(provider)) {
        logger.warn(
          { requestId: processed.requestId, model: candidate, provider },
          'Managed failover candidate skipped: provider credentials already rejected',
        );
        continue;
      }
      if (mustStayOnProvider && provider !== processed.provider) {
        logger.warn(
          { requestId: processed.requestId, model: candidate, provider },
          'Managed failover candidate skipped: provider-native tools cannot transfer providers',
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
      const attemptView = buildFailoverAttemptView(latestView, candidate, provider);
      latestView = attemptView;
      return {
        model: candidate,
        provider,
        processed: attemptView,
      };
    }
    return null;
  };

  /**
   * Retry the SAME model through OpenRouter, once, before changing model.
   *
   * Rotation answers an outage by switching to a different model, which is a
   * worse answer than the user asked for and is why explicit selections are
   * rotation-free. OpenRouter resells the same models, so an Anthropic 503 —
   * or an Anthropic key the platform can no longer use — can be retried as the
   * identical model on another wire under a different credential; the user's
   * choice is preserved, and there is nothing to disclose because nothing
   * changed except the path.
   *
   * That difference is why this is allowed where rotation is not: it runs for
   * explicit selections and for requests with an empty fallback plan.
   *
   * Skipped when the request carries provider-native tool payloads
   * (`rawVendorTools` — Anthropic's `web_search_20260209`, Google's
   * `google_search`). Those are vendor-wire-specific and are not verified to
   * survive the proxy; ordinary function tools transfer fine because the model
   * on the far side is the same one. Attempted at most once per request, so a
   * persistent OpenRouter fault cannot turn one outage into a retry storm.
   */
  let routeRetryUsed = false;
  const routeRetryAttempt = (): FailoverAttempt | null => {
    if (routeRetryUsed) return null;
    const apiModelId = toProviderApiModelId(processed.llmRequest.model);
    if (!canFailoverToOpenRouter(processed.provider, apiModelId)) return null;
    if (!options.isProviderDispatchable('openrouter')) return null;
    const hasVendorNativeTools = (processed.llmRequest.tools ?? []).some(
      (tool) => !(tool && typeof tool === 'object' && 'function' in tool),
    );
    if (hasVendorNativeTools) return null;
    routeRetryUsed = true;
    // Same model — only the provider changes, so pricing, tier admission and
    // the response's model field all stay exactly as they were. Built from
    // `latestView` so the retries counter keeps its lineage across attempts.
    const attemptView = {
      ...buildFailoverAttemptView(latestView, processed.llmRequest.model, 'openrouter'),
      fallbackReason: 'openrouter_route_failover',
    };
    latestView = attemptView;
    return {
      model: processed.llmRequest.model,
      provider: 'openrouter',
      processed: attemptView,
    };
  };

  return {
    next: (error: unknown): FailoverAttempt | null => {
      if (options.signal.aborted) return null;
      const category = classifyError(error).category;
      // Recorded BEFORE any candidate lookup so the rejected provider's own
      // remaining plan routes are skipped instead of burning the turn on
      // guaranteed repeat rejections. Returns true only for the credential
      // class, which also admits a rotation the availability set refuses.
      const credentialRotation = credentialFailover.recordFailure(latestView.provider, category);
      if (!credentialRotation && !isFailoverEligibleError(error, options.signal)) return null;

      const viaRoute = routeRetryAttempt();
      if (viaRoute) {
        logger.warn(
          {
            requestId: processed.requestId,
            model: viaRoute.model,
            fromProvider: processed.provider,
            category,
            credentialRejectedProviders: credentialFailover.rejectedProviders(),
          },
          'Managed failover: retrying the same model via OpenRouter',
        );
        return viaRoute;
      }

      if (remaining.length === 0) return null;
      const attempt = nextAdmissibleCandidate();
      if (attempt) {
        logger.warn(
          {
            requestId: processed.requestId,
            fromModel: processed.chatRequest.model,
            fromProvider: processed.provider,
            toModel: attempt.model,
            toProvider: attempt.provider,
            category,
            credentialRejectedProviders: credentialFailover.rejectedProviders(),
          },
          'Managed failover: rotating to fallback route',
        );
      }
      return attempt;
    },
  };
}

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
 * The OpenRouter route-retry below is NOT drawn from the candidate plan, so the
 * policy filtering the request processor applies to `fallbackModels` does not
 * govern it. It is checked against the policy snapshot directly (`modelPolicy`
 * option), and a refusal falls through to the candidate rotation.
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
import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import type { ProcessedRequest } from './request-processor';
import { buildThinkingConfig, resolveRequestEffort } from './request-processor';

/** Availability classes only, plus direct-provider rate limits. A managed Auto
 *  request should not fail because one upstream project exhausted quota;
 *  explicit selections remain rotation-free by construction.
 *
 *  Credential rejections are deliberately excluded here — they rotate under the
 *  separate provider-scoped rule below (`CredentialFailoverState`). */
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
  processed: ProcessedRequest;
}

function requestCarriesTools(processed: ProcessedRequest): boolean {
  return Array.isArray(processed.llmRequest.tools) && processed.llmRequest.tools.length > 0;
}

export function buildFailoverAttemptView(
  processed: ProcessedRequest,
  model: string,
  provider: string,
): ProcessedRequest {
  const providerLower = provider.toLowerCase();
  const effort = resolveRequestEffort(
    providerLower,
    model,
    processed.llmRequest.effort,
    processed.subscriptionTier,
  );
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

export function createFailoverPlan(
  processed: ProcessedRequest,
  options: {
    signal: AbortSignal;
    isProviderDispatchable: (provider: string) => boolean;
    /**
     * The workspace model policy snapshot the request processor already read,
     * handed in so the OpenRouter route-retry below can be governed by it.
     *
     * It is a SNAPSHOT, deliberately: this plan runs inside a live stream's
     * failure path, and a database read there would put policy availability on
     * the critical path of every upstream hiccup. The request processor reads
     * the row once, before the first attempt, and every hop in the request —
     * primary gate, cheaper-model downgrade, plan filtering, and now the
     * route-retry — answers to that same one snapshot.
     *
     * `null` or omitted means UNGOVERNED, matching the evaluator's contract: no
     * policy row, personal scope, or a read that deliberately failed open. It
     * does NOT mean deny, because a briefly unreachable policy table must not
     * take failover away from every workspace that has no policy at all.
     */
    modelPolicy?: ModelAccessPolicy | null;
  },
): { next: (error: unknown) => FailoverAttempt | null } {
  const remaining = [...(processed.fallbackModels ?? [])];
  const tier = processed.subscriptionTier;
  const mustStayOnProvider = requestCarriesTools(processed);
  const credentialFailover = new CredentialFailoverState();
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
    // The workspace may forbid OpenRouter outright. `next()` consults this
    // route-retry BEFORE the candidate plan, and the retry does not draw from
    // that plan, so filtering `fallbackModels` upstream never reached here: a
    // workspace pinned to `allowedProviders: ['anthropic']` was still served
    // through OpenRouter on any availability-class failure. Same pure evaluator
    // the primary gate uses, against the snapshot already in hand.
    //
    // Note this asks about the SAME model on a DIFFERENT provider, which is the
    // whole point of the route-retry — so an explicit model allow can still
    // carry it through a provider block, exactly as the evaluator's documented
    // precedence says it should.
    const decision = evaluateModelAccess(options.modelPolicy ?? null, {
      provider: 'openrouter',
      modelId: processed.llmRequest.model,
    });
    if (!decision.allowed) {
      // Deliberately WITHOUT consuming `routeRetryUsed`: a policy refusal is not
      // a spent retry, and `next()` must fall through to the ordinary candidate
      // rotation rather than failing the request. The plan's candidates were
      // already filtered against this same policy upstream, so what the member
      // gets is a permitted model, not an error.
      logger.warn(
        {
          requestId: processed.requestId,
          model: processed.llmRequest.model,
          fromProvider: processed.provider,
          code: decision.code,
        },
        'Managed failover: OpenRouter route-retry refused by workspace model policy',
      );
      return null;
    }
    routeRetryUsed = true;
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

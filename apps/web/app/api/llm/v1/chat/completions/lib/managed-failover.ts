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
 *     the same rejected key, never on aborts, safety stops, context or
 *     invalid-model errors, or billing errors, or, under the narrow
 *     conditions `isRotatableRequestRejection` states, on a request the
 *     provider itself refused;
 *   - before the first byte reaches the client, route.ts's rotation point
 *     is `startProviderStream`'s first-chunk peek, so a rotated attempt has
 *     by construction produced NO content (failed-attempt text cannot leak);
 *   - for Auto-profile requests, explicit selections are structurally
 *     rotation-free because the resolver emits an empty fallback plan for
 *     them (`processed.fallbackModels` is `[]`);
 *   - after re-checking candidate admission at attempt time (tier ladder,
 *     provider resolution, adapter availability), a stale plan entry is
 *     skipped, never served.
 *
 * The OpenRouter route-retry below is NOT drawn from the candidate plan, so the
 * policy filtering the request processor applies to `fallbackModels` does not
 * govern it. It is checked against the policy snapshot directly (`modelPolicy`
 * option), and a refusal falls through to the candidate rotation.
 *
 * Deliberately NARROWER than the gateway in one dimension: requests carrying
 * function tools (provider-native tool definitions ride `llmRequest.tools` in
 * the provider's own wire shape) may rotate only within the same provider. A
 * different provider could not consume those definitions safely. A request
 * whose only tools are provider-native search markers is exempt: those carry
 * no state to lose (`appendWebSearchTool` reconstructs whichever shape the
 * new provider needs, or the Perplexity fallback if none), so it may rotate
 * across providers like any other availability failure.
 *
 * Billing: rotation happens INSIDE one managed-usage lifecycle, the single
 * reservation taken by the request processor spans all attempts, and
 * settlement happens once, priced by the model that actually served (the
 * attempt view below swaps `chatRequest.model`/`llmRequest.model`, which is
 * what `settleStreamBilling`/`finalizeBilling` price from, while carrying
 * `managedUsage` through unchanged).
 */

import { classifyError, CredentialFailoverState } from '@agiworkforce/provider-runtime';
import { isAutoModeModelId } from '@agiworkforce/types';
import { canAccessModel } from '@/lib/model-tiers';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { canFailoverToOpenRouter } from '@/lib/services/aggregator-routing';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { logger } from '@/lib/logger';
import { nextFreeLaneRoute } from '@/lib/services/free-lane/plan';
import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import { nativeSearchToolName } from '@/lib/web-search/required-search';
import type { ProcessedRequest } from './request-processor';
import { buildThinkingConfig, resolveRequestEffort } from './request-processor';

/** Availability classes only, plus direct-provider rate limits. A managed Auto
 *  request should not fail because one upstream project exhausted quota;
 *  explicit selections remain rotation-free by construction.
 *
 *  Credential rejections are deliberately excluded here, they rotate under the
 *  separate provider-scoped rule below (`CredentialFailoverState`).
 *
 *  `quota_exhausted` IS eligible: that route's window is spent, but a different
 *  route with its own quota is a legitimate answer. What must never appear here
 *  is `billing_exhausted`, see `NEVER_ROTATE_CATEGORIES`.
 *
 *  `empty_response` is eligible for a different reason than the rest: the
 *  route did not fail, it answered with nothing. A different route may
 *  simply produce content where this one did not. The tool loop is the only
 *  caller that ever raises it (via `EmptyProviderResponseError`), and it
 *  does so at most once per turn, see `tool-loop.ts`'s
 *  `emptyResponseRotationUsed`. */
const FAILOVER_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set([
  'connection',
  'server_error',
  'server_overload',
  'capacity_off_switch',
  'api_timeout',
  'rate_limit',
  'quota_exhausted',
  'empty_response',
]);

/**
 * Classes that must NEVER produce a rotation, whatever else says otherwise.
 *
 * `billing_exhausted` is the load-bearing member. Anthropic's "credit balance is
 * too low" used to classify as `auth`, and `CredentialFailoverState` treats any
 * `auth` as a bad credential worth rotating away from, so an AGIWorkforce
 * account that had simply run out of money would silently push the request onto
 * a DIFFERENT PAID provider and spend more there. An unfunded credential is a
 * valid credential; running out of money is an operator problem, not a routing
 * problem, and hiding it by spending elsewhere is the worst possible response.
 *
 * `safety` is here for a different reason: a policy refusal must never be
 * shopped around providers until one accepts the content. `content_blocked`
 * is the same refusal observed through a clean stream instead of a thrown
 * error, and must never rotate for the same reason.
 */
const NEVER_ROTATE_CATEGORIES: ReadonlySet<string> = new Set([
  'billing_exhausted',
  'safety',
  'content_blocked',
]);

const REQUEST_REJECTION_CATEGORY = 'client_error';
const REQUEST_REJECTION_STATUS = 400;
const FIRST_PROVIDER_STEP = 1;

export function isNeverRotateCategory(category: string): boolean {
  return NEVER_ROTATE_CATEGORIES.has(category);
}

export interface FailoverStepContext {
  step: number;
}

function isRotatableRequestRejection(
  processed: ProcessedRequest,
  classified: ReturnType<typeof classifyError>,
  context: FailoverStepContext | undefined,
): boolean {
  if (!context || context.step !== FIRST_PROVIDER_STEP) return false;
  if (classified.category !== REQUEST_REJECTION_CATEGORY) return false;
  if (classified.status !== REQUEST_REJECTION_STATUS) return false;
  return isAutoModeModelId(processed.requestedModel);
}

export function isFailoverEligibleError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  const classified = classifyError(error);
  if (NEVER_ROTATE_CATEGORIES.has(classified.category)) return false;
  // Deliberately does NOT consult `classified.fallbackable`. That flag answers
  // "should the caller swap models?" and is computed as `status >= 502 && <= 504`
  // for server errors, so honouring it here stopped rotation on a plain 500, on
  // ECONNRESET, and on a timeout - the exact failures cross-provider failover
  // exists to absorb. Rotation is decided by category alone.
  return FAILOVER_ELIGIBLE_CATEGORIES.has(classified.category);
}

export interface FailoverAttempt {
  model: string;
  provider: string;
  processed: ProcessedRequest;
}

function requestCarriesTools(processed: ProcessedRequest): boolean {
  const tools = processed.llmRequest.tools;
  if (!Array.isArray(tools) || tools.length === 0) return false;
  return tools.some((tool) => nativeSearchToolName(tool) === '');
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
     * the row once, before the first attempt, and every hop in the request.
     * primary gate, cheaper-model downgrade, plan filtering, and now the
     * route-retry, answers to that same one snapshot.
     *
     * `null` or omitted means UNGOVERNED, matching the evaluator's contract: no
     * policy row, personal scope, or a read that deliberately failed open. It
     * does NOT mean deny, because a briefly unreachable policy table must not
     * take failover away from every workspace that has no policy at all.
     */
    modelPolicy?: ModelAccessPolicy | null;
    /**
     * Observes every attempt failure with the classification already computed
     * here, before any rotation decision is taken.
     *
     * Handed in rather than imported so this module keeps no I/O dependency:
     * the free lane needs route health written from exactly this classification,
     * and classifying a second time at the call site would let the two answers
     * drift.
     */
    onAttemptFailure?: (failure: {
      provider: string;
      model: string;
      routeId: string | null;
      category: string;
      code: string;
      retryAfterSeconds?: number;
    }) => void;
    /**
     * Credentials the shared breaker already holds open, read once before
     * dispatch. Without it a key that has been dead since the last deploy is
     * rediscovered by every request, one refusal per route on that provider.
     */
    openCredentialProviders?: readonly string[];
    /**
     * Called the first time this request rejects a credential, so the rejection
     * outlives the request.
     */
    onCredentialRejected?: (provider: string) => void;
    /**
     * `true` when the route this candidate would dispatch on is in cooldown.
     * Consulted before the attempt, never after: a parked route that is only
     * discovered by failing on it is a breaker that does nothing.
     */
    isCandidateBreakerOpen?: (candidate: { modelKey: string; provider: string }) => boolean;
  },
): { next: (error: unknown, context?: FailoverStepContext) => FailoverAttempt | null } {
  const remaining = [...(processed.fallbackModels ?? [])];
  const tier = processed.subscriptionTier;
  const mustStayOnProvider = requestCarriesTools(processed);
  const credentialFailover = new CredentialFailoverState({
    ...(options.openCredentialProviders
      ? { openCredentialIds: options.openCredentialProviders }
      : {}),
    ...(options.onCredentialRejected ? { onCredentialRejected: options.onCredentialRejected } : {}),
  });
  const freeLane = processed.freeLane;
  const freeLaneAttempted: string[] = freeLane ? [freeLane.dispatchedRouteId] : [];
  let latestView: ProcessedRequest = processed;
  let latestRouteId: string | null = freeLane ? freeLane.dispatchedRouteId : null;

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
      if (options.isCandidateBreakerOpen?.({ modelKey: candidate, provider })) {
        logger.warn(
          { requestId: processed.requestId, model: candidate, provider },
          'Managed failover candidate skipped: route breaker is open',
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

  /**
   * Rotation for a free-lane request: re-enter the stage, never the paid plan.
   *
   * `free-auto.ts` documents `excludeRouteIds` as the mechanism for exactly this
   *, pick the next eligible $0 route without handing back one that already
   * failed, and re-running the stage rather than walking a precomputed list is
   * what lets a route parked by THIS request's failures drop out of the running.
   *
   * When it returns null the request ends. It does not fall through to the paid
   * candidate plan or the OpenRouter route-retry in either mode: `strict` may
   * never spend, and in `prefer` the fall-through is the INITIAL decision, taken
   * before dispatch. Rotating a half-served free request onto paid capacity
   * would spend money on a turn the user was told was free, and the subsidized
   * trial path it would be falling back to is itself rotation-free today.
   */
  const nextFreeLaneCandidate = (): FailoverAttempt | null => {
    if (!freeLane) return null;
    for (;;) {
      const route = nextFreeLaneRoute(freeLane, freeLaneAttempted, Date.now());
      if (!route) return null;
      freeLaneAttempted.push(route.routeId);

      if (credentialFailover.blocksRoute(route.provider)) {
        logger.warn(
          { requestId: processed.requestId, routeId: route.routeId, provider: route.provider },
          'Free-lane failover candidate skipped: provider credentials already rejected',
        );
        continue;
      }
      if (
        options.isCandidateBreakerOpen?.({ modelKey: route.modelKey, provider: route.provider })
      ) {
        logger.warn(
          { requestId: processed.requestId, routeId: route.routeId, provider: route.provider },
          'Free-lane failover candidate skipped: route breaker is open',
        );
        continue;
      }
      if (mustStayOnProvider && route.provider !== processed.provider) {
        logger.warn(
          { requestId: processed.requestId, routeId: route.routeId, provider: route.provider },
          'Free-lane failover candidate skipped: provider-native tools cannot transfer providers',
        );
        continue;
      }
      if (!options.isProviderDispatchable(route.provider)) {
        logger.warn(
          { requestId: processed.requestId, routeId: route.routeId, provider: route.provider },
          'Free-lane failover candidate skipped: provider not dispatchable',
        );
        continue;
      }
      if (tier !== undefined && !canAccessModel(route.modelKey, tier)) {
        logger.warn(
          { requestId: processed.requestId, routeId: route.routeId, tier },
          'Free-lane failover candidate skipped: admission re-check failed',
        );
        continue;
      }

      // The plan travels with the attempt so settlement and health writes name
      // the route that actually served, not the one this request opened with.
      const attemptView: ProcessedRequest = {
        ...buildFailoverAttemptView(latestView, route.modelKey, route.provider),
        freeLane: { ...freeLane, dispatchedRouteId: route.routeId },
      };
      latestView = attemptView;
      latestRouteId = route.routeId;
      return { model: route.modelKey, provider: route.provider, processed: attemptView };
    }
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
    // whole point of the route-retry, so an explicit model allow can still
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
    next: (error: unknown, context?: FailoverStepContext): FailoverAttempt | null => {
      if (options.signal.aborted) return null;
      const classified = classifyError(error);
      const category = classified.category;
      // Reported before any rotation branch, so a class that must never rotate
      // still records why the route stopped serving.
      options.onAttemptFailure?.({
        provider: latestView.provider,
        model: latestView.chatRequest.model,
        routeId: latestRouteId,
        category,
        code: classified.code,
        ...(classified.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: classified.retryAfterSeconds }
          : {}),
      });
      // Checked FIRST and unconditionally: the credential-rotation path below
      // must not be able to re-open a class we have decided may never rotate.
      // This is the guard that stops an exhausted paid account from quietly
      // spending through a different paid provider.
      if (isNeverRotateCategory(category)) {
        logger.warn(
          {
            requestId: processed.requestId,
            provider: latestView.provider,
            model: latestView.chatRequest.model,
            category,
            code: classified.code,
          },
          'Managed failover refused: failure class must never rotate',
        );
        return null;
      }
      const credentialRotation = credentialFailover.recordFailure(latestView.provider, category);
      if (
        !credentialRotation &&
        !isFailoverEligibleError(error, options.signal) &&
        !isRotatableRequestRejection(processed, classified, context)
      ) {
        return null;
      }

      if (freeLane) {
        const fromRouteId = latestRouteId;
        const fromProvider = latestView.provider;
        const viaFreeLane = nextFreeLaneCandidate();
        logger.warn(
          {
            requestId: processed.requestId,
            fromRouteId,
            fromProvider,
            toRouteId: viaFreeLane ? latestRouteId : null,
            category,
            mode: freeLane.mode,
          },
          viaFreeLane
            ? 'Free-lane failover: re-entered the stage for the next zero-cost route'
            : 'Free-lane failover: the stage has no further zero-cost route; refusing to rotate onto paid capacity',
        );
        return viaFreeLane;
      }

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

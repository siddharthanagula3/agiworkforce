import 'server-only';

import { classifyError, CredentialFailoverState } from '@agiworkforce/provider-runtime';
import { isAutoModeModelId } from '@agiworkforce/types';
import { canAccessModel } from '@/lib/model-tiers';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { canFailoverToOpenRouter } from '@/lib/services/aggregator-routing';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { logger } from '@/lib/logger';
import { nextFreeLaneRoute } from '@/lib/services/free-lane/plan';
import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import type { ProcessedRequest } from './request-processor';
import { buildThinkingConfig, resolveRequestEffort } from './request-processor';

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
  },
): { next: (error: unknown, context?: FailoverStepContext) => FailoverAttempt | null } {
  const remaining = [...(processed.fallbackModels ?? [])];
  const tier = processed.subscriptionTier;
  const mustStayOnProvider = requestCarriesTools(processed);
  const credentialFailover = new CredentialFailoverState();
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

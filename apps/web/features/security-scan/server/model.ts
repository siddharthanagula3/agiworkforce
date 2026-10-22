import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { estimateTokens, resolveAutoRoute } from '@agiworkforce/routing';
import {
  clampEffortToEntitlement,
  getModelEffortOptions,
  modelDisplayNameById,
  type Effort,
} from '@agiworkforce/types';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { logger } from '@/lib/logger';
import { orderInstructionBlocks } from '@/lib/prompts/instruction-precedence';
import {
  sideCallProviderAllowed,
  sideCallRoutingRequest,
} from '@/lib/server/side-call-training-policy';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import {
  reserveBackgroundUsage,
  type BackgroundUsageLease,
} from '@/lib/services/background-usage-lease';
import { fingerprintManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';

export const SECURITY_SCAN_QUOTA_FEATURE = 'security_scan';
const PROVIDER_TIMEOUT_MS = 90_000;
const LEASE_SLACK_SECONDS = 60;
const MS_PER_SECOND = 1_000;

export interface SecurityScanModelCall {
  ref: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface SecurityScanModelAnswer {
  text: string;
}

export interface SecurityScanModel {
  label: string;
  call(call: SecurityScanModelCall): Promise<SecurityScanModelAnswer>;
}

export class SecurityScanNoRouteError extends Error {
  constructor() {
    super("No model that meets this account's data settings is available for a security scan");
    this.name = 'SecurityScanNoRouteError';
  }
}

export class SecurityScanBudgetError extends Error {
  constructor() {
    super('Your usage allowance cannot cover a security scan right now');
    this.name = 'SecurityScanBudgetError';
  }
}

export interface SecurityScanModelInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  scanId: string;
  /** A catalogue model id the account chose, or null for Auto. */
  selection?: string | null;
  /** Reasoning effort for the chosen model, or null to leave it at the model's default. */
  effort?: Effort | null;
  signal?: AbortSignal;
}

export async function resolveSecurityScanModel(
  input: SecurityScanModelInput,
): Promise<SecurityScanModel> {
  const routing = await sideCallRoutingRequest(input.db, input.userId, {
    selection: input.selection ?? 'auto',
    taskType: 'coding',
    subscriptionTier: input.planTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (!routing) throw new SecurityScanNoRouteError();
  const decision = resolveAutoRoute(routing);
  if (decision.status === 'unavailable') {
    logger.warn({ code: decision.code }, '[security-scan] no managed route available');
    throw new SecurityScanNoRouteError();
  }
  const route = decision;
  const effort =
    input.effort && getModelEffortOptions(route.modelKey).includes(input.effort)
      ? clampEffortToEntitlement(route.modelKey, input.effort, input.planTier)
      : undefined;
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  if (!(await sideCallProviderAllowed(input.db, input.userId, dispatchProvider))) {
    throw new SecurityScanNoRouteError();
  }

  async function call(modelCall: SecurityScanModelCall): Promise<SecurityScanModelAnswer> {
    let lease: BackgroundUsageLease;
    try {
      lease = await reserveBackgroundUsage({
        db: input.db,
        userId: input.userId,
        organizationId: input.organizationId,
        planTier: input.planTier,
        idempotencyKey: `security-scan:${input.scanId}:${modelCall.ref}`,
        requestHash: fingerprintManagedUsageRequest({
          kind: SECURITY_SCAN_QUOTA_FEATURE,
          scanId: input.scanId,
          call: modelCall.ref,
          provider: route.provider,
          model: route.modelKey,
        }),
        provider: route.provider,
        model: route.modelKey,
        routeId: route.routeId,
        estimatedPromptTokens: estimateTokens(
          `${modelCall.system}\n${modelCall.prompt}`,
          route.modelKey,
        ),
        maxOutputTokens: modelCall.maxOutputTokens,
        leaseSeconds: Math.ceil(PROVIDER_TIMEOUT_MS / MS_PER_SECOND) + LEASE_SLACK_SECONDS,
        quotaFeature: SECURITY_SCAN_QUOTA_FEATURE,
      });
    } catch (error) {
      logger.warn({ error, call: modelCall.ref }, '[security-scan] usage reservation refused');
      throw new SecurityScanBudgetError();
    }

    const request = openAIWireRequestToChatRequest({
      model: route.providerModelId,
      messages: [
        ...orderInstructionBlocks([{ layer: 'system', text: modelCall.system }]).map(
          ({ text }) => ({ role: 'system' as const, content: text }),
        ),
        { role: 'user' as const, content: modelCall.prompt },
      ],
      max_tokens: modelCall.maxOutputTokens,
      temperature: 0,
      stream: false,
    });
    if (effort) request.effort = effort;
    const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    let response;
    try {
      await lease.providerStarted();
      response = await drainToLlmResponse(
        buildServerProviderAdapter(dispatchProvider).stream(request, signal),
        route.modelKey,
        (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
        resolveWireMode(dispatchProvider),
      );
    } catch (error) {
      await lease
        .failed({ type: SECURITY_SCAN_QUOTA_FEATURE, call: modelCall.ref })
        .catch((releaseError: unknown) => {
          logger.error({ releaseError }, '[security-scan] reservation release failed');
        });
      throw error;
    }
    const usage = {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      cacheReadInputTokens: response.cachedInputTokens,
      cacheCreationInputTokens: response.cacheCreationInputTokens,
      cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
    };
    await lease.completed({
      provider: route.provider,
      model: route.modelKey,
      routeId: route.routeId,
      usage,
      record: { ...usage, type: SECURITY_SCAN_QUOTA_FEATURE, call: modelCall.ref },
    });
    return { text: response.content };
  }

  return { label: modelDisplayNameById(route.modelKey) ?? route.modelKey, call };
}

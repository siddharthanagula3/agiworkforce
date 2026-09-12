import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import {
  PLAN_LABEL,
  canAccessModelForSubscriptionTier,
  effectivePlanTier,
  getDeveloperLabel,
  getMinimumRequiredTier,
  getModelAvailability,
  getModelRegistryFacts,
  listManagedRoutesForModel,
  modelsCatalogJson as modelsData,
  normalizeUIPlanTier,
  providerLabels,
  type ModelAvailability,
  type ModelEnvironment,
  type ModelMetadata,
} from '@agiworkforce/types';
import {
  MODEL_PICKER_FILTER_CAPABILITIES,
  getModelPriceBand,
  listPickerChatModels,
  type ModelPickerFilterCapability,
  type ModelPickerPriceBand,
} from '@agiworkforce/unified-chat/model-picker';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';
import {
  getProviderAvailabilityMap,
  type ProviderAvailabilitySignal,
} from '@/lib/services/provider-availability-service';
import { freePoolDecisions, type FreePoolDecision } from '@/lib/server/free-pools';
import {
  eventAllowsModel,
  readEventPromotion,
  type EventPromotion,
} from '@/lib/server/event-access';

export const runtime = 'nodejs';

const ANONYMOUS_PLAN_TIER = 'free';

export type ModelCatalogueRouteStatus = 'available' | 'degraded' | 'not_configured';
export type ModelCatalogueFreeInventory = 'promotional' | 'recurring';

export interface ModelCatalogueRoute {
  routeId: string;
  provider: string;
  label: string;
  isDefault: boolean;
  status: ModelCatalogueRouteStatus;
  freeInventory: ModelCatalogueFreeInventory | null;
}

interface RouteContext {
  configuredProviders: ReadonlySet<string>;
  availabilityByProvider: Readonly<Record<string, ProviderAvailabilitySignal>>;
  poolsByRouteId: ReadonlyMap<string, FreePoolDecision>;
  eventPromotion: EventPromotion;
}

function freeInventoryOf(
  decision: FreePoolDecision | undefined,
): ModelCatalogueFreeInventory | null {
  if (!decision?.eligible) return null;
  return decision.entry.expiresAtMs === null ? 'recurring' : 'promotional';
}

function routeStatus(provider: string, context: RouteContext): ModelCatalogueRouteStatus {
  if (!context.configuredProviders.has(provider)) return 'not_configured';
  return context.availabilityByProvider[provider] ? 'degraded' : 'available';
}

function toCatalogueRoutes(modelId: string, context: RouteContext): ModelCatalogueRoute[] {
  const routes: ModelCatalogueRoute[] = [];
  for (const route of listManagedRoutesForModel(modelId)) {
    const label = providerLabels[route.provider];
    const status = routeStatus(route.provider, context);
    if (!label || status === 'not_configured') continue;
    routes.push({
      routeId: route.routeId,
      provider: route.provider,
      label,
      isDefault: route.isDefault,
      status,
      freeInventory: freeInventoryOf(context.poolsByRouteId.get(route.routeId)),
    });
  }
  return routes;
}

async function buildRouteContext(models: readonly ModelMetadata[]): Promise<RouteContext> {
  const nowMs = Date.now();
  const providers = new Set<string>();
  for (const model of models) {
    for (const route of listManagedRoutesForModel(model.id)) providers.add(route.provider);
  }
  return {
    configuredProviders: listAvailableManagedProviderIds(),
    availabilityByProvider: await getProviderAvailabilityMap([...providers], nowMs),
    poolsByRouteId: new Map(
      freePoolDecisions(nowMs).map((decision) => [decision.entry.routeId, decision]),
    ),
    eventPromotion: readEventPromotion(nowMs),
  };
}

export type ModelCatalogueCapabilities = Readonly<
  Partial<Record<ModelPickerFilterCapability, boolean>>
>;

/**
 * What admission reasoned over, kept on the server. Which reseller or gateway
 * carries a model is commercial information: it names our suppliers, our route
 * ids and which of them we hold free inventory on. It decides `admitted` and
 * `temporarilyUnavailable` here and then stops; the customer chooses a model,
 * never a supplier, so nothing downstream needs it.
 */
export interface CatalogueEntry extends ModelCatalogueEntry {
  routes: ModelCatalogueRoute[];
  /**
   * The default route's source and its label. `providerLabel` is the hosting
   * platform, not the model's author: Qwen's reads "Alibaba Model Studio" while
   * its developer is "Qwen". The picker groups by developer and never showed
   * either of these.
   */
  provider: string;
  providerLabel: string;
}

export interface ModelCatalogueEntry {
  id: string;
  displayName: string;
  developer: string;
  developerLabel: string;
  family: string | null;
  /**
   * How many executable routes back this model. The count carries the only
   * thing the client acts on, that at least one exists, without naming any.
   */
  routeCount: number;
  isRouter: boolean;
  releasedOn: string | null;
  stage: string | null;
  openWeight: boolean;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  inputPerMillion: number;
  outputPerMillion: number;
  priceBand: ModelPickerPriceBand | null;
  capabilities: ModelCatalogueCapabilities;
  admitted: boolean;
  /**
   * Configured and entitled, but every route it has is currently degraded, so
   * asking it a question right now fails. Distinct from `admitted`: the model
   * stays known, priced and described, and recovers on its own when the route
   * health mark expires. The picker offers it as unavailable rather than
   * selectable.
   */
  temporarilyUnavailable: boolean;
  /** Selectable only because an event promotion is active, not by plan. */
  eventAccess: boolean;
  minimumPlanLabel: string | null;
  availability: ModelAvailability;
  requiresEnvironment: ModelEnvironment | null;
}

export interface ModelCatalogueResponse {
  models: ModelCatalogueEntry[];
  count: number;
  planTier: string;
  planLabel: string;
  version: string;
  lastUpdated: string;
}

function projectCapabilities(
  capabilities: Readonly<Record<string, boolean | null | undefined>>,
): ModelCatalogueCapabilities {
  return Object.fromEntries(
    MODEL_PICKER_FILTER_CAPABILITIES.map((name) => [name, capabilities[name] === true]),
  ) as ModelCatalogueCapabilities;
}

function toCatalogueEntry(
  model: ModelMetadata,
  planTier: string,
  context: RouteContext,
): CatalogueEntry | null {
  const facts = getModelRegistryFacts(model.id);
  if (!facts) return null;
  // Executability, not presentation: these are the registry's approved managed
  // routes narrowed to providers this deployment actually holds a credential
  // for. A model with none of them cannot answer for anybody, so it is not part
  // of the customer catalogue at any tier. Two open-weight models reached
  // production selectable on Free with an empty route list, because their only
  // approved route is on a provider this deployment holds no credential for and
  // admission never consulted that. The registry keeps knowing about the model; the
  // customer surface simply stops offering something it cannot serve.
  const routes = toCatalogueRoutes(model.id, context);
  if (routes.length === 0) return null;
  // Permanent entitlement OR an active event promotion, AND executable. The
  // promotion widens who may ask; it never manufactures supply, so the route
  // requirement above still decides whether anyone can be offered the model.
  // Health is separate from supply: a route that exists but is degraded still
  // proves the model is configured, so it is reported rather than removed. An
  // event never promotes a model nobody can currently reach.
  const temporarilyUnavailable = routes.every((route) => route.status === 'degraded');
  const eventAllowed =
    !temporarilyUnavailable && eventAllowsModel(model.id, planTier, context.eventPromotion);
  const permanentlyAllowed = canAccessModelForSubscriptionTier(model.id, planTier);
  const admitted = (permanentlyAllowed || eventAllowed) && routes.length > 0;
  const minimumTier = getMinimumRequiredTier(model.id);
  if (!admitted && !minimumTier) return null;
  return {
    id: model.id,
    displayName: model.name,
    provider: model.provider,
    providerLabel: providerLabels[model.provider] ?? model.provider,
    developer: facts.developer,
    developerLabel: getDeveloperLabel(facts.developer),
    family: facts.family,
    routes,
    routeCount: routes.length,
    isRouter: facts.isRouter,
    releasedOn: facts.releasedOn,
    stage: facts.stage,
    openWeight: model.openWeight === true,
    contextTokens: model.contextWindow ?? null,
    maxOutputTokens: model.maxOutputTokens ?? null,
    inputPerMillion: model.inputCost,
    outputPerMillion: model.outputCost,
    priceBand: getModelPriceBand(model.id),
    capabilities: projectCapabilities(facts.capabilities),
    admitted,
    temporarilyUnavailable,
    // Temporary access reads differently from a plan the user bought, so the
    // picker can say "Free during event" instead of implying it is included.
    eventAccess: eventAllowed && !permanentlyAllowed,
    minimumPlanLabel: admitted || !minimumTier ? null : PLAN_LABEL[minimumTier],
    availability: getModelAvailability(model),
    requiresEnvironment: model.requiresEnvironment ?? null,
  };
}

/**
 * The admission decision with its evidence attached, for the server and for the
 * tests that hold it to the executability rule. The HTTP body is the projection
 * of this, so a test asserting here is asserting the real decision rather than
 * what survives redaction.
 */
export async function buildCatalogueEntries(planTier: string): Promise<CatalogueEntry[]> {
  const pickerModels = listPickerChatModels();
  const context = await buildRouteContext(pickerModels);
  return pickerModels
    .map((model) => toCatalogueEntry(model, planTier, context))
    .filter((entry): entry is CatalogueEntry => entry !== null);
}

function toWireEntry(entry: CatalogueEntry): ModelCatalogueEntry {
  const { routes: _routes, provider: _provider, providerLabel: _providerLabel, ...wire } = entry;
  return wire;
}

async function resolvePlanTier(request: NextRequest): Promise<string> {
  try {
    const { userId } = await getClerkAuthUser(request);
    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
    const subscription = await SubscriptionService.getSubscription(db, userId);
    return effectivePlanTier(subscription?.plan_tier, subscription?.status);
  } catch {
    return ANONYMOUS_PLAN_TIER;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const catalog = modelsData as { version: number; lastUpdated: string };
    const planTier = await resolvePlanTier(request);
    const models = (await buildCatalogueEntries(planTier)).map(toWireEntry);

    logger.info({ modelCount: models.length, planTier }, 'Model catalogue projection served');

    const body: ModelCatalogueResponse = {
      models,
      count: models.length,
      planTier,
      planLabel: PLAN_LABEL[normalizeUIPlanTier(planTier, 'free')],
      version: String(catalog.version),
      lastUpdated: catalog.lastUpdated,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to serve the model catalogue projection');

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load the model catalogue' } },
      { status: 500, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }
}

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

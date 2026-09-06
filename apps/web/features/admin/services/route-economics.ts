import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';
import { getDeveloperLabel, providerLabels } from '@agiworkforce/types';
import { getOptionalEnv } from '@shared/utils/env';

import { freePoolDecisions, type FreePoolDecision } from '@/lib/server/free-pools';
import { dispatchProviderForRoute } from '@/lib/services/aggregator-routing';
import { gatewayRoutesEnabled, hasGatewayRouteCredentials } from '@/lib/services/gateway-routing';
import {
  getProtocolRouteHarness,
  hasServerProviderKey,
} from '@/lib/services/provider-adapter-service';

import { readRouteScopeHealth, type RouteScopeHealth } from './routing-health-metrics';

const LIVE_AVAILABILITY = 'live';
const PERCENT_SCALE = 100;

interface RegistryRoutePricing {
  currency?: string;
  unit?: string;
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

interface RegistryRouteDiscount {
  minPercent?: number;
  listPricing?: RegistryRoutePricing;
}

interface RegistryRouteRecord {
  modelKey: string;
  provider: string;
  providerModelId: string;
  harnessId: string;
  trustModes?: readonly string[];
  availability: string;
  selectable?: boolean;
  isDefault?: boolean;
  cacheClass?: string;
  commercialStatus: string;
  dataRetention: string;
  pricing?: RegistryRoutePricing;
  discount?: RegistryRouteDiscount;
}

interface RegistryModelRecord {
  identity?: {
    displayName?: string;
    developer?: string;
    kind?: string;
    openWeight?: boolean;
    license?: string;
  };
  lifecycle?: { stage?: string };
}

interface RegistryCapabilityRecord {
  textInput?: boolean | null;
  imageInput?: boolean | null;
  audioInput?: boolean | null;
  videoInput?: boolean | null;
  textOutput?: boolean | null;
  imageOutput?: boolean | null;
  audioOutput?: boolean | null;
  videoOutput?: boolean | null;
  streaming?: boolean | null;
  structuredOutput?: boolean | null;
  functionCalling?: boolean | null;
  reasoning?: boolean | null;
}

interface RegistryLimitsRecord {
  contextTokens?: number | null;
}

interface RegistryGovernanceRecord {
  dataRetentionClass?: string;
  zeroDataRetentionAvailability?: string;
  trainsOnInputs?: string;
  residencyRegions?: readonly string[];
  verifiedOn?: string;
}

const routeRecords = modelRegistry.routes as unknown as Readonly<
  Record<string, RegistryRouteRecord>
>;
const modelRecords = modelRegistry.models as unknown as Readonly<
  Record<string, RegistryModelRecord>
>;
const capabilityRecords = modelRegistry.capabilities as unknown as Readonly<
  Record<string, RegistryCapabilityRecord>
>;
const limitRecords = modelRegistry.limits as unknown as Readonly<
  Record<string, RegistryLimitsRecord>
>;
const governanceRecords = modelRegistry.governance as unknown as Readonly<
  Record<string, RegistryGovernanceRecord>
>;

export type RouteFreeStatus =
  | 'eligible'
  | 'not_verified'
  | 'expired'
  | 'terms_incompatible'
  | 'no_hard_stop'
  | 'none';

const FREE_STATUS_BY_REASON: Readonly<Record<string, RouteFreeStatus>> = {
  not_verified_free: 'not_verified',
  verification_expired: 'expired',
  terms_incompatible: 'terms_incompatible',
  no_hard_stop_before_paid: 'no_hard_stop',
};

export interface RouteModality {
  textInput: boolean | null;
  imageInput: boolean | null;
  audioInput: boolean | null;
  videoInput: boolean | null;
  textOutput: boolean | null;
  imageOutput: boolean | null;
  audioOutput: boolean | null;
  videoOutput: boolean | null;
}

export interface RouteFreePool {
  status: RouteFreeStatus;
  poolId: string | null;
  window: string | null;
  limit: number | null;
  unit: string | null;
  expiresAt: string | null;
  hardStopsBeforePaid: boolean | null;
}

export interface RouteEconomicsRow {
  routeId: string;
  modelKey: string;
  modelName: string;
  developerId: string | null;
  developerLabel: string | null;
  providerId: string;
  providerLabel: string;
  providerModelId: string;
  harnessId: string;
  availability: string;
  selectable: boolean;
  isDefault: boolean;
  trustModes: readonly string[];
  lifecycleStage: string | null;
  commercialStatus: string;
  cacheClass: string | null;
  currency: string | null;
  unit: string | null;
  listInputPerMillion: number | null;
  listOutputPerMillion: number | null;
  effectiveInputPerMillion: number | null;
  effectiveOutputPerMillion: number | null;
  cacheReadPerMillion: number | null;
  cacheWritePerMillion: number | null;
  discountPercent: number | null;
  contextTokens: number | null;
  modality: RouteModality;
  functionCalling: boolean | null;
  structuredOutput: boolean | null;
  reasoning: boolean | null;
  streaming: boolean | null;
  openWeight: boolean | null;
  license: string | null;
  dataRetention: string;
  zeroDataRetention: string | null;
  trainsOnInputs: string | null;
  residencyRegions: readonly string[] | null;
  governanceVerifiedOn: string | null;
  free: RouteFreePool;
  credentialConfigured: boolean;
  health: RouteScopeHealth | null;
}

export interface RouteEconomicsReport {
  routes: RouteEconomicsRow[];
}

function toNullableNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNullableBoolean(value: boolean | null | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function discountPercentOf(route: RegistryRouteRecord): number | null {
  const minPercent = toNullableNumber(route.discount?.minPercent);
  if (minPercent === null || minPercent <= 0 || minPercent >= PERCENT_SCALE) return null;
  return minPercent;
}

export function effectivePrice(
  listPerMillion: number | null,
  discountPercent: number | null,
): number | null {
  if (listPerMillion === null) return null;
  if (discountPercent === null) return listPerMillion;
  return listPerMillion * (1 - discountPercent / PERCENT_SCALE);
}

function toModality(capabilities: RegistryCapabilityRecord | undefined): RouteModality {
  return {
    textInput: toNullableBoolean(capabilities?.textInput),
    imageInput: toNullableBoolean(capabilities?.imageInput),
    audioInput: toNullableBoolean(capabilities?.audioInput),
    videoInput: toNullableBoolean(capabilities?.videoInput),
    textOutput: toNullableBoolean(capabilities?.textOutput),
    imageOutput: toNullableBoolean(capabilities?.imageOutput),
    audioOutput: toNullableBoolean(capabilities?.audioOutput),
    videoOutput: toNullableBoolean(capabilities?.videoOutput),
  };
}

function toFreePool(decision: FreePoolDecision | undefined): RouteFreePool {
  if (!decision) {
    return {
      status: 'none',
      poolId: null,
      window: null,
      limit: null,
      unit: null,
      expiresAt: null,
      hardStopsBeforePaid: null,
    };
  }
  const { entry } = decision;
  return {
    status: decision.eligible
      ? 'eligible'
      : (FREE_STATUS_BY_REASON[decision.reason] ?? 'not_verified'),
    poolId: entry.poolId,
    window: entry.window,
    limit: entry.limit,
    unit: entry.unit,
    expiresAt: entry.expiresAtMs === null ? null : new Date(entry.expiresAtMs).toISOString(),
    hardStopsBeforePaid: entry.hardStopsBeforePaid,
  };
}

export function isRouteCredentialConfigured(routeId: string, provider: string): boolean {
  const protocolHarness = getProtocolRouteHarness(provider);
  if (protocolHarness) return Boolean(getOptionalEnv(protocolHarness.apiKeyEnv));
  if (hasGatewayRouteCredentials(provider)) return gatewayRoutesEnabled();
  return hasServerProviderKey(dispatchProviderForRoute(routeId) ?? provider);
}

export async function readRouteEconomics(
  nowMs: number = Date.now(),
): Promise<RouteEconomicsReport> {
  const entries = Object.entries(routeRecords).sort(([left], [right]) => left.localeCompare(right));
  const liveRouteIds = entries
    .filter(([, route]) => route.availability === LIVE_AVAILABILITY)
    .map(([routeId]) => routeId);

  const decisionsByRoute = new Map(
    freePoolDecisions(nowMs).map((decision) => [decision.entry.routeId, decision]),
  );
  const health = await readRouteScopeHealth(liveRouteIds, nowMs);

  return {
    routes: entries.map(([routeId, route]) => {
      const model = modelRecords[route.modelKey];
      const capabilities = capabilityRecords[route.modelKey];
      const governance = governanceRecords[route.provider];
      const developerId = model?.identity?.developer ?? null;
      const discountPercent = discountPercentOf(route);
      const listPricing = route.discount?.listPricing ?? route.pricing;
      const listInputPerMillion = toNullableNumber(listPricing?.inputPerMillion);
      const listOutputPerMillion = toNullableNumber(listPricing?.outputPerMillion);

      return {
        routeId,
        modelKey: route.modelKey,
        modelName: model?.identity?.displayName ?? route.modelKey,
        developerId,
        developerLabel: developerId === null ? null : getDeveloperLabel(developerId),
        providerId: route.provider,
        providerLabel: providerLabels[route.provider] ?? route.provider,
        providerModelId: route.providerModelId,
        harnessId: route.harnessId,
        availability: route.availability,
        selectable: route.selectable === true,
        isDefault: route.isDefault === true,
        trustModes: route.trustModes ?? [],
        lifecycleStage: model?.lifecycle?.stage ?? null,
        commercialStatus: route.commercialStatus,
        cacheClass: route.cacheClass ?? null,
        currency: route.pricing?.currency ?? null,
        unit: route.pricing?.unit ?? null,
        listInputPerMillion,
        listOutputPerMillion,
        effectiveInputPerMillion: toNullableNumber(route.pricing?.inputPerMillion),
        effectiveOutputPerMillion: toNullableNumber(route.pricing?.outputPerMillion),
        cacheReadPerMillion: toNullableNumber(route.pricing?.cacheReadPerMillion),
        cacheWritePerMillion: toNullableNumber(route.pricing?.cacheWritePerMillion),
        discountPercent,
        contextTokens: toNullableNumber(limitRecords[route.modelKey]?.contextTokens ?? undefined),
        modality: toModality(capabilities),
        functionCalling: toNullableBoolean(capabilities?.functionCalling),
        structuredOutput: toNullableBoolean(capabilities?.structuredOutput),
        reasoning: toNullableBoolean(capabilities?.reasoning),
        streaming: toNullableBoolean(capabilities?.streaming),
        openWeight: toNullableBoolean(model?.identity?.openWeight),
        license: model?.identity?.license ?? null,
        dataRetention: route.dataRetention,
        zeroDataRetention: governance?.zeroDataRetentionAvailability ?? null,
        trainsOnInputs: governance?.trainsOnInputs ?? null,
        residencyRegions: governance?.residencyRegions ?? null,
        governanceVerifiedOn: governance?.verifiedOn ?? null,
        free: toFreePool(decisionsByRoute.get(routeId)),
        credentialConfigured: isRouteCredentialConfigured(routeId, route.provider),
        health: health[routeId] ?? null,
      };
    }),
  };
}

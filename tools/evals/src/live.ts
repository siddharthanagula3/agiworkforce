/**
 * Target resolution and spend policy for live runs.
 *
 * Everything here reads the compiled model registry
 * (`packages/ai/model-registry/generated/registry.json`); no model id, route
 * id, price or context size is written in this directory.
 *
 * The spend rule is structural: a live run may only measure a route whose
 * output price is at or below the median of live text routes in the same
 * registry, unless the caller passes the explicit costly override. Flagship
 * baselines are a founder decision, not a default.
 *
 * @module evals/live
 * @packageDocumentation
 */

import { estimatedTokens } from './haystack';
import { percentile } from './metrics';
import { DEFAULT_MAX_OUTPUT_TOKENS, buildRequest } from './request';
import type { RoutePricing } from './provider';
import type { EvalCase, EvalDataset } from './types';

export interface RegistryRoute {
  readonly modelKey: string;
  readonly provider: string;
  readonly providerModelId: string;
  readonly harnessId: string;
  readonly availability: string;
  readonly isDefault: boolean;
  readonly pricing?: RoutePricing;
}

export interface RegistryFamily {
  readonly activeModelKey: string;
}

export interface RegistryLike {
  readonly models: Readonly<
    Record<
      string,
      { readonly lifecycle: { readonly availability: string; readonly deprecated: boolean } }
    >
  >;
  readonly routes: Readonly<Record<string, RegistryRoute>>;
  readonly capabilities: Readonly<Record<string, Readonly<Record<string, boolean | null>>>>;
  readonly limits: Readonly<Record<string, { readonly contextTokens?: number | null }>>;
  readonly families: Readonly<Record<string, RegistryFamily>>;
}

export interface LiveTarget {
  readonly modelKey: string;
  readonly routeId: string;
  readonly route: RegistryRoute;
  readonly capabilities: Readonly<Record<string, boolean | null>>;
  readonly contextTokens: number | null;
}

const LIVE = 'live';

export function resolveLiveTarget(
  registry: RegistryLike,
  modelKey: string,
  routeId?: string,
): LiveTarget {
  const model = registry.models[modelKey];
  if (model === undefined) throw new Error(`${modelKey} is not in the model registry`);
  if (model.lifecycle.availability !== LIVE || model.lifecycle.deprecated) {
    throw new Error(`${modelKey} is not a live, non-deprecated model`);
  }
  const entry =
    routeId === undefined
      ? Object.entries(registry.routes).find(
          ([, route]) => route.modelKey === modelKey && route.isDefault,
        )
      : Object.entries(registry.routes).find(
          ([id, route]) => id === routeId && route.modelKey === modelKey,
        );
  if (entry === undefined) {
    throw new Error(
      routeId === undefined
        ? `${modelKey} has no default route`
        : `${routeId} is not a route of ${modelKey}`,
    );
  }
  const [resolvedRouteId, route] = entry;
  if (route.availability !== LIVE) throw new Error(`${resolvedRouteId} is not live`);
  return {
    modelKey,
    routeId: resolvedRouteId,
    route,
    capabilities: registry.capabilities[modelKey] ?? {},
    contextTokens: registry.limits[modelKey]?.contextTokens ?? null,
  };
}

export function outputPriceCeiling(registry: RegistryLike): number | null {
  const prices = Object.values(registry.routes)
    .filter(
      (route) =>
        route.isDefault &&
        route.availability === LIVE &&
        registry.capabilities[route.modelKey]?.['textOutput'] === true,
    )
    .map((route) => route.pricing?.outputPerMillion)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price));
  return percentile(prices, 0.5);
}

export function spendRefusal(
  registry: RegistryLike,
  target: LiveTarget,
  allowCostly: boolean,
): string | null {
  if (allowCostly) return null;
  const price = target.route.pricing?.outputPerMillion;
  const ceiling = outputPriceCeiling(registry);
  if (typeof price !== 'number' || ceiling === null) {
    return `${target.routeId} has no registry output price to check against the cheap-model rule`;
  }
  if (price > ceiling) {
    return `${target.routeId} costs ${price} per million output tokens, above the registry median of ${ceiling}; live eval runs use cheap models unless the founder passes --allow-costly`;
  }
  return null;
}

export function unsupportedSuiteReason(dataset: EvalDataset, target: LiveTarget): string | null {
  const missing = (dataset.requires ?? []).filter(
    (capability) => target.capabilities[capability] !== true,
  );
  return missing.length === 0 ? null : `${target.modelKey} lacks ${missing.join(', ')}`;
}

/**
 * A row the target cannot physically answer, e.g. an image row on a text-only
 * model. Skipped and recorded, never scored as a wrong answer.
 */
export function capabilitySkipReason(evalCase: EvalCase, target: LiveTarget): string | null {
  const missing = (evalCase.requires ?? []).filter(
    (capability) => target.capabilities[capability] !== true,
  );
  return missing.length === 0 ? null : `${target.modelKey} lacks ${missing.join(', ')}`;
}

export function contextSkipReason(
  dataset: EvalDataset,
  evalCase: EvalCase,
  target: LiveTarget,
): string | null {
  if (target.contextTokens === null) return null;
  const request = buildRequest(evalCase, dataset.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS);
  const needed = estimatedTokens(JSON.stringify(request.messages)) + request.maxOutputTokens;
  return needed > target.contextTokens
    ? `needs about ${needed} tokens, context window is ${target.contextTokens}`
    : null;
}

export function activeFamilies(registry: RegistryLike, modelKey: string): string[] {
  return Object.entries(registry.families)
    .filter(([, family]) => family.activeModelKey === modelKey)
    .map(([familyId]) => familyId);
}

export function measurementFileName(key: string): string {
  return `${key.replace(/[^A-Za-z0-9._-]+/gu, '__')}.json`;
}

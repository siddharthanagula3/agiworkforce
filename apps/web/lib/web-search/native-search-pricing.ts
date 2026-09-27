import 'server-only';

import { resolveFeatureRate, type RateCardFeature } from '@agiworkforce/types';

import { logger } from '@/lib/logger';

export type NativeServerTool = 'web_search' | 'web_fetch';

const NATIVE_SERVER_TOOL_FEATURES: Readonly<
  Record<string, Readonly<Record<NativeServerTool, RateCardFeature | null>>>
> = {
  anthropic: { web_search: 'web_search_anthropic', web_fetch: null },
  openai: { web_search: 'web_search_openai', web_fetch: null },
};

const NATIVE_WEB_TOOL_TYPE = /^web_(?:search|fetch)_(\d{8})$/;
const DYNAMIC_FILTERING_TOOL_VERSION = 20260209;

export function offersDynamicFilteringWebTool(tools: readonly unknown[] | undefined): boolean {
  return (tools ?? []).some((tool) => {
    const type =
      tool !== null && typeof tool === 'object' ? (tool as { type?: unknown }).type : undefined;
    const version = typeof type === 'string' ? NATIVE_WEB_TOOL_TYPE.exec(type)?.[1] : undefined;
    return version !== undefined && Number(version) >= DYNAMIC_FILTERING_TOOL_VERSION;
  });
}

export function nativeServerToolMicrousdPerRequest(
  providerId: string,
  tool: NativeServerTool,
): number {
  const feature = NATIVE_SERVER_TOOL_FEATURES[providerId]?.[tool];
  if (!feature) return 0;
  const rate = resolveFeatureRate(feature);
  if (rate.overrideInvalid) {
    logger.error(
      { env: rate.overrideEnv, feature },
      '[web-search] invalid native search rate override; falling back to the published rate',
    );
  }
  return rate.providerCogsMicrousd ?? 0;
}

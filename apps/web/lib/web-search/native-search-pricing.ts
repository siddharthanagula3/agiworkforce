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

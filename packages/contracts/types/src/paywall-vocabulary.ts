
export type PaywallFeature =
  | 'video_generation'
  | 'opus_5'
  | 'computer_use'
  | 'deep_research'
  | 'image_quota'
  | 'token_cap'
  | 'mcp'
  | 'web_search'
  | 'model_access'
  | 'paid_capability'
  | 'rolling_capacity'
  | 'request_rate';

export interface PaywallFeatureCopy {
  upgradeLabel: string;
  limitHeadline: string;
}

export const PAYWALL_FEATURE_COPY: Readonly<Record<PaywallFeature, PaywallFeatureCopy>> =
  Object.freeze({
    video_generation: {
      upgradeLabel: 'video generation',
      limitHeadline: 'You have reached your video generation limit',
    },
    opus_5: {
      upgradeLabel: 'Opus 5 access',
      limitHeadline: 'You have reached your Opus 5 limit',
    },
    computer_use: {
      upgradeLabel: 'computer use',
      limitHeadline: 'You have reached your computer use limit',
    },
    deep_research: {
      upgradeLabel: 'deep research',
      limitHeadline: 'You have reached your deep research limit',
    },
    image_quota: {
      upgradeLabel: 'more image generation',
      limitHeadline: 'You have reached your image generation limit',
    },
    token_cap: {
      upgradeLabel: 'higher usage limits',
      limitHeadline: 'You have reached your usage limit',
    },
    mcp: {
      upgradeLabel: 'MCP server support',
      limitHeadline: 'You have reached your MCP limit',
    },
    web_search: {
      upgradeLabel: 'web search',
      limitHeadline: 'You have reached your web search limit',
    },
    model_access: {
      upgradeLabel: 'more models',
      limitHeadline: 'That model is not available on your plan',
    },
    paid_capability: {
      upgradeLabel: 'this capability',
      limitHeadline: 'You have reached a plan limit',
    },
    rolling_capacity: {
      upgradeLabel: 'more capacity per window',
      limitHeadline: 'You have used your capacity for this window',
    },
    request_rate: {
      upgradeLabel: 'a higher request rate',
      limitHeadline: 'You are sending requests too quickly',
    },
  });

const PAYWALL_FEATURES = new Set<string>(Object.keys(PAYWALL_FEATURE_COPY));

export function normalizePaywallFeature(value: string): PaywallFeature {
  return PAYWALL_FEATURES.has(value) ? (value as PaywallFeature) : 'paid_capability';
}

export function paywallUpgradeLabel(feature: string): string {
  return PAYWALL_FEATURE_COPY[normalizePaywallFeature(feature)].upgradeLabel;
}

export function paywallLimitHeadline(feature: string): string {
  return PAYWALL_FEATURE_COPY[normalizePaywallFeature(feature)].limitHeadline;
}

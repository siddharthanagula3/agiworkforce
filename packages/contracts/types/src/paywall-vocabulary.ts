/**
 * paywall-vocabulary.ts — the one set of words for a managed quota refusal.
 *
 * The server classifies a 402/429 into a `paywall` block ({ feature,
 * requiredTier, reason, … }) and every surface renders it in a card. The two
 * cards that exist carried their own copy tables, and they did not match:
 *
 *   web       InlinePaywallCard      13 features, full copy
 *   desktop   MessageLimitCard        4 features, everything else fell through
 *                                     to "this capability"
 *
 * So one server response produced "Upgrade to Pro for video generation" on the
 * web app and "Upgrade to Pro for this capability" in Desktop Cloud — the same
 * refusal, described with less information depending on where the user hit it.
 * `token_cap` disagreed outright: "higher token limits" versus "higher usage
 * limits" for the identical bucket.
 *
 * Two phrasings per feature, because the card has two modes and one string
 * cannot serve both:
 *
 *   upgradeLabel  completes "Upgrade to Pro for ___" — a fragment.
 *   limitHeadline stands alone when NO upgrade lifts the limit (a plain rate
 *                 limit, or a user already on the top self-serve tier). Reusing
 *                 the fragment here produced "You have hit a higher request
 *                 rate", which reads as the opposite of what happened.
 *
 * Platform-neutral and dependency-free so React Native, the web app, the
 * Electron and Tauri shells and the extensions can all import it.
 */

/**
 * The refusal reasons the server classifier can emit.
 *
 * `rolling_capacity` and `request_rate` are the paid ceilings: without them the
 * classifier collapsed both to `paid_capability`, and the card then told a
 * rate-limited subscriber their plan lacked a capability it has.
 */
export type PaywallFeature =
  | 'video_generation'
  | 'opus_5'
  | 'gpt_5_5'
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
  /** Completes "Upgrade to <tier> for ___". A fragment, never a sentence. */
  upgradeLabel: string;
  /** Stands alone when no upgrade lifts this limit. A complete sentence. */
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
    gpt_5_5: {
      upgradeLabel: 'GPT-5.5 access',
      limitHeadline: 'You have reached your GPT-5.5 limit',
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
      // "usage", not "token": the meters this refusal comes from are described
      // to the user as usage everywhere else (see usage-vocabulary.ts), and a
      // token count is not something a subscriber tracks.
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

/**
 * Map a server-supplied feature string onto a known one.
 *
 * A server that ships a new classification before the clients do must not blank
 * the card, so anything unrecognised degrades to the generic paid capability.
 */
export function normalizePaywallFeature(value: string): PaywallFeature {
  return PAYWALL_FEATURES.has(value) ? (value as PaywallFeature) : 'paid_capability';
}

/** The fragment completing "Upgrade to <tier> for ___". */
export function paywallUpgradeLabel(feature: string): string {
  return PAYWALL_FEATURE_COPY[normalizePaywallFeature(feature)].upgradeLabel;
}

/** The standalone headline for a refusal no upgrade lifts. */
export function paywallLimitHeadline(feature: string): string {
  return PAYWALL_FEATURE_COPY[normalizePaywallFeature(feature)].limitHeadline;
}

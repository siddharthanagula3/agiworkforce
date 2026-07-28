import 'server-only';

/**
 * Which providers we currently reach through OpenRouter instead of directly.
 *
 * Founder decision 2026-07-27: MiniMax, Qwen and Zhipu (GLM) route through
 * OpenRouter until there is enough traction to justify direct accounts with
 * each vendor; Moonshot and xAI keep their own keys. MuleRouter is gone.
 *
 * Deliberately env-driven rather than a rewrite of `models.json`. The catalog
 * records what a model *is* — Qwen 3.7 Plus is a Qwen model whichever wire it
 * arrives on — and rewriting `provider` to `open_router` would lose that, then
 * have to be unpicked model by model when a direct account opens. This is the
 * routing decision, which is operational and reversible: clear the env var and
 * every one of them goes direct again, provided its key is set.
 *
 * Two things must move together, which is why they live in one file: the
 * provider that gets constructed (`resolveProviderFromModel`) and the model id
 * put on the wire (`toProviderApiModelId`). Redirect one without the other and
 * you send `qwen3.7-plus` to OpenRouter, which does not know that id, or send
 * `qwen/qwen3.7-plus` to DashScope, which does not either.
 */

import slugData from './openrouter-slugs.json' with { type: 'json' };

/**
 * Slugs live in `openrouter-slugs.json`, not as literals here.
 *
 * The repo bans hardcoded model IDs in source (`no-restricted-syntax`) because
 * inlined ids get invented and go stale. That rule is right, and a mapping
 * table is exactly the shape it is aimed at. Holding the table as data keeps
 * the rule meaningful in TypeScript while two tests enforce what the rule is
 * actually protecting: every key must exist in models.json, and every catalog
 * chat model must have an entry. An invented id fails the first; a forgotten
 * one fails the second.
 *
 * The truly correct home is a field on the catalog entry itself. That needs a
 * change to the registry schema (`additionalProperties: false`), the compiler
 * and four generated artifacts, which is more than this warrants today —
 * tracked as a follow-up rather than done badly.
 */

/** Providers routed through OpenRouter permanently, keyed by catalog apiModelId. */
const OPENROUTER_MODEL_SLUGS: Readonly<Record<string, string>> = slugData.routed;

/**
 * Failover-only routes for models normally called directly.
 *
 * Distinct from the map above: these are the escape hatch when a direct
 * provider is unavailable, not where the model normally goes. OpenRouter
 * resells the same models, so a 503 from Anthropic need not become a 503 for
 * the user.
 *
 * Chat models only. TTS, embedding, image and video are deliberately absent —
 * OpenRouter does not serve them, so an attempt would trade one failure for a
 * more confusing one.
 */
const OPENROUTER_FAILOVER_SLUGS: Readonly<Record<string, string>> = slugData.failover;

const DEFAULT_ROUTED_PROVIDERS = ['minimax', 'qwen', 'zhipu'] as const;

/**
 * Providers routed via OpenRouter for this deployment.
 *
 * `AGI_OPENROUTER_ROUTED_PROVIDERS` overrides the default list; set it to an
 * empty string to send everything direct.
 */
function routedProviders(): ReadonlySet<string> {
  const override = process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'];
  if (override === undefined) return new Set(DEFAULT_ROUTED_PROVIDERS);
  return new Set(
    override
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * True when `providerId` should be served through OpenRouter.
 *
 * Requires an OpenRouter key. Without one, routing would swap a provider that
 * merely lacks a key for another that also lacks one — turning a clear
 * "Zhipu is not configured" into a confusing OpenRouter auth error about a
 * provider the user never chose. Falling through to the direct provider keeps
 * the failure attributable.
 */
export function isRoutedViaOpenRouter(providerId: string): boolean {
  if (!process.env['OPENROUTER_API_KEY']) return false;
  return routedProviders().has(providerId.toLowerCase());
}

/**
 * The OpenRouter slug for a provider `apiModelId`, when that model is routed.
 *
 * Returns `undefined` for a model with no mapping even if its provider is
 * routed: a new Qwen model added to the catalog without a slug here must fail
 * as an unconfigured model rather than be sent to OpenRouter under an id it
 * will reject.
 */
export function openRouterSlugFor(apiModelId: string): string | undefined {
  return OPENROUTER_MODEL_SLUGS[apiModelId];
}

/** Every catalog model id that currently has an OpenRouter mapping. */
export function mappedModelIds(): readonly string[] {
  return Object.keys(OPENROUTER_MODEL_SLUGS);
}

/**
 * OpenRouter slug to retry `apiModelId` on when its direct provider is
 * unavailable, or `undefined` when no such route exists.
 *
 * Consults both maps: a model that is *always* routed through OpenRouter has
 * no separate failover route (it is already there, and retrying the same wire
 * would just fail again).
 */
export function openRouterFailoverSlugFor(apiModelId: string): string | undefined {
  return OPENROUTER_FAILOVER_SLUGS[apiModelId];
}

/**
 * Whether a request may be retried through OpenRouter when its direct provider
 * fails.
 *
 * Gated on a key for the same reason routing is: without one, "retry via
 * OpenRouter" replaces an honest upstream error with an OpenRouter auth error
 * naming a service the user never chose.
 */
export function canFailoverToOpenRouter(providerId: string, apiModelId: string): boolean {
  if (!process.env['OPENROUTER_API_KEY']) return false;
  // Already on OpenRouter — there is nowhere further to go.
  if (providerId === 'openrouter' || providerId === 'open_router') return false;
  return openRouterFailoverSlugFor(apiModelId) !== undefined;
}

/** Every catalog model id that has an OpenRouter failover route. */
export function failoverMappedModelIds(): readonly string[] {
  return Object.keys(OPENROUTER_FAILOVER_SLUGS);
}

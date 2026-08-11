import 'server-only';

/**
 * Which providers we currently reach through OpenRouter instead of directly.
 *
 * Founder decision 2026-07-27: MiniMax, Qwen and Zhipu (GLM) route through
 * OpenRouter until there is enough traction to justify direct accounts with
 * each vendor; Moonshot and xAI keep their own keys. MuleRouter is gone.
 *
 * Deliberately env-driven rather than a rewrite of `models.json`. The catalog
 * records what a model *is* — a Qwen model remains a Qwen model whichever wire it
 * arrives on — and rewriting `provider` to `open_router` would lose that, then
 * have to be unpicked model by model when a direct account opens. This is the
 * routing decision, which is operational and reversible: clear the env var and
 * every one of them goes direct again, provided its key is set.
 *
 * Two things must move together, which is why they live in one file: the
 * provider that gets constructed (`resolveProviderFromModel`) and the model id
 * put on the wire (`toProviderApiModelId`). Redirect one without the other and
 * one provider receives an identifier from the other's namespace.
 */

import { getModelMetadataById, listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';

const DEFAULT_ROUTED_PROVIDERS = ['minimax', 'qwen', 'zhipu'] as const;
const DEFAULT_ROUTED_PROVIDER_SET: ReadonlySet<string> = new Set(DEFAULT_ROUTED_PROVIDERS);

function providerApiModelId(model: ModelMetadata): string {
  return model.apiModelId ?? model.id;
}

function isCatalogChatModel(model: ModelMetadata): boolean {
  return !new Set(['image', 'video', 'audio', 'embedding', 'tts', 'stt']).has(model.modelType);
}

function isPermanentOpenRouterRoute(model: ModelMetadata): boolean {
  return DEFAULT_ROUTED_PROVIDER_SET.has(model.provider);
}

function isOpenRouterFailoverRoute(model: ModelMetadata): boolean {
  return (
    model.provider !== 'open_router' &&
    !isPermanentOpenRouterRoute(model) &&
    isCatalogChatModel(model)
  );
}

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
  const model = getModelMetadataById(apiModelId);
  if (!model || !isPermanentOpenRouterRoute(model)) return undefined;
  return model.openRouterSlug;
}

/** Every catalog model id that currently has an OpenRouter mapping. */
export function mappedModelIds(): readonly string[] {
  return listCanonicalModels()
    .filter((model) => isPermanentOpenRouterRoute(model) && model.openRouterSlug)
    .map(providerApiModelId);
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
  const model = getModelMetadataById(apiModelId);
  if (!model || !isOpenRouterFailoverRoute(model)) return undefined;
  return model.openRouterSlug;
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
  return listCanonicalModels()
    .filter((model) => isOpenRouterFailoverRoute(model) && model.openRouterSlug)
    .map(providerApiModelId);
}

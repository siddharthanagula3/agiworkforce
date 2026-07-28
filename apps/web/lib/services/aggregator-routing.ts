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

/** Providers eligible for aggregator routing, and their OpenRouter slugs. */
const OPENROUTER_MODEL_SLUGS: Readonly<Record<string, string>> = {
  // Verified against https://openrouter.ai/api/v1/models on 2026-07-27 rather
  // than guessed. A wrong slug here is a 404 at request time, and OpenRouter's
  // naming does not always mirror the vendor's: Zhipu publishes as `z-ai`, and
  // Qwen 3.5 Flash is only offered as a dated snapshot.
  'qwen3.5-flash': 'qwen/qwen3.5-flash-02-23',
  'qwen3.7-plus': 'qwen/qwen3.7-plus',
  'glm-5.2': 'z-ai/glm-5.2',
  'MiniMax-M3': 'minimax/minimax-m3',
};

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

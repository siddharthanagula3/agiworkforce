/**
 * Base URL SSRF allowlist validator.
 *
 * Any adapter that accepts a caller-configurable `baseUrl` (BYOK custom
 * endpoints, on-prem proxies, alternate regional hosts) is a potential SSRF
 * vector: an attacker who controls an env var or config value could redirect
 * outbound LLM traffic — including the user's prompts — to an arbitrary host.
 *
 * Provides the shared allowlist gate for server-managed provider construction:
 * require `https:` (except for an explicit local-dev host carve-out) and
 * require the hostname to be in a caller-supplied allowlist. Kept as a pure,
 * isomorphic utility (no `node:` builtins — works in the CLI, desktop Tauri
 * runtime, and edge/browser contexts) so `packages/ai/providers/*` adapters and
 * their call sites can share one gate instead of each reimplementing it.
 *
 * WHERE THIS IS ACTUALLY APPLIED TODAY (base-url audit 2026-07-11) — this is
 * NOT uniform across every adapter, and unifying it is a security-posture
 * decision pending review, not a mechanical follow-up:
 *   - The real enforcement point for the managed-cloud path is the
 *     ADAPTER-CONSTRUCTION CALL SITES, not the adapters themselves:
 *     `apps/web/lib/services/provider-adapter-service.ts` calls
 *     `validateBaseUrl(candidateEnvOverride, { allowedHosts:
 *     ALLOWED_MANAGED_PROVIDER_HOSTS })` on every `*_BASE_URL` env override
 *     before constructing an adapter, and omit the override entirely
 *     (falling back to the adapter's own default) on rejection.
 *   - Adapter-level `config.baseUrl` handling varies. `minimax`,
 *     `moonshot`, `openrouter`, `qwen`, and `zhipu` additionally call
 *     `resolveValidatedBaseUrl` internally, but against a NARROW,
 *     single-provider allowlist (not `ALLOWED_MANAGED_PROVIDER_HOSTS`) —
 *     `additionalAllowedBaseUrlHosts` is the caller's escape hatch for a
 *     legitimate custom gateway. The other adapters (`anthropic`, `openai`,
 *     `deepseek`, `google`, `lmstudio`, `ollama`, `perplexity`, `xai`) apply
 *     no internal check at all and trust `config.baseUrl` directly —
 *     `google`'s own test suite (`api-key-header.test.ts`) asserts this is
 *     intentional, requiring an arbitrary proxy `baseUrl` to be honored.
 *   - Do not "fix" this by mechanically adding the narrow-allowlist pattern
 *     to the remaining 8: it would either double-gate against a list
 *     STRICTER than `ALLOWED_MANAGED_PROVIDER_HOSTS` (silently rejecting an
 *     override the call site already approved — e.g. a Cloudflare AI Gateway
 *     `baseUrl` — a regression the 6 narrow-allowlist adapters likely already
 *     have) or break the trust-the-caller contract `google` tests against.
 *
 * Pure: no IO, no logging, no throwing. Callers decide how to react (throw,
 * warn + fall back, telemetry) — see `resolveValidatedBaseUrl` for the
 * "validate an override or fall back to the adapter's trusted default"
 * pattern, which mirrors the web factory's own warn-and-fall-back behavior.
 */

const DEFAULT_INSECURE_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

/**
 * Canonical managed-provider SSRF allowlist (WEB-2 audit 2026-05-03).
 * Single canonical managed-provider allowlist. Web's server-key construction
 * boundary validates every `*_BASE_URL` override against it. Other deployables
 * must opt in explicitly when their endpoint policy permits overrides; they
 * must not create a second drifted copy of this list.
 */
export const ALLOWED_MANAGED_PROVIDER_HOSTS: ReadonlySet<string> = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'dashscope.aliyuncs.com',
  'api.mulerouter.ai',
  'api.moonshot.cn',
  'api.moonshot.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  'open.bigmodel.cn',
  'api.minimax.io',
  'openrouter.ai',
  'gateway.ai.cloudflare.com',
  'localhost',
  '127.0.0.1',
]);

export interface ValidateBaseUrlOptions {
  /** Hostnames this base URL is allowed to resolve to (exact match, case-insensitive). */
  allowedHosts: ReadonlySet<string> | readonly string[];
  /**
   * Hostnames allowed to use `http:` instead of `https:` — default
   * `['localhost', '127.0.0.1']`, matching the web factory's local-dev
   * carve-out (e.g. Ollama/LM Studio-style local proxies). Pass `[]` to
   * require `https:` unconditionally.
   */
  allowInsecureHosts?: readonly string[];
}

export type ValidateBaseUrlResult =
  | { ok: true; url: string; hostname: string }
  | {
      ok: false;
      reason: 'empty' | 'invalid-url' | 'insecure-protocol' | 'host-not-allowlisted';
      input: string;
      hostname?: string;
    };

function toLowercaseHostSet(hosts: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  const set = hosts instanceof Set ? hosts : new Set(hosts);
  return new Set([...set].map((h) => h.toLowerCase()));
}

/**
 * Validate a candidate base URL against an allowlist. Pure — never throws,
 * never logs. `candidate` is typically a caller- or env-supplied override;
 * an adapter's own hardcoded default is trusted by construction and never
 * needs to pass through this function.
 */
export function validateBaseUrl(
  candidate: string | undefined | null,
  options: ValidateBaseUrlOptions,
): ValidateBaseUrlResult {
  const input = candidate ?? '';
  if (!input.trim()) {
    return { ok: false, reason: 'empty', input };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid-url', input };
  }

  const hostname = parsed.hostname.toLowerCase();
  const insecureAllowed = new Set(
    (options.allowInsecureHosts ?? DEFAULT_INSECURE_HOSTS).map((h) => h.toLowerCase()),
  );
  if (parsed.protocol !== 'https:' && !insecureAllowed.has(hostname)) {
    return { ok: false, reason: 'insecure-protocol', input, hostname };
  }

  const allowlist = toLowercaseHostSet(options.allowedHosts);
  if (!allowlist.has(hostname)) {
    return { ok: false, reason: 'host-not-allowlisted', input, hostname };
  }

  return { ok: true, url: input, hostname };
}

/**
 * Common adapter-factory pattern: validate a caller-supplied `baseUrl`
 * override and fall back to the adapter's own trusted `defaultUrl` when the
 * override is absent or fails validation. Mirrors
 * `LLMProviderFactory.getProviderBaseUrl`'s warn-and-fall-back behavior
 * (never throws, never silently trusts an unlisted host) — the returned
 * `rejected` field lets the caller log/telemetry the rejection without
 * forcing every adapter to choose between "throw" and "fall back".
 */
export function resolveValidatedBaseUrl(
  candidate: string | undefined | null,
  defaultUrl: string,
  options: ValidateBaseUrlOptions,
): { url: string; rejected?: Extract<ValidateBaseUrlResult, { ok: false }> } {
  if (!candidate) {
    return { url: defaultUrl };
  }
  const result = validateBaseUrl(candidate, options);
  if (result.ok) {
    return { url: result.url };
  }
  return { url: defaultUrl, rejected: result };
}

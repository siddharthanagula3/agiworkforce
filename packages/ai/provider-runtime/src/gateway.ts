/**
 * Gateway fingerprinting.
 *
 * Multi-provider users frequently route through aggregator gateways
 * (LiteLLM, Helicone, Portkey, Cloudflare AI Gateway, Kong, Braintrust,
 * Databricks AI Gateway). Errors and rate-limit headers from these
 * gateways look superficially like the upstream provider's, but the
 * recovery strategy differs (a Helicone 429 shouldn't fall back to
 * a different model — Helicone enforces user-side limits, not
 * upstream-provider limits).
 *
 * This module fingerprints which gateway (if any) is in front of the
 * provider so:
 *   1. Telemetry attribution is accurate (`provider: openai, gateway: litellm`).
 *   2. The retry generator can choose gateway-aware behaviour.
 *   3. Error messages can name the right party for support hand-off.
 *
 * Citation:
 *   - `tasks/research/deep/m8-services-api.md` §17 #10 (`detectGateway`).
 *   - `tasks/research/gap-matrix/pkg-api-providers-normalize.md`
 *     "detectGateway fingerprinting (P1)".
 */

/**
 * Recognised gateway IDs. `direct` = no gateway in path.
 */
export type GatewayId =
  | 'direct'
  | 'litellm'
  | 'helicone'
  | 'portkey'
  | 'cloudflare-ai-gateway'
  | 'kong'
  | 'braintrust'
  | 'databricks';

interface GatewayFingerprint {
  id: GatewayId;
  /** Header-prefix substring matched (lowercase) — empty when matched by URL. */
  headerPrefix: string;
  /** Hostname suffix matched — empty when matched by header. */
  hostnameSuffix: string;
}

const HEADER_PREFIX_TABLE: ReadonlyArray<{ id: GatewayId; prefix: string }> = [
  { id: 'litellm', prefix: 'x-litellm-' },
  { id: 'helicone', prefix: 'helicone-' },
  { id: 'helicone', prefix: 'x-helicone-' },
  { id: 'portkey', prefix: 'x-portkey-' },
  { id: 'cloudflare-ai-gateway', prefix: 'cf-aig-' },
  { id: 'kong', prefix: 'x-kong-' },
  { id: 'braintrust', prefix: 'x-bt-' },
  { id: 'braintrust', prefix: 'x-braintrust-' },
  { id: 'databricks', prefix: 'x-databricks-' },
];

const HOSTNAME_SUFFIX_TABLE: ReadonlyArray<{ id: GatewayId; suffix: string }> = [
  { id: 'litellm', suffix: '.litellm.ai' },
  { id: 'helicone', suffix: '.helicone.ai' },
  { id: 'portkey', suffix: '.portkey.ai' },
  { id: 'cloudflare-ai-gateway', suffix: '.aig.cloudflare.com' },
  { id: 'cloudflare-ai-gateway', suffix: 'gateway.ai.cloudflare.com' },
  { id: 'kong', suffix: '.konghq.com' },
  { id: 'braintrust', suffix: '.braintrust.dev' },
  { id: 'braintrust', suffix: '.braintrustdata.com' },
  { id: 'databricks', suffix: '.databricks.com' },
];

/**
 * Fingerprint a gateway from the response headers (preferred — fires on
 * EVERY response) OR the request URL (fallback — useful for quick
 * pre-flight detection).
 *
 * Returns `direct` when no gateway match.
 */
export function detectGateway(input: {
  responseHeaders?: Headers | Record<string, string | string[] | undefined> | null;
  baseUrl?: string | null;
}): GatewayFingerprint {
  const fromHeader = matchHeaderPrefix(input.responseHeaders ?? null);
  if (fromHeader) return { id: fromHeader.id, headerPrefix: fromHeader.prefix, hostnameSuffix: '' };

  const fromHost = matchHostnameSuffix(input.baseUrl ?? null);
  if (fromHost) return { id: fromHost.id, headerPrefix: '', hostnameSuffix: fromHost.suffix };

  return { id: 'direct', headerPrefix: '', hostnameSuffix: '' };
}

function matchHeaderPrefix(
  headers: Headers | Record<string, string | string[] | undefined> | null,
): { id: GatewayId; prefix: string } | null {
  if (!headers) return null;
  const names = collectHeaderNames(headers);
  for (const name of names) {
    const lower = name.toLowerCase();
    for (const entry of HEADER_PREFIX_TABLE) {
      if (lower.startsWith(entry.prefix)) {
        return { id: entry.id, prefix: entry.prefix };
      }
    }
  }
  return null;
}

function collectHeaderNames(h: Headers | Record<string, string | string[] | undefined>): string[] {
  if (typeof (h as Headers).forEach === 'function' && typeof (h as Headers).get === 'function') {
    const names: string[] = [];
    (h as Headers).forEach((_value, key) => {
      names.push(key);
    });
    return names;
  }
  return Object.keys(h);
}

function matchHostnameSuffix(baseUrl: string | null): { id: GatewayId; suffix: string } | null {
  if (!baseUrl || typeof baseUrl !== 'string') return null;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const entry of HOSTNAME_SUFFIX_TABLE) {
    if (host.endsWith(entry.suffix)) {
      return { id: entry.id, suffix: entry.suffix };
    }
  }
  return null;
}

/**
 * Returns true when the gateway is known to enforce user-side limits
 * that the upstream provider doesn't see. Used by the retry generator
 * to decide whether a 429 should fall back to a different model
 * (NO — the user has the same limit on the next model) or just
 * exponential-backoff retry (YES).
 */
export function gatewayEnforcesUserSideLimits(id: GatewayId): boolean {
  switch (id) {
    case 'litellm':
    case 'helicone':
    case 'portkey':
    case 'cloudflare-ai-gateway':
    case 'kong':
    case 'braintrust':
    case 'databricks':
      return true;
    case 'direct':
      return false;
  }
}

/**
 * @file Provider Health Check Service
 *
 * Pings each LLM provider's API endpoint to determine availability.
 * Results are cached for 60 seconds to avoid excessive upstream requests.
 *
 * Exposes:
 *   - `checkAllProviders()` — returns health status for all known providers
 *   - `getProviderHealth(provider)` — returns cached status for a single provider
 *   - `getFallbackRecommendation(provider)` — suggests an alternative when a provider is down
 *   - `providerHealthRouter` — Express router mounted at /api/providers
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Types (mirrors ProviderHealthStatus from @agiworkforce/types/model-catalog)
// ---------------------------------------------------------------------------

interface ProviderHealthStatus {
  provider: string;
  available: boolean;
  configured: boolean;
  error?: string;
  healthCheckedAt: number;
}

// ---------------------------------------------------------------------------
// Provider registry — endpoint URLs used for lightweight HEAD/GET pings
// ---------------------------------------------------------------------------

interface ProviderEntry {
  id: string;
  label: string;
  /** URL to ping (must return 2xx/4xx to be considered "reachable"). */
  pingUrl: string;
  /** Model family for fallback mapping. */
  family: string;
}

const DEFAULT_PROVIDERS: ProviderEntry[] = [
  { id: 'openai', label: 'OpenAI', pingUrl: 'https://api.openai.com/v1/models', family: 'gpt' },
  {
    id: 'anthropic',
    label: 'Anthropic',
    pingUrl: 'https://api.anthropic.com/v1/messages',
    family: 'claude',
  },
  {
    id: 'google',
    label: 'Google',
    pingUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    family: 'gemini',
  },
  { id: 'xai', label: 'xAI', pingUrl: 'https://api.x.ai/v1/models', family: 'grok' },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    pingUrl: 'https://api.deepseek.com/v1/models',
    family: 'deepseek',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    pingUrl: 'https://api.mistral.ai/v1/models',
    family: 'mistral',
  },
  {
    id: 'groq',
    label: 'Groq',
    pingUrl: 'https://api.groq.com/openai/v1/models',
    family: 'inference',
  },
  {
    id: 'together',
    label: 'Together',
    pingUrl: 'https://api.together.xyz/v1/models',
    family: 'inference',
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    pingUrl: 'https://api.fireworks.ai/inference/v1/models',
    family: 'inference',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    pingUrl: 'https://api.perplexity.ai/chat/completions',
    family: 'search',
  },
  { id: 'cohere', label: 'Cohere', pingUrl: 'https://api.cohere.com/v2/models', family: 'cohere' },
];

/**
 * Resolve the provider list. If PROVIDER_HEALTH_URLS is set (JSON array of
 * ProviderEntry objects), it overrides the hardcoded defaults, enabling
 * operational URL changes without code deploys.
 */
function resolveProviders(): ProviderEntry[] {
  const envOverride = process.env['PROVIDER_HEALTH_URLS'];
  if (!envOverride) return DEFAULT_PROVIDERS;
  try {
    const parsed = JSON.parse(envOverride) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validate each entry has the required fields
      const valid = (parsed as ProviderEntry[]).filter(
        (p) =>
          typeof p.id === 'string' &&
          typeof p.label === 'string' &&
          typeof p.pingUrl === 'string' &&
          typeof p.family === 'string',
      );
      if (valid.length > 0) {
        logger.info({ count: valid.length }, 'Using PROVIDER_HEALTH_URLS override');
        return valid;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to parse PROVIDER_HEALTH_URLS; using defaults');
  }
  return DEFAULT_PROVIDERS;
}

const PROVIDERS: ProviderEntry[] = resolveProviders();

/**
 * Fallback mapping: when a provider is down, which provider can serve
 * a similar model family.
 *
 * Order matters — first available alternative wins.
 */
const FALLBACK_MAP: Record<string, string[]> = {
  openai: ['anthropic', 'google', 'mistral', 'groq'],
  anthropic: ['openai', 'google', 'deepseek'],
  google: ['openai', 'anthropic', 'mistral'],
  xai: ['openai', 'anthropic', 'deepseek'],
  deepseek: ['openai', 'mistral', 'groq'],
  mistral: ['openai', 'anthropic', 'groq'],
  groq: ['together', 'fireworks', 'cerebras'],
  together: ['groq', 'fireworks', 'deepinfra'],
  fireworks: ['groq', 'together', 'deepinfra'],
  perplexity: ['google', 'openai'],
  cohere: ['openai', 'anthropic'],
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedResults: ProviderHealthStatus[] | null = null;
let cacheTimestamp = 0;

// ---------------------------------------------------------------------------
// Health check logic
// ---------------------------------------------------------------------------

const PING_TIMEOUT_MS = 8_000;

/**
 * Ping a single provider endpoint. We consider the provider "available"
 * if we get any HTTP response (even 401/403 — that means the API is up,
 * just not authenticated). Only network errors or timeouts mean "down".
 */
async function pingProvider(entry: ProviderEntry): Promise<ProviderHealthStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    const response = await fetch(entry.pingUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'AGIWorkforce-HealthCheck/1.0' },
    });

    clearTimeout(timeout);

    // 2xx-4xx = API is reachable (4xx just means auth required)
    // 5xx = server-side issue
    const available = response.status < 500;

    return {
      provider: entry.id,
      available,
      configured: true, // We know about this provider
      error: available ? undefined : `HTTP ${response.status}`,
      healthCheckedAt: Date.now(),
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = errorMessage.includes('abort') || elapsed >= PING_TIMEOUT_MS - 500;

    return {
      provider: entry.id,
      available: false,
      configured: true,
      error: isTimeout ? 'Timeout' : errorMessage,
      healthCheckedAt: Date.now(),
    };
  }
}

/**
 * Check health of all known providers.
 * Returns cached results if still fresh (< 60s).
 */
export async function checkAllProviders(): Promise<ProviderHealthStatus[]> {
  const now = Date.now();

  if (cachedResults && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResults;
  }

  logger.info('Running provider health checks');

  const results = await Promise.all(PROVIDERS.map(pingProvider));

  cachedResults = results;
  cacheTimestamp = now;

  const downCount = results.filter((r) => !r.available).length;
  if (downCount > 0) {
    logger.warn({ downCount, total: results.length }, 'Some providers are down');
  }

  return results;
}

/**
 * Get cached health status for a single provider.
 * Returns null if no cached data exists (call `checkAllProviders()` first).
 */
export function getProviderHealth(providerId: string): ProviderHealthStatus | null {
  if (!cachedResults) return null;
  return cachedResults.find((r) => r.provider === providerId) ?? null;
}

/**
 * When a provider is down, suggest the best available alternative.
 * Returns null if no alternative is available or the provider is healthy.
 */
export async function getFallbackRecommendation(
  providerId: string,
): Promise<{ recommended: string; label: string } | null> {
  const results = await checkAllProviders();

  const providerStatus = results.find((r) => r.provider === providerId);
  if (!providerStatus || providerStatus.available) {
    return null; // Provider is up — no fallback needed
  }

  const alternatives = FALLBACK_MAP[providerId];
  if (!alternatives) return null;

  for (const altId of alternatives) {
    const altStatus = results.find((r) => r.provider === altId);
    if (altStatus?.available) {
      const entry = PROVIDERS.find((p) => p.id === altId);
      return {
        recommended: altId,
        label: entry?.label ?? altId,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Express Router
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /api/providers/health
 *
 * Returns health status for all known providers.
 * Cached for 60 seconds.
 *
 * Optional query: ?provider=openai — returns single provider + fallback recommendation.
 */
router.get('/health', createRateLimiter('health'), async (_req: Request, res: Response) => {
  const providerId =
    typeof _req.query['provider'] === 'string' ? _req.query['provider'] : undefined;

  const results = await checkAllProviders();

  if (providerId) {
    const status = results.find((r) => r.provider === providerId);
    if (!status) {
      // SECURITY: Do not reflect user input in error responses
      res.status(404).json({ error: 'Unknown provider' });
      return;
    }

    const fallback = !status.available ? await getFallbackRecommendation(providerId) : null;

    res.json({
      ...status,
      fallback: fallback ?? undefined,
    });
    return;
  }

  res.json({
    providers: results,
    checkedAt: cacheTimestamp,
    summary: {
      total: results.length,
      available: results.filter((r) => r.available).length,
      down: results.filter((r) => !r.available).length,
    },
  });
});

export { router as providerHealthRouter };

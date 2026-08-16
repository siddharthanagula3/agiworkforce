
import { Router, type Request, type Response } from 'express';
import { ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

interface ProviderHealthStatus {
  provider: string;
  available: boolean;
  configured: boolean;
  error?: string;
  healthCheckedAt: number;
}

interface ProviderEntry {
  id: string;
  label: string;
  pingUrl: string;
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
    id: 'minimax',
    label: 'MiniMax',
    pingUrl: 'https://api.minimax.io/v1/models',
    family: 'minimax',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    pingUrl: 'https://api.perplexity.ai/chat/completions',
    family: 'search',
  },
];

const SUPPORTED_PROVIDER_IDS = new Set(DEFAULT_PROVIDERS.map((provider) => provider.id));

const NON_PINGABLE_HOSTS: ReadonlySet<string> = new Set([
  'api.mulerouter.ai',
  'localhost',
  '127.0.0.1',
]);

const PROVIDER_HEALTH_ALLOWED_HOSTS: ReadonlySet<string> = new Set<string>([
  ...[...ALLOWED_MANAGED_PROVIDER_HOSTS].filter((host) => !NON_PINGABLE_HOSTS.has(host)),
  'api.agiworkforce.com',
  'staging-api.agiworkforce.com',
]);

function isAcceptableHealthUrl(rawUrl: string, providerId: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') {
      logger.warn(
        { providerId, rawUrl, reason: 'protocol_not_https' },
        'PROVIDER_HEALTH_URLS entry rejected',
      );
      return false;
    }
    if (!PROVIDER_HEALTH_ALLOWED_HOSTS.has(u.hostname)) {
      logger.warn(
        { providerId, rawUrl, host: u.hostname, reason: 'host_not_on_allowlist' },
        'PROVIDER_HEALTH_URLS entry rejected',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(
      { providerId, rawUrl, err: err instanceof Error ? err.message : String(err) },
      'PROVIDER_HEALTH_URLS entry failed to parse as URL',
    );
    return false;
  }
}

function resolveProviders(): ProviderEntry[] {
  const envOverride = process.env['PROVIDER_HEALTH_URLS'];
  if (!envOverride) return DEFAULT_PROVIDERS;
  try {
    const parsed = JSON.parse(envOverride) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = (parsed as ProviderEntry[]).filter(
        (p) =>
          typeof p.id === 'string' &&
          SUPPORTED_PROVIDER_IDS.has(p.id.toLowerCase()) &&
          typeof p.label === 'string' &&
          typeof p.pingUrl === 'string' &&
          typeof p.family === 'string' &&
          isAcceptableHealthUrl(p.pingUrl, p.id),
      );
      if (valid.length > 0) {
        logger.info({ count: valid.length }, 'Using PROVIDER_HEALTH_URLS override');
        return valid;
      }
      logger.warn(
        { entries: parsed.length },
        'PROVIDER_HEALTH_URLS had entries but none survived validation; falling back to defaults',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to parse PROVIDER_HEALTH_URLS; using defaults');
  }
  return DEFAULT_PROVIDERS;
}

const PROVIDERS: ProviderEntry[] = resolveProviders();

const FALLBACK_MAP: Record<string, string[]> = {
  openai: ['anthropic', 'google'],
  anthropic: ['openai', 'google', 'deepseek'],
  google: ['openai', 'anthropic'],
  xai: ['openai', 'anthropic', 'deepseek'],
  deepseek: ['openai'],
  perplexity: ['google', 'openai'],
};

const CACHE_TTL_MS = 60_000;

let cachedResults: ProviderHealthStatus[] | null = null;
let cacheTimestamp = 0;

const PING_TIMEOUT_MS = 8_000;

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

export function getProviderHealth(providerId: string): ProviderHealthStatus | null {
  if (!cachedResults) return null;
  return cachedResults.find((r) => r.provider === providerId) ?? null;
}

export async function getFallbackRecommendation(
  providerId: string,
): Promise<{ recommended: string; label: string } | null> {
  const results = await checkAllProviders();

  const providerStatus = results.find((r) => r.provider === providerId);
  if (!providerStatus || providerStatus.available) {
    return null;
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

const router = Router();

router.get('/health', createRateLimiter('health'), async (_req: Request, res: Response) => {
  const providerId =
    typeof _req.query['provider'] === 'string' ? _req.query['provider'] : undefined;

  const results = await checkAllProviders();

  if (providerId) {
    const status = results.find((r) => r.provider === providerId);
    if (!status) {
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

/**
 * Provider adapter factory wired to server-held API keys.
 *
 * Each provider's adapter is constructed lazily on first request, with
 * credentials sourced from env vars (server-side only — never echoed back
 * to the client).
 *
 * Restructure Wave 2: this factory is the ONLY provider-calling seam in the
 * gateway. Every current factory adapter except LM Studio is wired here; a
 * provider is "available" only when its server env key is present
 * (buildProviderAdapter returns null otherwise and routes respond 502/503).
 * LM Studio is deliberately absent — it is a local-device provider and has no
 * meaning behind the managed gateway.
 */

import {
  createProviderAdapter,
  type ProviderAdapterConfigMap,
  type ProviderAdapterId,
} from '@agiworkforce/providers-factory';
import type { ProviderAdapter } from '@agiworkforce/types';

export type ProviderId = Exclude<ProviderAdapterId, 'lmstudio'>;

export const SUPPORTED_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'ollama',
  'google',
  'deepseek',
  'xai',
  'perplexity',
  'minimax',
  'moonshot',
  'qwen',
  'zhipu',
  'open_router',
] as const satisfies readonly ProviderId[];

/** Simple env-keyed providers: one API key env var, no extra config. */
const ENV_KEYED_PROVIDERS: Partial<Record<ProviderId, { envVars: string[]; baseUrlEnv?: string }>> =
  {
    deepseek: { envVars: ['DEEPSEEK_API_KEY'] },
    xai: { envVars: ['XAI_API_KEY'] },
    perplexity: { envVars: ['PERPLEXITY_API_KEY'] },
    minimax: { envVars: ['MINIMAX_API_KEY'] },
    moonshot: {
      envVars: ['MOONSHOT_API_KEY'],
      // Honor MOONSHOT_BASE_URL so international keys can target api.moonshot.ai
      // (the adapter default is api.moonshot.cn). The adapter re-validates the
      // host against its allowlist, which already permits both.
      baseUrlEnv: 'MOONSHOT_BASE_URL',
    },
    // DASHSCOPE_API_KEY is Alibaba's own env-var convention — honored as a fallback.
    qwen: { envVars: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'] },
    zhipu: { envVars: ['ZHIPU_API_KEY'] },
    open_router: { envVars: ['OPENROUTER_API_KEY'] },
  };

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

interface ProviderAvailability {
  id: ProviderId;
  available: boolean;
  /** Human-readable reason when unavailable. */
  unavailableReason?: string;
}

export function listProviderAvailability(): ProviderAvailability[] {
  return SUPPORTED_PROVIDER_IDS.map((id) => {
    switch (id) {
      case 'anthropic':
        return process.env['ANTHROPIC_API_KEY']
          ? { id, available: true }
          : { id, available: false, unavailableReason: 'ANTHROPIC_API_KEY not set' };
      case 'openai':
        return process.env['OPENAI_API_KEY']
          ? { id, available: true }
          : { id, available: false, unavailableReason: 'OPENAI_API_KEY not set' };
      case 'ollama':
        // Ollama is "available" if the env points at one — the daemon
        // probe lives on the catalog endpoint, not here.
        return { id, available: true };
      case 'google':
        return process.env['GOOGLE_API_KEY'] ||
          process.env['GOOGLE_AI_API_KEY'] ||
          process.env['GEMINI_API_KEY']
          ? { id, available: true }
          : { id, available: false, unavailableReason: 'GOOGLE_API_KEY not set' };
      default: {
        const entry = ENV_KEYED_PROVIDERS[id];
        if (!entry) {
          return { id, available: false, unavailableReason: 'provider not wired' };
        }
        return firstEnv(entry.envVars)
          ? { id, available: true }
          : {
              id,
              available: false,
              unavailableReason: `${entry.envVars[0]} not set`,
            };
      }
    }
  });
}

/**
 * Build an adapter for the given provider id.
 *
 * Returns null when credentials are missing — the caller should respond
 * with a 503 for unavailable providers rather than silently spawning a
 * misconfigured adapter.
 */
export function buildProviderAdapter(id: ProviderId): ProviderAdapter | null {
  switch (id) {
    case 'anthropic': {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) return null;
      const config: ProviderAdapterConfigMap['anthropic'] = {
        apiKey,
        enableCacheControl: true,
        cacheRetention: 'short',
      };
      return createProviderAdapter('anthropic', config);
    }
    case 'openai': {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) return null;
      const config: ProviderAdapterConfigMap['openai'] = {
        apiKey,
        skipDiscovery: true,
      };
      if (process.env['OPENAI_ORG_ID']) {
        config.organization = process.env['OPENAI_ORG_ID'];
      }
      if (process.env['OPENAI_PROJECT_ID']) {
        config.project = process.env['OPENAI_PROJECT_ID'];
      }
      return createProviderAdapter('openai', config);
    }
    case 'ollama': {
      const config: ProviderAdapterConfigMap['ollama'] = {};
      if (process.env['OLLAMA_BASE_URL']) {
        config.baseUrl = process.env['OLLAMA_BASE_URL'];
      }
      if (process.env['OLLAMA_API_KEY']) {
        config.apiKey = process.env['OLLAMA_API_KEY'];
      }
      return createProviderAdapter('ollama', config);
    }
    case 'google': {
      // GOOGLE_AI_API_KEY is the legacy cloud-chat env name; GEMINI_API_KEY is
      // Google's own current preferred name — both honored as fallbacks so
      // existing deployments and users naming it either way keep working.
      const apiKey =
        process.env['GOOGLE_API_KEY'] ??
        process.env['GOOGLE_AI_API_KEY'] ??
        process.env['GEMINI_API_KEY'];
      if (!apiKey) return null;
      const config: ProviderAdapterConfigMap['google'] = { apiKey };
      if (process.env['GOOGLE_GENAI_BASE_URL']) {
        config.baseUrl = process.env['GOOGLE_GENAI_BASE_URL'];
      }
      return createProviderAdapter('google', config);
    }
    default: {
      const entry = ENV_KEYED_PROVIDERS[id];
      if (!entry) return null;
      const apiKey = firstEnv(entry.envVars);
      if (!apiKey) return null;
      const baseUrl = entry.baseUrlEnv ? process.env[entry.baseUrlEnv] : undefined;
      return createProviderAdapter(id, {
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
      });
    }
  }
}

export function isSupportedProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

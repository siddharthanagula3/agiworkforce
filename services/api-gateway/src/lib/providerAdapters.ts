/**
 * Provider adapter factory wired to server-held API keys.
 *
 * Each provider's adapter is constructed lazily on first request, with
 * credentials sourced from env vars (server-side only — never echoed back
 * to the client).
 *
 * Restructure Wave 2: this factory is the ONLY provider-calling seam in the
 * gateway. All thirteen cloud adapters from packages/providers/* are wired
 * here; a provider is "available" only when its server env key is present
 * (buildProviderAdapter returns null otherwise and routes respond 502/503).
 * LM Studio is deliberately absent — it is a local-device provider and has
 * no meaning behind the managed gateway.
 */

import {
  createAnthropicAdapter,
  type AnthropicAdapterConfig,
} from '@agiworkforce/providers-anthropic';
import { createOpenAIAdapter, type OpenAIAdapterConfig } from '@agiworkforce/providers-openai';
import { createOllamaAdapter, type OllamaAdapterConfig } from '@agiworkforce/providers-ollama';
import { createGoogleAdapter, type GoogleAdapterConfig } from '@agiworkforce/providers-google';
import { createDeepSeekAdapter } from '@agiworkforce/providers-deepseek';
import { createXAIAdapter } from '@agiworkforce/providers-xai';
import { createPerplexityAdapter } from '@agiworkforce/providers-perplexity';
import { createGroqAdapter } from '@agiworkforce/providers-groq';
import { createMistralAdapter } from '@agiworkforce/providers-mistral';
import { createMoonshotAdapter } from '@agiworkforce/providers-moonshot';
import { createQwenAdapter } from '@agiworkforce/providers-qwen';
import { createZhipuAdapter } from '@agiworkforce/providers-zhipu';
import { createOpenRouterAdapter } from '@agiworkforce/providers-openrouter';
import type { ProviderAdapter } from '@agiworkforce/types';

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'google'
  | 'deepseek'
  | 'xai'
  | 'perplexity'
  | 'groq'
  | 'mistral'
  | 'moonshot'
  | 'qwen'
  | 'zhipu'
  | 'open_router';

export const SUPPORTED_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'ollama',
  'google',
  'deepseek',
  'xai',
  'perplexity',
  'groq',
  'mistral',
  'moonshot',
  'qwen',
  'zhipu',
  'open_router',
] as const;

/** Simple env-keyed providers: one API key env var, no extra config. */
const ENV_KEYED_PROVIDERS: Partial<
  Record<ProviderId, { envVars: string[]; create: (apiKey: string) => ProviderAdapter }>
> = {
  deepseek: {
    envVars: ['DEEPSEEK_API_KEY'],
    create: (apiKey) => createDeepSeekAdapter({ apiKey }),
  },
  xai: { envVars: ['XAI_API_KEY'], create: (apiKey) => createXAIAdapter({ apiKey }) },
  perplexity: {
    envVars: ['PERPLEXITY_API_KEY'],
    create: (apiKey) => createPerplexityAdapter({ apiKey }),
  },
  groq: { envVars: ['GROQ_API_KEY'], create: (apiKey) => createGroqAdapter({ apiKey }) },
  mistral: { envVars: ['MISTRAL_API_KEY'], create: (apiKey) => createMistralAdapter({ apiKey }) },
  moonshot: {
    envVars: ['MOONSHOT_API_KEY'],
    // Honor MOONSHOT_BASE_URL so international keys can target api.moonshot.ai
    // (the adapter default is api.moonshot.cn). The adapter re-validates the
    // host against its allowlist, which already permits both.
    create: (apiKey) =>
      createMoonshotAdapter({
        apiKey,
        ...(process.env['MOONSHOT_BASE_URL'] ? { baseUrl: process.env['MOONSHOT_BASE_URL'] } : {}),
      }),
  },
  // DASHSCOPE_API_KEY is Alibaba's own env-var convention — honored as a fallback.
  qwen: {
    envVars: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
    create: (apiKey) => createQwenAdapter({ apiKey }),
  },
  zhipu: { envVars: ['ZHIPU_API_KEY'], create: (apiKey) => createZhipuAdapter({ apiKey }) },
  open_router: {
    envVars: ['OPENROUTER_API_KEY'],
    create: (apiKey) => createOpenRouterAdapter({ apiKey }),
  },
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
      const config: AnthropicAdapterConfig = {
        apiKey,
        enableCacheControl: true,
        cacheRetention: 'short',
      };
      return createAnthropicAdapter(config);
    }
    case 'openai': {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) return null;
      const config: OpenAIAdapterConfig = {
        apiKey,
        skipDiscovery: true,
      };
      if (process.env['OPENAI_ORG_ID']) {
        config.organization = process.env['OPENAI_ORG_ID'];
      }
      if (process.env['OPENAI_PROJECT_ID']) {
        config.project = process.env['OPENAI_PROJECT_ID'];
      }
      return createOpenAIAdapter(config);
    }
    case 'ollama': {
      const config: OllamaAdapterConfig = {};
      if (process.env['OLLAMA_BASE_URL']) {
        config.baseUrl = process.env['OLLAMA_BASE_URL'];
      }
      if (process.env['OLLAMA_API_KEY']) {
        config.apiKey = process.env['OLLAMA_API_KEY'];
      }
      return createOllamaAdapter(config);
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
      const config: GoogleAdapterConfig = { apiKey };
      if (process.env['GOOGLE_GENAI_BASE_URL']) {
        config.baseUrl = process.env['GOOGLE_GENAI_BASE_URL'];
      }
      return createGoogleAdapter(config);
    }
    default: {
      const entry = ENV_KEYED_PROVIDERS[id];
      if (!entry) return null;
      const apiKey = firstEnv(entry.envVars);
      if (!apiKey) return null;
      return entry.create(apiKey);
    }
  }
}

export function isSupportedProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

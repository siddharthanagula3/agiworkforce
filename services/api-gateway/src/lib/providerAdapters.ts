/**
 * Provider adapter factory wired to server-held API keys.
 *
 * Each provider's adapter is constructed lazily on first request, with
 * credentials sourced from env vars (server-side only — never echoed back
 * to the client).
 *
 * Sprint 7 (api-gateway integration). Lifts the new packages/providers/*
 * into the gateway alongside the existing OpenAI-compatible llm.ts proxy,
 * without disrupting it.
 */

import {
  createAnthropicAdapter,
  type AnthropicAdapterConfig,
} from '@agiworkforce/providers-anthropic';
import { createOpenAIAdapter, type OpenAIAdapterConfig } from '@agiworkforce/providers-openai';
import { createOllamaAdapter, type OllamaAdapterConfig } from '@agiworkforce/providers-ollama';
import { createGoogleAdapter, type GoogleAdapterConfig } from '@agiworkforce/providers-google';
import {
  getModelMetadataById,
  getProviderPreset,
  modelsCatalogJson,
  PROVIDER_STREAM_PROVIDER_PRESET_IDS,
  type ModelInfo,
  type ModelMetadata,
  type Provider,
  type ProviderAdapter,
  type ProviderPreset,
  type ProviderStreamProviderPresetId,
} from '@agiworkforce/types';

export type ProviderId = ProviderStreamProviderPresetId;

export const SUPPORTED_PROVIDER_IDS = PROVIDER_STREAM_PROVIDER_PRESET_IDS;

type OpenAICompatibleProviderId = Extract<
  ProviderId,
  'xai' | 'deepseek' | 'open_router' | 'groq' | 'mistral' | 'together' | 'fireworks'
>;

interface ModelsCatalogShape {
  models: Record<string, ModelMetadata>;
}

type ProviderPresetWithEndpoint = ProviderPreset & {
  provider: Provider;
  endpoint: NonNullable<ProviderPreset['endpoint']>;
};

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
        return process.env['GOOGLE_API_KEY']
          ? { id, available: true }
          : { id, available: false, unavailableReason: 'GOOGLE_API_KEY not set' };
      case 'xai':
      case 'deepseek':
      case 'open_router':
      case 'groq':
      case 'mistral':
      case 'together':
      case 'fireworks':
        return openAICompatibleAvailability(id);
    }
  });
}

function requirePreset(id: OpenAICompatibleProviderId): ProviderPresetWithEndpoint {
  const preset = getProviderPreset(id);
  if (!preset?.provider || !preset.endpoint) {
    throw new Error(`Provider preset "${id}" is missing endpoint metadata`);
  }
  return preset as ProviderPresetWithEndpoint;
}

function openAICompatibleAvailability(id: OpenAICompatibleProviderId): ProviderAvailability {
  const preset = requirePreset(id);
  const envVar = preset.endpoint.apiKeyEnv;
  return process.env[envVar]
    ? { id, available: true }
    : { id, available: false, unavailableReason: `${envVar} not set` };
}

function toModelInfo(meta: ModelMetadata): ModelInfo {
  return {
    id: meta.id,
    name: meta.name,
    provider: meta.provider,
    contextWindow: meta.contextWindow,
    ...(meta.maxOutputTokens !== undefined ? { maxOutputTokens: meta.maxOutputTokens } : {}),
    capabilities: meta.capabilities,
    inputCostPerMillion: meta.inputCost,
    outputCostPerMillion: meta.outputCost,
  };
}

function catalogForProvider(provider: Provider): ModelInfo[] {
  const catalog = modelsCatalogJson as unknown as ModelsCatalogShape;
  return Object.values(catalog.models)
    .filter((model) => model.provider === provider)
    .map(toModelInfo);
}

function resolveUpstreamModelId(model: string, provider: Provider): string {
  const metadata = getModelMetadataById(model);
  if (metadata?.provider === provider && metadata.apiModelId) {
    return metadata.apiModelId;
  }
  return model;
}

function buildOpenAICompatiblePresetAdapter(
  id: OpenAICompatibleProviderId,
): ProviderAdapter | null {
  const preset = requirePreset(id);
  const apiKey = process.env[preset.endpoint.apiKeyEnv];
  if (!apiKey) return null;

  const config: OpenAIAdapterConfig = {
    apiKey,
    baseUrl: preset.endpoint.baseUrl,
    skipDiscovery: true,
  };
  const adapter = createOpenAIAdapter(config);
  const auth = [
    {
      kind: 'api-key' as const,
      envVar: preset.endpoint.apiKeyEnv,
      required: true,
      label: `${preset.label} API Key`,
    },
  ];

  return {
    ...adapter,
    id: preset.provider,
    label: preset.label,
    auth,
    config,
    async catalog(): Promise<ModelInfo[]> {
      return catalogForProvider(preset.provider);
    },
    stream(req, signal) {
      return adapter.stream(
        { ...req, model: resolveUpstreamModelId(req.model, preset.provider) },
        signal,
      );
    },
  };
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
      const apiKey = process.env['GOOGLE_API_KEY'];
      if (!apiKey) return null;
      const config: GoogleAdapterConfig = { apiKey };
      if (process.env['GOOGLE_GENAI_BASE_URL']) {
        config.baseUrl = process.env['GOOGLE_GENAI_BASE_URL'];
      }
      return createGoogleAdapter(config);
    }
    case 'xai':
    case 'deepseek':
    case 'open_router':
    case 'groq':
    case 'mistral':
    case 'together':
    case 'fireworks':
      return buildOpenAICompatiblePresetAdapter(id);
  }
}

export function isSupportedProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

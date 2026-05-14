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
import type { ProviderAdapter } from '@agiworkforce/types';

export type ProviderId = 'anthropic' | 'openai' | 'ollama' | 'google';

export const SUPPORTED_PROVIDER_IDS = ['anthropic', 'openai', 'ollama', 'google'] as const;

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
      const apiKey = process.env['GOOGLE_API_KEY'];
      if (!apiKey) return null;
      const config: GoogleAdapterConfig = { apiKey };
      if (process.env['GOOGLE_GENAI_BASE_URL']) {
        config.baseUrl = process.env['GOOGLE_GENAI_BASE_URL'];
      }
      return createGoogleAdapter(config);
    }
  }
}

export function isSupportedProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

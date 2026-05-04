/**
 * AI Chat Service
 * Provides unified interface for sending messages to AI providers.
 *
 * Two execution paths supported:
 *
 * 1. **Legacy** — `sendAIMessage` calls `unifiedLLMService` directly. This is
 *    what every existing chat surface uses today.
 * 2. **New (opt-in)** — `sendAIMessageViaProviderStream` calls the new
 *    `/api/v1/providers/:id/stream` SSE route via `streamFromProvider`. The
 *    new path uses the `ProviderAdapter` pipeline (anthropic, openai,
 *    google, ollama) and returns the same `string` shape so callers can flip
 *    between the two without changing call sites.
 *
 * Selection: set `NEXT_PUBLIC_USE_PROVIDER_STREAM=1` in the environment to
 * route `sendAIMessage` through the new stream path. Defaults to legacy.
 */

import { unifiedLLMService } from '@core/ai/llm/unified-language-model';
import {
  DEFAULT_ANTHROPIC_COLLABORATION_MODEL,
  DEFAULT_GOOGLE_FAST_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PERPLEXITY_MODEL,
} from '@shared/config/supported-models';
import { streamFromProvider } from '@/lib/providerStreamClient';

export interface AIMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'perplexity';

/** Provider ids the new pipeline supports. Subset of `AIProvider`. */
type ProviderStreamId = 'anthropic' | 'openai' | 'google' | 'ollama';

/** Whether the env flag opts this caller into the new path. */
function shouldUseProviderStream(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env['NEXT_PUBLIC_USE_PROVIDER_STREAM'] === '1';
}

function asProviderStreamId(provider: AIProvider): ProviderStreamId | null {
  if (provider === 'perplexity') return null; // perplexity not yet a ProviderAdapter
  return provider;
}

/**
 * Best-effort: pull the current Supabase access token from the browser.
 * Returns empty string when not signed in (the gateway will then 401 and the
 * caller falls back to the legacy path).
 */
async function tryGetAuthToken(): Promise<string> {
  if (typeof window === 'undefined') return '';
  try {
    const mod = await import('@/utils/supabase/client');
    const supabase = mod.createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  } catch {
    return '';
  }
}

export async function sendAIMessage(
  provider: AIProvider,
  messages: AIMessage[],
  model?: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  },
): Promise<string> {
  // New path: route through the ProviderAdapter pipeline when opted in AND
  // the provider has a matching adapter. Falls back to legacy on any failure
  // so existing callers stay safe during rollout.
  if (shouldUseProviderStream()) {
    const streamId = asProviderStreamId(provider);
    if (streamId) {
      try {
        const text = await sendAIMessageViaProviderStream(
          streamId,
          messages,
          model || getDefaultModel(provider),
          options,
        );
        if (text) return text;
      } catch {
        // Fall through to legacy.
      }
    }
  }

  try {
    const response = await unifiedLLMService.sendMessage({
      provider,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      model: model || getDefaultModel(provider),
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      stream: options?.stream || false,
    } as Parameters<typeof unifiedLLMService.sendMessage>[0]);

    if (!response?.content) {
      throw new Error('Empty response from LLM service');
    }

    return response.content;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Failed to send message to ${provider}`;
    throw new Error(message);
  }
}

/**
 * Send a chat message through the new `/api/v1/providers/:id/stream` route
 * using the `ProviderAdapter` pipeline. Returns the assembled assistant text
 * (drains the SSE stream into a single string) so it's a drop-in shape match
 * for `sendAIMessage`. Throws on any error / non-success stop reason.
 */
export async function sendAIMessageViaProviderStream(
  provider: ProviderStreamId,
  messages: AIMessage[],
  model: string,
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  const authToken = await tryGetAuthToken();
  if (!authToken) {
    throw new Error('Not signed in (provider stream path requires Supabase session)');
  }

  let text = '';
  let stopReason: string | undefined;
  let errorMessage: string | undefined;

  for await (const chunk of streamFromProvider({
    providerId: provider,
    authToken,
    request: {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
    },
    ...(options?.signal ? { signal: options.signal } : {}),
  })) {
    if (chunk.type === 'text-delta') text += chunk.delta;
    else if (chunk.type === 'stop') stopReason = chunk.reason;
    else if (chunk.type === 'error') errorMessage = chunk.message;
  }

  if (errorMessage) throw new Error(errorMessage);
  if (stopReason === 'error') throw new Error('Stream ended with error stop');
  if (!text) throw new Error('Empty response from provider stream');
  return text;
}

/**
 * Check if provider is configured
 * SECURITY: Always returns true since providers are available through authenticated proxies
 * Actual availability is determined server-side
 */
export function isProviderConfigured(_provider: AIProvider): boolean {
  // All providers are available through authenticated Netlify proxies
  // Actual availability depends on server-side API key configuration
  return true;
}

/**
 * Get configured providers
 * SECURITY: All providers available through authenticated proxies
 */
export function getConfiguredProviders(): AIProvider[] {
  // All providers are available through authenticated Netlify proxies
  return ['openai', 'anthropic', 'google', 'perplexity'];
}

function getDefaultModel(provider: AIProvider): string {
  const defaultModels: Record<AIProvider, string> = {
    openai: DEFAULT_OPENAI_MODEL,
    anthropic: DEFAULT_ANTHROPIC_COLLABORATION_MODEL,
    google: DEFAULT_GOOGLE_FAST_MODEL,
    perplexity: DEFAULT_PERPLEXITY_MODEL,
  };

  return defaultModels[provider];
}

export { type AIProvider as Provider };

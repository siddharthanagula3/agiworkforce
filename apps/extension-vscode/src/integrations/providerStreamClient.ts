/**
 * VS Code provider stream client.
 *
 * Thin wrapper around the shared `@agiworkforce/provider-runtime` SSE client
 * (`packages/ai/provider-runtime/src/client/streamFromProvider.ts`). Keeps this
 * surface's public API (types + `streamFromProvider` signature) stable for
 * its callers. Uses Node's global fetch (available in VS Code's Node 18+
 * host) and the same SSE frame parser as the other surfaces.
 *
 * Auth: caller passes a bearer token sourced from VS Code secret storage
 * (the AGI Cloud account token from `signInToAgiCloud`, via `getAccountToken`).
 * Gateway URL: `agiWorkforce.gatewayUrl` setting, defaulting to
 * `https://api.agiworkforce.com` for production. Override per-machine via
 * VS Code settings.
 */

import { streamFromProvider as sharedStreamFromProvider } from '@agiworkforce/provider-runtime';

export type ProviderStreamProvider = 'anthropic' | 'openai' | 'ollama' | 'google';

export interface ProviderStreamMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ProviderStreamRequest {
  model: string;
  messages: ProviderStreamMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}

export type StreamChunk =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string; signature?: string }
  | { type: 'tool-use-start'; toolUseId: string; name: string }
  | { type: 'tool-use-delta'; toolUseId: string; deltaJson: string }
  | { type: 'tool-use-end'; toolUseId: string }
  | {
      type: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      reasoningTokens?: number;
    }
  | { type: 'error'; code?: string; message: string; retryable?: boolean }
  | {
      type: 'stop';
      reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel';
    };

export interface StreamFromProviderParams {
  gatewayUrl: string;
  providerId: ProviderStreamProvider;
  authToken: string;
  request: ProviderStreamRequest;
  signal?: AbortSignal;
}

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  yield* sharedStreamFromProvider<ProviderStreamRequest, StreamChunk>({
    providerId: params.providerId,
    authToken: params.authToken,
    request: params.request,
    ...(params.signal ? { signal: params.signal } : {}),
    baseUrl: params.gatewayUrl,
    clientTag: 'agiworkforce-vscode',
  });
}

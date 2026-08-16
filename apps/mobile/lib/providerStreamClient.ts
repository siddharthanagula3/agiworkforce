
import { streamFromProvider as sharedStreamFromProvider } from '@agiworkforce/provider-runtime';
import { guardedFetch } from '@/lib/egressGuard';

export type ProviderStreamProvider =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot';

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

const STREAM_IDLE_TIMEOUT_MS = 45_000;

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  yield* sharedStreamFromProvider<ProviderStreamRequest, StreamChunk>({
    providerId: params.providerId,
    authToken: params.authToken,
    request: params.request,
    ...(params.signal ? { signal: params.signal } : {}),
    baseUrl: params.gatewayUrl,
    fetchImpl: (input, init) => guardedFetch(input, init, { stream: true }),
    clientTag: 'agiworkforce-mobile',
    idleWatchdog: { idleMs: STREAM_IDLE_TIMEOUT_MS },
    catchTransportErrors: true,
    surfaceMalformedFrames: true,
  });
}

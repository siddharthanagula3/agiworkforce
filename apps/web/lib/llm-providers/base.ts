import 'server-only';

import { logger } from '@/lib/logger';

/** HTTP status codes that indicate a temporary server error and should be retried */
export const RETRYABLE_HTTP_STATUS_CODES = new Set([500, 502, 503, 504]);

/** Additional status codes that signal a transient/overloaded provider and are
 *  safe to retry: 429 (rate limit) and 529 (Anthropic "overloaded"). */
const RETRYABLE_TRANSIENT_STATUS_CODES = new Set([429, 529]);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUS_CODES.has(status) || RETRYABLE_TRANSIENT_STATUS_CODES.has(status);
}

/** Per-request timeout (ms) applied to every provider fetch attempt. */
const DEFAULT_REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env['LLM_PROVIDER_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
})();

/** Maximum number of RETRIES (not counting the first attempt). */
const DEFAULT_MAX_RETRIES = (() => {
  const raw = Number(process.env['LLM_PROVIDER_MAX_RETRIES']);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 5) : 2;
})();

/** Base backoff (ms) for exponential delay; capped at MAX_BACKOFF_MS. */
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute backoff for a given attempt index (0-based), honoring an optional
 *  numeric Retry-After header (seconds), with full jitter and a hard cap. */
function computeBackoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS);
  }
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // Full jitter: random between 0 and exp.
  return Math.floor(Math.random() * exp);
}

export interface LLMProviderResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  reasoningOutputTokens?: number; // Thinking/reasoning tokens (OpenAI o-series, Anthropic extended thinking)
  cacheCreationInputTokens?: number;
  /** Subset of cacheCreationInputTokens billed at Anthropic's 1-hour cache rate
   *  (2x input) instead of the 5m rate (1.25x input). See cache-retention.ts. */
  cacheCreation1hInputTokens?: number;
  cachedInputTokens?: number;
  tool_calls?: unknown[]; // Tool calls if the model used function calling
  citations?: unknown[]; // Citations from server-managed tools (e.g., Anthropic web_search)
  search_results?: unknown[]; // Search result blocks from server-managed web search
}

export interface LLMProviderRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    multimodal_content?: unknown[];
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  thinking_mode?: boolean;
  usePromptCache?: boolean;
  /** Cache retention hint for providers that support explicit TTL markers.
   *  'short' = 5-minute ephemeral (Anthropic default), 'long' = 1-hour,
   *  'none' = suppress cache_control entirely.
   *  Undefined means use the provider's default logic (for Anthropic: 'short'
   *  when usePromptCache is true). */
  cacheRetention?: 'none' | 'short' | 'long';
  thinking?: {
    type: string;
    budget_tokens?: number;
  };
  effort?: string;
}

export abstract class BaseLLMProvider {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || this.getDefaultBaseUrl();
  }

  abstract getDefaultBaseUrl(): string;
  abstract sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse>;
  abstract streamRequest(request: LLMProviderRequest): Promise<ReadableStream>;

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Provider fetch with a per-attempt timeout and bounded exponential backoff
   * retry on transient failures.
   *
   * SAFETY: This wraps ONLY the connection + the initial (pre-body) response.
   * It never reads `response.body`/`response.text()`/`response.json()`, so the
   * returned Response is pristine. For streaming, the ReadableStream is consumed
   * by the route handler AFTER this returns — a retry therefore happens strictly
   * before the first byte is read and can never duplicate emitted tokens or
   * double-bill an already-started stream.
   *
   * Retries occur on:
   *   - a thrown network error, or an AbortError caused by the request timeout;
   *   - a response whose status is retryable (500/502/503/504/429/529).
   * When retries are exhausted, the last Response is returned UNREAD so each
   * provider's existing `!response.ok` branch produces its specific error
   * message (no behavior regression for non-retryable statuses).
   */
  protected async fetchWithRetry(
    url: string,
    init: RequestInit,
    options?: { maxRetries?: number; timeoutMs?: number },
  ): Promise<Response> {
    const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        if (response.ok || !isRetryableStatus(response.status)) {
          // Success, or a non-retryable error the caller must handle itself.
          return response;
        }

        // Retryable status: discard the unread response and back off.
        lastResponse = response;
        if (attempt < maxRetries) {
          const delay = computeBackoffMs(attempt, response.headers.get('retry-after'));
          logger.warn(
            { url, status: response.status, attempt: attempt + 1, maxRetries, delay },
            'Provider returned a retryable status; backing off before retry',
          );
          await sleep(delay);
          continue;
        }
        // Exhausted: return the last response so the caller's error path runs.
        return response;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        const isAbort = error instanceof Error && error.name === 'AbortError';
        if (attempt < maxRetries) {
          const delay = computeBackoffMs(attempt, null);
          logger.warn(
            {
              url,
              attempt: attempt + 1,
              maxRetries,
              delay,
              timedOut: isAbort,
              error: error instanceof Error ? error.message : String(error),
            },
            isAbort
              ? 'Provider request timed out; backing off before retry'
              : 'Provider request failed (network error); backing off before retry',
          );
          await sleep(delay);
          continue;
        }
        // Exhausted on a thrown error: rethrow a descriptive error.
        if (isAbort) {
          throw new Error(
            `Provider request timed out after ${timeoutMs}ms (${maxRetries + 1} attempts).`,
          );
        }
        throw error;
      }
    }

    // Unreachable in practice, but satisfies the type checker.
    if (lastResponse) return lastResponse;
    throw lastError instanceof Error
      ? lastError
      : new Error('Provider request failed after retries.');
  }
}

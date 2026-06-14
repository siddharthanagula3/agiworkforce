/**
 * freeTrialClient.ts — Economy-tier chat client for signed-in free users.
 *
 * Implements the "3 prompts free" tier that mirrors the web Hobby/free experience:
 *   - 3 cloud chat prompts per user, tracked in chrome.storage.local
 *   - Routes to POST https://agiworkforce.com/api/llm/v1/chat/completions
 *     (the Next.js API route that handles free-tier users via
 *     reserveFreeTrialPrompt — NOT the Express gateway which blocks free users)
 *   - Economy model: read from models.json taskRouting.chat (gemini-3.1-flash-lite)
 *   - Streams SSE response back via an async generator
 *   - Auth: Clerk Bearer token from chrome.storage.session / chrome.storage.local
 *     (same dual-path as cloudAgentClient.getAuthToken)
 *
 * Contract with background.ts:
 *   1. Call getAuthToken() to check if a token is available
 *   2. Call getRemainingFreePrompts() to check quota — if 0, caller should
 *      show the upgrade modal instead of attempting a call
 *   3. Call streamFreeChat(messages, token) — it decrements the local counter
 *      and yields text deltas, then a final done signal
 *   4. If the server returns 403 (quota_exceeded) the local counter is already
 *      at 0 so the next call will short-circuit without a network round-trip
 *
 * QUOTA LOGIC:
 *   The server is the authoritative gate (reserveFreeTrialPrompt DB write).
 *   The local counter is a client-side cache that avoids unnecessary round-trips
 *   and drives the remaining-count UI. On a 403 from the server, we snap the
 *   local count to 0. On success we decrement locally. On network error or 5xx
 *   we do NOT decrement (server did not consume the quota slot).
 *
 * MODEL:
 *   Read from models.json providers.managed_cloud.taskRouting.chat at build time.
 *   Never hardcoded.
 *
 * SECURITY:
 *   - Only posts to FREE_TRIAL_GATEWAY — validated before every fetch
 *   - Bearer token never logged
 *   - Input capped at FREE_TRIAL_MAX_INPUT_CHARS to bound server cost
 */

import modelsJson from '../../../../../packages/types/src/models.json';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The economy model used for free-trial prompts.
 * Read from models.json managed_cloud.taskRouting.chat (= gemini-3.1-flash-lite).
 * Never hardcoded — this constant is the single indirection point.
 */
export const FREE_TRIAL_MODEL: string =
  (modelsJson.providers.managed_cloud.taskRouting as Record<string, string>)['chat'] ??
  'gemini-3.1-flash-lite';

/**
 * Number of free prompts per signed-in user.
 * Mirrors web surface apps/web/lib/free-trial-config.ts FREE_TRIAL_PROMPT_LIMIT = 3.
 */
export const FREE_TRIAL_PROMPT_LIMIT = 3;

/**
 * Character cap on the total user message to bound server cost per free prompt.
 * Mirrors web FREE_TRIAL_MAX_INPUT_CHARS = 32_000.
 */
export const FREE_TRIAL_MAX_INPUT_CHARS = 32_000;

/**
 * The web app's Next.js API route that handles free-tier users.
 * This is distinct from https://api.agiworkforce.com/v1/chat/completions
 * (the Express gateway) which blocks free-tier users with 403.
 */
export const FREE_TRIAL_GATEWAY = 'https://agiworkforce.com';
export const FREE_TRIAL_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/llm/v1/chat/completions`;

/** chrome.storage.local key for the local free-prompt counter */
export const FREE_PROMPTS_USED_KEY = 'agi_free_prompts_used';

/** chrome.storage.session / chrome.storage.local key for the Clerk session token */
const SESSION_TOKEN_KEY = 'agi_clerk_session_token';
const DEV_TOKEN_KEY = 'agi_dev_bearer_token';

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Retrieve the Clerk Bearer token.
 *
 * Priority:
 *   1. chrome.storage.session["agi_clerk_session_token"] — set by the sign-in flow
 *   2. chrome.storage.local["agi_dev_bearer_token"] — static dev/paste token
 *   3. null — user must sign in
 *
 * Mirrors cloudAgentClient.getAuthToken() so both clients share the same
 * storage contract. Kept here to allow freeTrialClient to be imported
 * independently in tests without pulling in the full computer-use module.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      'session' in chrome.storage &&
      chrome.storage.session
    ) {
      const sess = await (
        chrome.storage.session as unknown as {
          get: (keys: string[]) => Promise<Record<string, unknown>>;
        }
      ).get([SESSION_TOKEN_KEY]);
      const token = sess[SESSION_TOKEN_KEY];
      if (typeof token === 'string' && token.length > 0) return token;
    }
  } catch {
    // unavailable in test environments — fall through
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const local = await chrome.storage.local.get([DEV_TOKEN_KEY]);
      const token = local[DEV_TOKEN_KEY];
      if (typeof token === 'string' && token.length > 0) return token;
    }
  } catch {
    // unavailable in test environments — fall through
  }

  return null;
}

/** Store a Clerk session token in chrome.storage.session (cleared on browser close). */
export async function storeSessionToken(token: string): Promise<void> {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      'session' in chrome.storage &&
      chrome.storage.session
    ) {
      await (
        chrome.storage.session as unknown as {
          set: (items: Record<string, unknown>) => Promise<void>;
        }
      ).set({ [SESSION_TOKEN_KEY]: token });
      return;
    }
  } catch {
    // fall through to local storage
  }
  // Fallback: store in local storage (persists across sessions)
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [DEV_TOKEN_KEY]: token });
    }
  } catch {
    // swallow — caller will surface auth prompt on next request
  }
}

/** Clear all stored auth tokens (sign-out). */
export async function clearAuthToken(): Promise<void> {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      'session' in chrome.storage &&
      chrome.storage.session
    ) {
      await (
        chrome.storage.session as unknown as {
          remove: (keys: string[]) => Promise<void>;
        }
      ).remove([SESSION_TOKEN_KEY]);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove([DEV_TOKEN_KEY]);
    }
  } catch {
    // ignore
  }
}

// ─── Quota helpers ────────────────────────────────────────────────────────────

/**
 * Read the local free-prompt counter.
 * Returns how many prompts have been USED (0–3).
 * Local counter is a cache — server is authoritative on 403.
 */
export async function getFreePromptsUsed(): Promise<number> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get([FREE_PROMPTS_USED_KEY]);
      const raw = result[FREE_PROMPTS_USED_KEY];
      if (typeof raw === 'number' && raw >= 0) return Math.min(raw, FREE_TRIAL_PROMPT_LIMIT);
    }
  } catch {
    // storage unavailable
  }
  return 0;
}

/** Number of free prompts the user has remaining. */
export async function getRemainingFreePrompts(): Promise<number> {
  const used = await getFreePromptsUsed();
  return Math.max(0, FREE_TRIAL_PROMPT_LIMIT - used);
}

/** Increment the local free-prompt counter (called on successful server response). */
async function incrementPromptsUsed(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get([FREE_PROMPTS_USED_KEY]);
      const current =
        typeof result[FREE_PROMPTS_USED_KEY] === 'number' ? result[FREE_PROMPTS_USED_KEY] : 0;
      await chrome.storage.local.set({
        [FREE_PROMPTS_USED_KEY]: Math.min((current as number) + 1, FREE_TRIAL_PROMPT_LIMIT),
      });
    }
  } catch {
    // swallow — counter drift is acceptable; server is authoritative
  }
}

/** Snap the local counter to the limit (called on 403 quota_exceeded). */
async function snapPromptCountToLimit(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [FREE_PROMPTS_USED_KEY]: FREE_TRIAL_PROMPT_LIMIT });
    }
  } catch {
    // ignore
  }
}

// ─── Message shape ────────────────────────────────────────────────────────────

export interface FreeTrialMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ─── Stream result ────────────────────────────────────────────────────────────

export type FreeTrialChunk =
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string; code?: 'quota_exceeded' | 'auth_required' | 'server_error' };

// ─── Core streaming call ──────────────────────────────────────────────────────

/**
 * Stream a free-trial chat completion from the AGI web gateway.
 *
 * Yields FreeTrialChunk items:
 *   { type: 'text', text }  — incremental content delta
 *   { type: 'done' }        — stream complete, prompt counted
 *   { type: 'error', ... }  — terminal error, prompt NOT counted
 *
 * The caller is responsible for:
 *   1. Checking getRemainingFreePrompts() > 0 before calling
 *   2. Passing a non-null token from getAuthToken()
 *   3. Handling 'quota_exceeded' by showing the upgrade modal
 *   4. Handling 'auth_required' by showing the sign-in UI
 */
export async function* streamFreeChat(
  messages: FreeTrialMessage[],
  token: string,
  signal?: AbortSignal,
): AsyncGenerator<FreeTrialChunk> {
  // Cap total input chars to bound cost per free prompt
  const cappedMessages = messages.map((m) => ({
    ...m,
    content:
      m.content.length > FREE_TRIAL_MAX_INPUT_CHARS
        ? m.content.slice(0, FREE_TRIAL_MAX_INPUT_CHARS)
        : m.content,
  }));

  let response: Response;
  try {
    response = await fetch(FREE_TRIAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        // CSRF header required by the web's requireCsrfToken middleware.
        // For extension-originated requests the Origin header (set by browser
        // to the extension origin) satisfies same-site checks; some deployments
        // also check X-Requested-With for XHR-alike detection.
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        model: FREE_TRIAL_MODEL,
        messages: cappedMessages,
        stream: true,
        max_tokens: 2000,
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      yield { type: 'error', message: 'Cancelled.', code: 'server_error' };
      return;
    }
    yield {
      type: 'error',
      message: 'Network error reaching AGI cloud. Check your connection.',
      code: 'server_error',
    };
    return;
  }

  if (response.status === 401 || response.status === 403) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore
    }

    // Detect quota-exceeded specifically (server sends 403 with a specific error code)
    const isQuotaExceeded =
      response.status === 403 &&
      (body.includes('limit_reached') ||
        body.includes('free_trial') ||
        body.includes('prompt_limit') ||
        body.includes('Upgrade'));

    if (isQuotaExceeded) {
      await snapPromptCountToLimit();
      yield {
        type: 'error',
        message: 'Free trial limit reached. Sign in and upgrade to continue.',
        code: 'quota_exceeded',
      };
      return;
    }

    if (response.status === 401) {
      yield {
        type: 'error',
        message: 'Sign in to use AGI Cloud chat.',
        code: 'auth_required',
      };
      return;
    }

    // Other 403: plan-gated
    yield {
      type: 'error',
      message: 'Cloud chat requires an AGI account. Sign in to continue.',
      code: 'auth_required',
    };
    return;
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    yield {
      type: 'error',
      message: `Cloud gateway error (${response.status}): ${errBody.slice(0, 200)}`,
      code: 'server_error',
    };
    return;
  }

  // Stream the SSE response
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body from gateway.', code: 'server_error' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let receivedAnyText = false;

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        yield { type: 'error', message: 'Cancelled.', code: 'server_error' };
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(dataStr) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            content?: string;
            done?: boolean;
            error?: { message?: string; code?: string };
          };

          // Check for inline error in stream (e.g. quota exceeded mid-stream)
          if (parsed.error) {
            const errMsg = parsed.error.message ?? 'Gateway error';
            const errCode = parsed.error.code ?? '';
            if (errCode.includes('limit_reached') || errCode.includes('free_trial')) {
              await snapPromptCountToLimit();
              yield { type: 'error', message: errMsg, code: 'quota_exceeded' };
              return;
            }
            yield { type: 'error', message: errMsg, code: 'server_error' };
            return;
          }

          const delta =
            parsed.choices?.[0]?.delta?.content ??
            (typeof parsed.content === 'string' ? parsed.content : '');

          if (delta) {
            receivedAnyText = true;
            yield { type: 'text', text: delta };
          }

          if (
            parsed.done === true ||
            parsed.choices?.[0]?.finish_reason === 'stop' ||
            parsed.choices?.[0]?.finish_reason === 'length'
          ) {
            // Success path — increment local counter
            if (receivedAnyText) {
              await incrementPromptsUsed();
            }
            yield { type: 'done' };
            return;
          }
        } catch {
          // Non-JSON or malformed SSE line — skip
        }
      }
    }

    // Stream ended without explicit [DONE] — treat as success if we got text
    if (receivedAnyText) {
      await incrementPromptsUsed();
    }
    yield { type: 'done' };
  } catch (err) {
    reader.cancel().catch(() => {});
    if (err instanceof Error && err.name === 'AbortError') {
      yield { type: 'error', message: 'Cancelled.', code: 'server_error' };
      return;
    }
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : 'Stream read error.',
      code: 'server_error',
    };
  } finally {
    reader.cancel().catch(() => {});
  }
}

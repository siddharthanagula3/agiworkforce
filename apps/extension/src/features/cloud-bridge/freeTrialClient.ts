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
 *   - Auth: fresh Clerk Native API token; a local-storage override exists only
 *     in development builds
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
 *   Read from the canonical model catalog via getRoutingSlotModel('general_fast')
 *   (the lowest-cost managed-cloud chat lane). Never hardcoded.
 *
 * SECURITY:
 *   - Only posts to FREE_TRIAL_GATEWAY — validated before every fetch
 *   - Bearer token never logged
 *   - Input capped at FREE_TRIAL_MAX_INPUT_CHARS to bound server cost
 */

import { getRoutingSlotModel, MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { BoundedSseDecoder, SseFrameLimitError } from './boundedSseDecoder';
import { getFreshClerkToken, signOutClerk } from './clerkAuth';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The economy model used for free-trial prompts.
 * Read from the canonical SLOT_REGISTRY 'general_fast' slot (lowest-cost lane;
 * managed_cloud.taskRouting in models.json was cleared in favour of the slot
 * registry). Never hardcoded — this constant is the single indirection point.
 */
export const FREE_TRIAL_MODEL: string = getRoutingSlotModel('general_fast');

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

/** Bound the request envelope before it reaches the privileged web route. */
export const MANAGED_CHAT_MAX_MESSAGES = 100;
export const MANAGED_CHAT_MAX_ATTACHMENTS = 5;
export const MANAGED_CHAT_MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES;
export const MANAGED_CHAT_DEFAULT_TIMEOUT_MS = 90_000;
/** Maximum size of one not-yet-dispatched SSE event. */
export const MANAGED_CHAT_MAX_SSE_FRAME_CHARS = 1_048_576;
/** Maximum visible text accepted for one managed-chat turn. */
export const MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS = 4_194_304;
const MANAGED_CHAT_MAX_ERROR_BODY_CHARS = 65_536;

/**
 * The web app's Next.js API route that handles free-tier users.
 * This is distinct from https://api.agiworkforce.com/v1/chat/completions
 * (the Express gateway) which blocks free-tier users with 403.
 */
export const FREE_TRIAL_GATEWAY = 'https://agiworkforce.com';
export const FREE_TRIAL_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/llm/v1/chat/completions`;
export const MANAGED_MODELS_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/llm/v1/models`;

/** chrome.storage.local key for the local free-prompt counter */
export const FREE_PROMPTS_USED_KEY = 'agi_free_prompts_used';

/** Retired hand-pasted token keys retained only for cleanup during sign-out. */
const SESSION_TOKEN_KEY = 'agi_clerk_session_token';
const DEV_TOKEN_KEY = 'agi_dev_bearer_token';

export interface ManagedModelAccess {
  subscriptionTier: string;
  modelIds: string[];
  allowedAutoModes: string[];
}

const MAX_MANAGED_MODEL_IDS = 200;
const MAX_MANAGED_AUTO_MODES = 50;

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeAccessString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength && !containsControlCharacter(normalized)
    ? normalized
    : undefined;
}

/**
 * Load model admission from the authenticated server owner. Chrome never
 * trusts a side-panel supplied tier or a stale `agi_user_tier` storage value.
 */
export async function getManagedModelAccess(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedModelAccess> {
  if (!token.trim()) throw new Error('Authentication is required');
  const response = await fetch(MANAGED_MODELS_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'Authentication is required'
        : `Model access is unavailable (${response.status})`,
    );
  }

  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid model-access response');
  }
  const record = body as Record<string, unknown>;
  const models = record['data'];
  const metadata = record['x_agi_workforce'];
  if (!Array.isArray(models) || !metadata || typeof metadata !== 'object') {
    throw new Error('Invalid model-access response');
  }
  const meta = metadata as Record<string, unknown>;
  const subscriptionTier = meta['user_tier'];
  const autoModes = meta['allowed_auto_modes'];
  const normalizedTier = normalizeAccessString(subscriptionTier, 64);
  if (!normalizedTier || !Array.isArray(autoModes)) {
    throw new Error('Invalid model-access response');
  }

  const modelIds: string[] = [];
  const seenModels = new Set<string>();
  for (const value of models.slice(0, MAX_MANAGED_MODEL_IDS * 2)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid model-access response');
    }
    const id = normalizeAccessString((value as Record<string, unknown>)['id'], 200);
    if (!id) {
      throw new Error('Invalid model-access response');
    }
    if (!seenModels.has(id)) {
      seenModels.add(id);
      modelIds.push(id);
      if (modelIds.length === MAX_MANAGED_MODEL_IDS) break;
    }
  }

  const allowedAutoModes: string[] = [];
  const seenAutoModes = new Set<string>();
  for (const value of autoModes.slice(0, MAX_MANAGED_AUTO_MODES * 4)) {
    const mode = normalizeAccessString(value, 100);
    if (!mode) throw new Error('Invalid model-access response');
    if (!seenAutoModes.has(mode)) {
      seenAutoModes.add(mode);
      allowedAutoModes.push(mode);
      if (allowedAutoModes.length === MAX_MANAGED_AUTO_MODES) break;
    }
  }

  return {
    subscriptionTier: normalizedTier,
    modelIds,
    allowedAutoModes,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Retrieve the Clerk Bearer token.
 *
 * Priority:
 *   1. Clerk Chrome Extension SDK Native API session
 *   2. chrome.storage.local["agi_dev_bearer_token"] — static dev token,
 *      DEV BUILDS ONLY (gated by import.meta.env.DEV; absent in production)
 *   3. null — user must sign in
 *
 * This is the single credential contract for Managed Cloud chat and computer
 * use. Production always uses Clerk; the manual fallback is development-only.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await getFreshClerkToken();
    if (token) return token;
  } catch {
    // Native API may be unavailable in a misconfigured development build. The
    // dev-only token below remains an explicit local escape hatch for tests.
  }

  // DEV-ONLY: a manually pasted bearer token in chrome.storage.local. This path
  // is gated to dev builds — `import.meta.env.DEV` is false in production Vite
  // builds, so this branch is tree-shaken out and production never reads a
  // persisted bearer from disk. Production tokens come only from the in-memory
  // session store (set by the sign-in flow). (Vitest sets DEV=true, so tests
  // exercising the dev-token path still pass.)
  if (isDevBuild()) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const local = await chrome.storage.local.get([DEV_TOKEN_KEY]);
        const token = local[DEV_TOKEN_KEY];
        if (typeof token === 'string' && token.length > 0) return token;
      }
    } catch {
      // unavailable in test environments — fall through
    }
  }

  return null;
}

/** True only in dev/test Vite builds; false in production builds (tree-shaken). */
function isDevBuild(): boolean {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

/**
 * Sign out of Clerk and remove retired development/manual token remnants.
 */
export async function clearAuthToken(): Promise<void> {
  try {
    await signOutClerk();
  } catch {
    // Continue removing local remnants even when the network sign-out fails.
  }
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

// Multiple side-panel/background requests can complete concurrently. Serialize
// the local cache update so two successful responses cannot both read `0` and
// persist `1`. The server remains the authoritative quota owner.
let quotaMutationQueue: Promise<void> = Promise.resolve();

function enqueueQuotaMutation(operation: () => Promise<void>): Promise<void> {
  const result = quotaMutationQueue.then(operation);
  quotaMutationQueue = result.catch(() => undefined);
  return result;
}

/** Increment the local free-prompt counter (called on successful server response). */
async function incrementPromptsUsed(): Promise<void> {
  await enqueueQuotaMutation(async () => {
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
      // Cache drift is recoverable because the server owns admission.
    }
  });
}

/** Snap the local counter to the limit (called on 403 quota_exceeded). */
async function snapPromptCountToLimit(): Promise<void> {
  await enqueueQuotaMutation(async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [FREE_PROMPTS_USED_KEY]: FREE_TRIAL_PROMPT_LIMIT });
      }
    } catch {
      // Cache drift is recoverable because the server owns admission.
    }
  });
}

// ─── Message shape ────────────────────────────────────────────────────────────

export type FreeTrialContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string; detail: 'auto' | 'low' | 'high' };
    };

export interface FreeTrialMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | FreeTrialContentPart[];
}

const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;

function imageDataUrlByteLength(value: string): number {
  if (!SUPPORTED_IMAGE_DATA_URL.test(value)) {
    throw new Error('Unsupported attachment: expected a base64 PNG, JPEG, WebP, or GIF image');
  }
  const base64 = value.slice(value.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function assertAttachmentBudget(attachments: readonly string[]): void {
  if (attachments.length > MANAGED_CHAT_MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments: maximum is ${MANAGED_CHAT_MAX_ATTACHMENTS}`);
  }
  let totalBytes = 0;
  for (const attachment of attachments) {
    totalBytes += imageDataUrlByteLength(attachment);
    if (totalBytes > MANAGED_CHAT_MAX_ATTACHMENT_BYTES) {
      throw new Error('Attachments exceed the 25 MiB request limit');
    }
  }
}

export function createMultimodalUserContent(
  text: string,
  attachments: string[],
): FreeTrialContentPart[] {
  assertAttachmentBudget(attachments);
  const parts: FreeTrialContentPart[] = [{ type: 'text', text }];
  for (const attachment of attachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: attachment, detail: 'auto' },
    });
  }
  return parts;
}

function selectBoundedMessageWindow(messages: readonly FreeTrialMessage[]): FreeTrialMessage[] {
  if (messages.length <= MANAGED_CHAT_MAX_MESSAGES) return [...messages];
  const firstSystem = messages.find((message) => message.role === 'system');
  const recent = messages.slice(-(MANAGED_CHAT_MAX_MESSAGES - (firstSystem ? 1 : 0)));
  return firstSystem && !recent.includes(firstSystem) ? [firstSystem, ...recent] : recent;
}

function assertMessageShape(message: FreeTrialMessage): void {
  if (!message || typeof message !== 'object') throw new Error('Invalid managed chat message');
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
    throw new Error('Invalid managed chat message role');
  }
  if (typeof message.content === 'string') return;
  if (!Array.isArray(message.content)) throw new Error('Invalid managed chat message content');
  for (const part of message.content) {
    if (!part || typeof part !== 'object') throw new Error('Invalid managed chat content part');
    if (part.type === 'text') {
      if (typeof part.text !== 'string') throw new Error('Invalid managed chat text part');
      continue;
    }
    if (
      part.type !== 'image_url' ||
      !part.image_url ||
      typeof part.image_url.url !== 'string' ||
      !['auto', 'low', 'high'].includes(part.image_url.detail)
    ) {
      throw new Error('Invalid managed chat image part');
    }
  }
}

/**
 * Apply one request-wide text budget, prioritizing the current turn and recent
 * history. The old per-message slice allowed N × 32k input through.
 */
function capRequestMessages(messages: readonly FreeTrialMessage[]): FreeTrialMessage[] {
  const window = selectBoundedMessageWindow(messages);
  let remaining = FREE_TRIAL_MAX_INPUT_CHARS;
  const reversed: FreeTrialMessage[] = [];
  let attachmentCount = 0;
  let attachmentBytes = 0;

  for (let index = window.length - 1; index >= 0; index -= 1) {
    const message = window[index];
    if (!message) continue;
    assertMessageShape(message);
    if (typeof message.content === 'string') {
      const content = message.content.slice(0, remaining);
      remaining -= content.length;
      if (content.length > 0 || index === window.length - 1) {
        reversed.push({ ...message, content });
      }
      continue;
    }

    const parts: FreeTrialContentPart[] = [];
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (!part) continue;
      if (part.type === 'text') {
        const text = part.text.slice(0, remaining);
        remaining -= text.length;
        if (text) parts.unshift({ ...part, text });
        continue;
      }
      attachmentCount += 1;
      attachmentBytes += imageDataUrlByteLength(part.image_url.url);
      if (
        attachmentCount > MANAGED_CHAT_MAX_ATTACHMENTS ||
        attachmentBytes > MANAGED_CHAT_MAX_ATTACHMENT_BYTES
      ) {
        throw new Error('Managed chat attachment budget exceeded');
      }
      parts.unshift(part);
    }
    if (parts.length > 0) reversed.push({ ...message, content: parts });
  }

  return reversed.reverse();
}

// ─── Stream result ────────────────────────────────────────────────────────────

export type FreeTrialChunk =
  | { type: 'text'; text: string }
  | { type: 'done' }
  | {
      type: 'error';
      message: string;
      code:
        | 'quota_exceeded'
        | 'auth_required'
        | 'plan_required'
        | 'rate_limited'
        | 'server_error'
        | 'protocol_error'
        | 'cancelled'
        | 'timeout';
    };

export interface ManagedChatStreamOptions {
  /** Concrete canonical model selected by the shared router. */
  model?: string;
  /** Authenticated account tier; controls only the local free-quota display cache. */
  subscriptionTier?: string;
  extendedThinking?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'aborted' in value &&
    typeof (value as AbortSignal).addEventListener === 'function',
  );
}

function normalizeStreamOptions(
  value: ManagedChatStreamOptions | AbortSignal | undefined,
): ManagedChatStreamOptions {
  return isAbortSignal(value) ? { signal: value } : (value ?? {});
}

interface ParsedSseFrame {
  text?: string;
  terminal?: boolean;
  recognized?: boolean;
  error?: Extract<FreeTrialChunk, { type: 'error' }>;
}

function protocolError(message = 'Malformed response from AGI Cloud.'): ParsedSseFrame {
  return { error: { type: 'error', message, code: 'protocol_error' } };
}

class ManagedChatProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedChatProtocolError';
  }
}

/** Parse one already-decoded SSE data payload. */
function parseSseData(dataPayload: string): ParsedSseFrame {
  const data = dataPayload.trim();
  if (!data) return { recognized: true };
  if (data === '[DONE]') return { terminal: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return protocolError();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return protocolError();
  }

  const event = parsed as Record<string, unknown>;
  if (event['error'] !== undefined) {
    const rawError = event['error'];
    const errorRecord =
      rawError && typeof rawError === 'object' && !Array.isArray(rawError)
        ? (rawError as Record<string, unknown>)
        : undefined;
    const message =
      typeof rawError === 'string'
        ? rawError
        : typeof errorRecord?.['message'] === 'string'
          ? errorRecord['message']
          : 'AGI Cloud request failed.';
    const providerCode = typeof errorRecord?.['code'] === 'string' ? errorRecord['code'] : '';
    const quota = providerCode.includes('limit_reached') || providerCode.includes('free_trial');
    return {
      error: {
        type: 'error',
        message,
        code: quota ? 'quota_exceeded' : 'server_error',
      },
    };
  }

  let recognized = false;
  let deltaContent: unknown;
  let finishReason: unknown;
  const choices = event['choices'];
  if (choices !== undefined) {
    if (!Array.isArray(choices)) return protocolError();
    if (choices.length === 0) {
      // OpenAI-compatible streams may send a trailing usage-only chunk.
      if (event['usage'] === undefined) return protocolError();
      recognized = true;
    } else {
      const choice = choices[0];
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return protocolError();
      const choiceRecord = choice as Record<string, unknown>;
      finishReason = choiceRecord['finish_reason'];
      const delta = choiceRecord['delta'];
      if (delta !== undefined) {
        if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return protocolError();
        const deltaRecord = delta as Record<string, unknown>;
        deltaContent = deltaRecord['content'];

        const streamError = deltaRecord['x_stream_error'];
        if (streamError !== undefined && streamError !== null) {
          const streamErrorRecord =
            typeof streamError === 'object' && !Array.isArray(streamError)
              ? (streamError as Record<string, unknown>)
              : undefined;
          const message =
            typeof streamError === 'string'
              ? streamError
              : typeof streamErrorRecord?.['message'] === 'string'
                ? streamErrorRecord['message']
                : 'AGI Cloud request failed while streaming.';
          const code =
            typeof streamErrorRecord?.['code'] === 'string' ? streamErrorRecord['code'] : '';
          return {
            error: {
              type: 'error',
              message,
              code:
                code.includes('limit_reached') || code.includes('free_trial')
                  ? 'quota_exceeded'
                  : 'server_error',
            },
          };
        }

        const knownDeltaKeys = [
          'content',
          'role',
          'tool_calls',
          'reasoning_content',
          'x_generated_files',
          'x_tool_status',
          'x_tool_approval_request',
          'x_tool_result',
          'x_search_results',
          'x_code_result',
        ];
        recognized = knownDeltaKeys.some((key) => key in deltaRecord);
      }
      recognized =
        recognized ||
        'finish_reason' in choiceRecord ||
        'index' in choiceRecord ||
        'logprobs' in choiceRecord;
    }
  }

  if (deltaContent !== undefined && typeof deltaContent !== 'string') {
    return protocolError();
  }
  const directContent = event['content'];
  if (directContent !== undefined && typeof directContent !== 'string') {
    return protocolError();
  }
  if (directContent !== undefined) recognized = true;
  if (finishReason !== undefined && finishReason !== null && typeof finishReason !== 'string') {
    return protocolError();
  }
  if (finishReason === 'error') {
    return {
      error: {
        type: 'error',
        message: 'AGI Cloud reported a streaming failure without error details.',
        code: 'server_error',
      },
    };
  }
  const done = event['done'];
  if (done !== undefined && typeof done !== 'boolean') return protocolError();
  if (done !== undefined) recognized = true;
  if (event['usage'] !== undefined) recognized = true;
  if (!recognized) return protocolError();

  return {
    text:
      typeof deltaContent === 'string'
        ? deltaContent
        : typeof directContent === 'string'
          ? directContent
          : undefined,
    terminal: done === true || (typeof finishReason === 'string' && finishReason.length > 0),
    recognized: true,
  };
}

function bodyIndicatesFreeQuota(body: string): boolean {
  const normalized = body.toLowerCase();
  return (
    normalized.includes('limit_reached') ||
    normalized.includes('free_trial') ||
    normalized.includes('prompt_limit') ||
    normalized.includes('upgrade')
  );
}

async function readBoundedErrorBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    try {
      return (await response.text()).slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
    } catch {
      return '';
    }
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  try {
    while (body.length <= MANAGED_CHAT_MAX_ERROR_BODY_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return body.slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return body.slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
}

// ─── Core streaming call ──────────────────────────────────────────────────────

/**
 * Stream a free-trial chat completion from the AGI web gateway.
 *
 * Yields FreeTrialChunk items:
 *   { type: 'text', text }  — incremental content delta
 *   { type: 'done' }        — stream complete, prompt counted
 *   { type: 'error', ... }  — terminal error, prompt NOT counted
 *
 * The server is the authoritative quota/plan gate. The local counter is only a
 * display cache and must never prevent a paid account from reaching the route.
 */
export async function* streamFreeChat(
  messages: FreeTrialMessage[],
  token: string,
  optionsOrSignal?: ManagedChatStreamOptions | AbortSignal,
): AsyncGenerator<FreeTrialChunk> {
  const options = normalizeStreamOptions(optionsOrSignal);
  const model = (options.model ?? FREE_TRIAL_MODEL).trim();
  const tracksFreePromptCache =
    options.subscriptionTier === undefined ||
    ['free', 'hobby'].includes(options.subscriptionTier.trim().toLowerCase());
  if (!token.trim()) {
    yield { type: 'error', message: 'Sign in to use AGI Cloud chat.', code: 'auth_required' };
    return;
  }
  if (!model || messages.length === 0) {
    yield {
      type: 'error',
      message: 'The managed chat request is incomplete.',
      code: 'protocol_error',
    };
    return;
  }

  let cappedMessages: FreeTrialMessage[];
  try {
    cappedMessages = capRequestMessages(messages);
  } catch (error) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Invalid managed chat request.',
      code: 'protocol_error',
    };
    return;
  }

  const controller = new AbortController();
  let abortKind: 'cancelled' | 'timeout' | null = null;
  const abortFromCaller = (): void => {
    abortKind = 'cancelled';
    controller.abort();
  };
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? MANAGED_CHAT_DEFAULT_TIMEOUT_MS),
    120_000,
  );
  const timeoutHandle = setTimeout(() => {
    if (controller.signal.aborted) return;
    abortKind = 'timeout';
    controller.abort();
  }, timeoutMs);

  const abortError = (): Extract<FreeTrialChunk, { type: 'error' }> =>
    abortKind === 'timeout'
      ? { type: 'error', message: 'AGI Cloud response timed out.', code: 'timeout' }
      : { type: 'error', message: 'Cancelled.', code: 'cancelled' };

  try {
    if (controller.signal.aborted) {
      yield abortError();
      return;
    }

    let response: Response;
    try {
      response = await fetch(FREE_TRIAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          model,
          messages: cappedMessages,
          stream: true,
          max_tokens: 2000,
          ...(options.extendedThinking ? { thinking_mode: true } : {}),
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        yield abortError();
        return;
      }
      yield {
        type: 'error',
        message: 'Network error reaching AGI cloud. Check your connection.',
        code: 'server_error',
      };
      return;
    }

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      const body = await readBoundedErrorBody(response);
      const isQuotaExceeded = bodyIndicatesFreeQuota(body);

      if (isQuotaExceeded) {
        if (tracksFreePromptCache) await snapPromptCountToLimit();
        yield {
          type: 'error',
          message: 'Usage limit reached. Upgrade or wait for your limit to reset.',
          code: 'quota_exceeded',
        };
        return;
      }

      if (response.status === 401) {
        await clearAuthToken();
        yield {
          type: 'error',
          message: 'Sign in to use AGI Cloud chat.',
          code: 'auth_required',
        };
        return;
      }

      if (response.status === 429) {
        yield {
          type: 'error',
          message: 'AGI Cloud is receiving too many requests. Try again shortly.',
          code: 'rate_limited',
        };
        return;
      }

      yield {
        type: 'error',
        message: 'This AGI Cloud capability is not available for the current account.',
        code: 'plan_required',
      };
      return;
    }

    if (!response.ok) {
      yield {
        type: 'error',
        message: `AGI Cloud is temporarily unavailable (${response.status}).`,
        code: 'server_error',
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', message: 'No response body from gateway.', code: 'protocol_error' };
      return;
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    const sseDecoder = new BoundedSseDecoder(MANAGED_CHAT_MAX_SSE_FRAME_CHARS);
    let sawVisibleText = false;
    let streamedTextCharacters = 0;

    const handleEvents = async (
      dataEvents: readonly string[],
    ): Promise<{ chunks: FreeTrialChunk[]; terminal: boolean }> => {
      const chunks: FreeTrialChunk[] = [];
      for (const data of dataEvents) {
        const frame = parseSseData(data);
        if (frame.error) {
          if (frame.error.code === 'quota_exceeded' && tracksFreePromptCache) {
            await snapPromptCountToLimit();
          }
          chunks.push(frame.error);
          return { chunks, terminal: true };
        }
        if (frame.text) {
          streamedTextCharacters += frame.text.length;
          if (streamedTextCharacters > MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS) {
            chunks.push({
              type: 'error',
              message: 'AGI Cloud returned more output than this surface can safely render.',
              code: 'protocol_error',
            });
            return { chunks, terminal: true };
          }
          sawVisibleText = true;
          chunks.push({ type: 'text', text: frame.text });
        }
        if (frame.terminal) {
          if (!sawVisibleText) {
            chunks.push({
              type: 'error',
              message: 'AGI Cloud completed without a result this surface can render.',
              code: 'protocol_error',
            });
            return { chunks, terminal: true };
          }
          if (tracksFreePromptCache) await incrementPromptsUsed();
          chunks.push({ type: 'done' });
          return { chunks, terminal: true };
        }
      }
      return { chunks, terminal: false };
    };

    const decodeNetworkBytes = (value?: Uint8Array, stream = false): string => {
      try {
        return decoder.decode(value, { stream });
      } catch {
        throw new ManagedChatProtocolError('AGI Cloud returned invalid UTF-8.');
      }
    };

    const emitHandled = async function* (
      dataEvents: readonly string[],
    ): AsyncGenerator<FreeTrialChunk, boolean> {
      const handled = await handleEvents(dataEvents);
      for (const chunk of handled.chunks) yield chunk;
      return handled.terminal;
    };

    try {
      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel().catch(() => undefined);
          yield abortError();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;
        const events = sseDecoder.push(decodeNetworkBytes(value, true));
        const handled = await handleEvents(events);
        for (const chunk of handled.chunks) yield chunk;
        if (handled.terminal) return;
      }

      const finalText = decodeNetworkBytes();
      if (finalText) {
        const handled = await handleEvents(sseDecoder.push(finalText));
        for (const chunk of handled.chunks) yield chunk;
        if (handled.terminal) return;
      }

      const final = sseDecoder.finish();
      if (final.incomplete) {
        yield {
          type: 'error',
          message: 'AGI Cloud closed the stream in the middle of an event.',
          code: 'protocol_error',
        };
        return;
      }
      if (final.events.length > 0) {
        let terminal = false;
        for await (const chunk of emitHandled(final.events)) {
          yield chunk;
          terminal = chunk.type === 'done' || chunk.type === 'error';
        }
        if (terminal) return;
      }

      yield {
        type: 'error',
        message: 'AGI Cloud closed the stream before completion.',
        code: 'protocol_error',
      };
    } catch (error) {
      if (controller.signal.aborted) {
        reader.cancel().catch(() => {});
        yield abortError();
        return;
      }
      if (error instanceof SseFrameLimitError || error instanceof ManagedChatProtocolError) {
        yield {
          type: 'error',
          message: error.message,
          code: 'protocol_error',
        };
        return;
      }
      yield {
        type: 'error',
        message: 'The AGI Cloud response stream failed.',
        code: 'server_error',
      };
    } finally {
      reader.cancel().catch(() => {});
    }
  } finally {
    clearTimeout(timeoutHandle);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

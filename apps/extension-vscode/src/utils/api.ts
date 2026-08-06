/**
 * api.ts — HTTP client for the AGI Workforce LLM API
 *
 * Handles:
 * - Auth token storage via VS Code SecretStorage (never plaintext)
 * - OpenAI-compatible /chat/completions endpoint with SSE streaming
 * - Non-streaming fallback
 * - Proper error classification
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { randomUUID } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
// AUDIT-FIX: vscode-reorg
import { getModelMetrics } from '../features/model-picker/modelMetrics';
import {
  getModelProviderInfo,
  normalizeConfiguredModelId,
} from '../features/model-picker/modelConstants';
import { getTokenCounter } from '../data/tokenCounter';
import { TierInfoSchema } from '../protocol/apiResponses';
import { effectivePlanTier, type AccountAuthState } from '@agiworkforce/types';
import { MeResponseSchema } from '@agiworkforce/cloud-contracts/me';
import { Config } from '../platform/config';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Wire-format message sent to the AGI Workforce LLM API endpoint.
 * Follows the OpenAI chat completions shape (role + content).
 *
 * This is NOT the canonical `ChatMessage` from `@agiworkforce/types`, which
 * represents a persisted UI message with id, conversationId, timestamps, etc.
 */
export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: LlmChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  thinking?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: LlmChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AgiWorkforceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AgiWorkforceApiError';
  }
}

/**
 * Thrown when the API returns HTTP 429 with a structured paywall payload:
 * `{ kind: 'paywall', feature, requiredTier, reason }`.
 *
 * This is distinct from a generic rate-limit 429 — it indicates the user has
 * consumed 150% of their tier cap and must upgrade to continue.
 */
export class AgiWorkforcePaywallError extends Error {
  public readonly kind = 'paywall' as const;

  constructor(
    public readonly feature: string,
    public readonly requiredTier: string,
    public readonly reason: string,
  ) {
    super(`Upgrade to ${requiredTier} required for ${feature}: ${reason}`);
    this.name = 'AgiWorkforcePaywallError';
  }
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      retries <= 0 ||
      (err instanceof AgiWorkforceApiError && err.statusCode !== undefined && err.statusCode < 500)
    ) {
      throw err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECRET_KEY = 'agiWorkforce.apiKey';
/** Revocable AGI developer token obtained through browser-approved device sign-in. */
const ACCOUNT_TOKEN_KEY = 'agiWorkforce.accountToken';
const ACCOUNT_TOKEN_EXPIRES_AT_KEY = 'agiWorkforce.accountTokenExpiresAt';
const DEFAULT_ENDPOINT = 'https://agiworkforce.com/api/llm/v1';
const DEFAULT_GATEWAY_ORIGIN = 'https://api.agiworkforce.com';

// ─── Secret storage ───────────────────────────────────────────────────────────

/**
 * Retrieve the stored API key from VS Code SecretStorage.
 * Returns undefined if no key has been stored.
 */
export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

/**
 * Persist an API key into VS Code SecretStorage.
 * The key is encrypted at rest by VS Code / the OS keychain.
 */
export async function setApiKey(secrets: vscode.SecretStorage, apiKey: string): Promise<void> {
  await secrets.store(SECRET_KEY, apiKey);
}

/**
 * Remove the stored API key.
 */
export async function clearApiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

// ─── Account session token (AGI Cloud sign-in) ────────────────────────────────
//
// The optional cloud path authenticates with a first-party developer token
// obtained through the device sign-in flow (features/account-auth/deviceAuth.ts),
// stored in SecretStorage and sent as the Bearer for every cloud call.

export async function getAccountToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const state = await getAccountAuthState(secrets);
  if (state.status !== 'signed-in') return undefined;
  return secrets.get(ACCOUNT_TOKEN_KEY);
}

export async function setAccountToken(
  secrets: vscode.SecretStorage,
  token: string,
  expiresAt?: number,
): Promise<void> {
  await secrets.store(ACCOUNT_TOKEN_KEY, token);
  if (expiresAt !== undefined) {
    await secrets.store(ACCOUNT_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  }
}

export async function clearAccountToken(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(ACCOUNT_TOKEN_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
}

export async function getAccountAuthState(
  secrets: vscode.SecretStorage,
): Promise<AccountAuthState> {
  const token = await secrets.get(ACCOUNT_TOKEN_KEY);
  if (token === undefined || token === '') return { status: 'signed-out' };

  const rawExpiresAt = await secrets.get(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  if (rawExpiresAt === undefined || rawExpiresAt === '') {
    // Backward compatibility for account tokens stored by older extension
    // versions. The server remains authoritative; a 401 will clear it.
    return { status: 'signed-in' };
  }
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await clearAccountToken(secrets);
    return { status: 'expired' };
  }
  return { status: 'signed-in', expiresAt };
}

/**
 * Resolve the auth token for cloud calls: prefer the AGI Cloud account token;
 * fall back to an AGI-issued API key (an `sk-agi-…` first-party key, NOT a
 * third-party provider BYOK key) if stored. That key IS still settable via the
 * `agi-workforce.setApiKey` command (commandSetup.ts). NOTE: true provider BYOK
 * (your own Anthropic/OpenAI/… key) is handled by the `agi` app-server this
 * extension delegates local chat to — configure it with `agi login <provider>`.
 */
async function getAuthToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return (await getAccountToken(secrets)) ?? (await getApiKey(secrets));
}

// ─── Trusted-config helper (VSCODE-01 fix) ────────────────────────────────────
//
// Security: workspace settings are attacker-controlled in any cloned repo.
// For security-sensitive settings (endpoint URLs, paths) we MUST ignore the
// workspace layer and read only from the user's global config.
//
// VS Code's `inspect()` returns values split by scope:
//   { defaultValue, globalValue, workspaceValue, workspaceFolderValue }
// We use globalValue ?? defaultValue, skipping workspace overrides entirely.
//
// Belt-and-suspenders: even if isTrusted is true, we still validate URL shape
// to defend against a compromised global config or social-engineering.

/** Allowlist of hosts valid for the AGI Workforce API endpoint. */
const ENDPOINT_ALLOWED_HOSTS = new Set([
  'agiworkforce.com',
  'api.agiworkforce.com',
  'staging.agiworkforce.com',
]);

/**
 * Validate that a URL is safe to use as an API endpoint.
 * - Must be https: (or http://localhost/127.0.0.1 which is fine for local dev)
 * - Host must be in the allowlist OR be localhost/127.0.0.1
 * Returns the sanitised URL string (trailing slashes stripped) or undefined if invalid.
 */
export function validateEndpointUrl(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  const isHttps = parsed.protocol === 'https:';
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

  if (!isHttps && !isLocalhost) {
    return undefined;
  }

  if (!isLocalhost && !ENDPOINT_ALLOWED_HOSTS.has(parsed.hostname)) {
    return undefined;
  }

  return raw.replace(/\/+$/, '');
}

/**
 * Read a setting that must never be overridden by workspace settings.
 * Returns the global value (user settings) → fallback to default.
 * Workspace-scoped values are intentionally ignored.
 */
function getGlobalConfig<T>(section: string, key: string, defaultValue: T): T {
  const config = vscode.workspace.getConfiguration(section);
  const inspected = config.inspect<T>(key);
  // Use globalValue (user's own settings) only — ignore workspaceValue / workspaceFolderValue
  return inspected?.globalValue ?? inspected?.defaultValue ?? defaultValue;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

/**
 * Returns the cloud AI API endpoint. Used for all LLM calls (chat completions).
 * Never routes through the desktop bridge — the bridge is for non-AI operations only.
 *
 * SECURITY (VSCODE-01): reads from global config only. Workspace overrides are
 * silently ignored to prevent API-key exfiltration via a malicious .vscode/settings.json.
 * URL is additionally validated against the host allowlist.
 */
function getCloudApiEndpoint(): string {
  const raw = getGlobalConfig('agiWorkforce', 'apiEndpoint', DEFAULT_ENDPOINT);
  return validateEndpointUrl(raw) ?? DEFAULT_ENDPOINT;
}

/**
 * Web app origin (e.g. https://agiworkforce.com) derived from the cloud
 * endpoint. Used by account sign-in for the connect page + device poll.
 */
export function getCloudWebOrigin(): string {
  try {
    return new URL(getCloudApiEndpoint()).origin;
  } catch {
    return new URL(DEFAULT_ENDPOINT).origin;
  }
}

/** Trusted gateway origin used for provider streaming and token revocation. */
export function getCloudGatewayOrigin(): string {
  const raw = getGlobalConfig<string>('agiWorkforce', 'gatewayUrl', DEFAULT_GATEWAY_ORIGIN);
  const validated = validateEndpointUrl(raw) ?? DEFAULT_GATEWAY_ORIGIN;
  return new URL(validated).origin;
}

function getModel(): string {
  // SECURITY (audit 219): read global-only, like getCloudApiEndpoint, so a
  // malicious workspace .vscode/settings.json cannot silently override the
  // model id (and thus routing/cost/behaviour) for every LLM call.
  return normalizeConfiguredModelId(
    getGlobalConfig<string | undefined>('agiWorkforce', 'model', undefined),
  );
}

function isStreamingEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return config.get<boolean>('streamingEnabled') ?? true;
}

function isThinkingEnabled(): boolean {
  return vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('agent.thinking') ?? false;
}

/**
 * Map the user-selected effort level to model request parameters.
 * Effort controls reasoning depth via max_tokens and temperature.
 *
 *   low    → 2048 tokens,  temp 0.3  (fast, cheap)
 *   medium → 4096 tokens,  temp 0.2  (default balanced)
 *   high   → 8192 tokens,  temp 0.15 (deeper reasoning)
 *   max    → 16384 tokens, temp 0.1  (maximum budget)
 */
function getEffortParams(): { max_tokens: number; temperature: number } {
  const effort =
    vscode.workspace.getConfiguration('agiWorkforce').get<string>('agent.effort') ?? 'medium';
  switch (effort) {
    case 'low':
      return { max_tokens: 2048, temperature: 0.3 };
    case 'high':
      return { max_tokens: 8192, temperature: 0.15 };
    case 'max':
      return { max_tokens: 16384, temperature: 0.1 };
    case 'medium':
    default:
      return { max_tokens: 4096, temperature: 0.2 };
  }
}

function getFeatureFlags(): {
  mcpEnabled: boolean;
  desktopBridgeEnabled: boolean;
  desktopBridgePort: number;
} {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return {
    mcpEnabled: config.get<boolean>('mcp.enabled') ?? false,
    desktopBridgeEnabled: config.get<boolean>('desktopBridge.enabled') ?? false,
    desktopBridgePort: config.get<number>('desktopBridge.port') ?? 8787,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Low-level HTTPS POST that returns the full response body as a string.
 */
function httpsPost(
  urlString: string,
  headers: Record<string, string>,
  body: string,
  token: vscode.CancellationToken,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        cancelListener.dispose();
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      res.on('error', (err) => {
        cancelListener.dispose();
        reject(err);
      });
    });

    req.on('error', (err) => {
      cancelListener.dispose();
      reject(err);
    });

    // Handle cancellation — dispose the listener when request completes
    const cancelListener = token.onCancellationRequested(() => {
      cancelListener.dispose();
      req.destroy(new Error('Request cancelled'));
      reject(new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Low-level HTTPS POST for SSE streaming.
 * Calls `onChunk` for each parsed SSE data line, then resolves when the
 * stream ends. Rejects on network errors or non-2xx status codes.
 */
function httpsPostStream(
  urlString: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: ChatCompletionChunk) => void,
  token: vscode.CancellationToken,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'text/event-stream',
      },
    };

    const req = lib.request(options, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        const errorChunks: Buffer[] = [];
        res.on('data', (c: Buffer) => errorChunks.push(c));
        res.on('end', () => {
          cancelListener.dispose();
          const errBody = Buffer.concat(errorChunks).toString('utf8');
          // Detect structured paywall payload: 429 + { kind: 'paywall', ... }
          if (res.statusCode === 429) {
            try {
              const parsed = JSON.parse(errBody) as Record<string, unknown>;
              if (
                parsed['kind'] === 'paywall' &&
                typeof parsed['feature'] === 'string' &&
                typeof parsed['requiredTier'] === 'string' &&
                typeof parsed['reason'] === 'string'
              ) {
                reject(
                  new AgiWorkforcePaywallError(
                    parsed['feature'],
                    parsed['requiredTier'],
                    parsed['reason'],
                  ),
                );
                return;
              }
            } catch {
              // Not JSON — fall through to generic error
            }
          }
          reject(
            new AgiWorkforceApiError(
              `API error ${res.statusCode}: ${errBody}`,
              res.statusCode,
              'HTTP_ERROR',
            ),
          );
        });
        return;
      }

      let buffer = '';
      const MAX_SSE_BUFFER = 1_000_000; // 1 MB guard against malformed streams

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');

        if (buffer.length > MAX_SSE_BUFFER) {
          cancelListener.dispose();
          req.destroy();
          reject(
            new AgiWorkforceApiError('SSE buffer overflow (malformed stream)', 400, 'HTTP_ERROR'),
          );
          return;
        }

        // SSE lines are separated by '\n\n' for event boundaries
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) {
            continue;
          }
          const data = trimmed.slice('data:'.length).trim();
          if (data === '[DONE]') {
            continue;
          }
          try {
            const parsed = JSON.parse(data) as ChatCompletionChunk;
            onChunk(parsed);
          } catch {
            // Malformed SSE line — skip
          }
        }
      });

      res.on('end', () => {
        cancelListener.dispose();
        resolve();
      });
      res.on('error', (err) => {
        cancelListener.dispose();
        reject(err);
      });
    });

    req.on('error', (err) => {
      cancelListener.dispose();
      reject(err);
    });

    // Handle cancellation — dispose the listener when request completes
    const cancelListener = token.onCancellationRequested(() => {
      cancelListener.dispose();
      req.destroy(new Error('Request cancelled'));
      reject(new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED'));
    });

    req.write(body);
    req.end();
  });
}

// ─── Public API client ────────────────────────────────────────────────────────

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onToolUseStart?: (toolUseId: string, name: string) => void;
  onToolUseDelta?: (toolUseId: string, deltaJson: string) => void;
  onToolUseEnd?: (toolUseId: string) => void;
}

/**
 * Send a streaming chat completion request to the AGI Workforce API.
 * Calls `callbacks.onToken` for each streamed content token.
 */
export async function streamChatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  callbacks: StreamCallbacks,
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<void> {
  const apiKey = await getAuthToken(secrets);
  if (apiKey === undefined || apiKey === '') {
    throw new AgiWorkforceApiError(
      'Not signed in. Run "AGI: Sign in to AGI Cloud" to start chatting.',
      401,
      'NOT_SIGNED_IN',
    );
  }

  const endpoint = getCloudApiEndpoint();
  const model = overrideModel ?? getModel();
  const streaming = isStreamingEnabled();
  const features = getFeatureFlags();
  const thinking = isThinkingEnabled();
  const { max_tokens, temperature } = getEffortParams();

  // Resolve the effective agent mode for metadata (ask/auto/plan/bypass).
  const agentMode =
    vscode.workspace.getConfiguration('agiWorkforce').get<string>('agent.mode') ?? 'auto';

  const requestBody: ChatCompletionRequest = {
    model,
    messages,
    stream: streaming,
    temperature,
    max_tokens,
    ...(thinking ? { thinking: true } : {}),
    metadata: {
      mcp_enabled: features.mcpEnabled,
      desktop_bridge_enabled: features.desktopBridgeEnabled,
      desktop_bridge_port: features.desktopBridgePort,
      agent_mode: agentMode,
    },
  };

  const bodyStr = JSON.stringify(requestBody);

  /*
   * VSCODE-MANAGED-CHAT-IDEMPOTENCY-MISSING-01.
   *
   * Managed Cloud requires this header: `parseManagedUsageIdempotencyKey`
   * (apps/web/lib/services/managed-usage-request-service.ts:76-93) rejects a
   * missing header with 400 `idempotency_key_required`, so without it EVERY
   * cloud editor utility — Explain, Fix, Refactor, diagnostics, terminal,
   * inline completions — failed before reaching a model. The shape it accepts
   * is 8-128 chars of [A-Za-z0-9._:-]; this matches the Chrome surface's
   * `agi.chrome.chat.*` convention (freeTrialClient.ts:779).
   *
   * Generated ONCE here, deliberately OUTSIDE the `withRetry` closures below.
   * A key minted per attempt would make each retry a distinct request to the
   * server and defeat the idempotency it exists to provide — the reserve/settle
   * path would bill a retried turn twice.
   */
  const idempotencyKey = `agi.vscode.chat.${randomUUID()}`;

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'agi-workforce-vscode/0.1.0',
    'X-Client': 'vscode-extension',
    'X-AGI-Surface': 'vscode',
    'Idempotency-Key': idempotencyKey,
  };

  const requestStartTime = Date.now();

  if (streaming) {
    if (cancellationToken.isCancellationRequested) {
      throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
    }
    let responseChars = 0;
    await withRetry(() =>
      httpsPostStream(
        `${endpoint}/chat/completions`,
        authHeaders,
        bodyStr,
        (chunk) => {
          const delta = chunk.choices[0]?.delta;
          const content = delta?.content;
          if (content !== undefined && content !== '') {
            responseChars += content.length;
            callbacks.onToken(content);
          }
          // Forward tool-call streaming events when the caller subscribes
          if (callbacks.onToolUseStart ?? callbacks.onToolUseDelta ?? callbacks.onToolUseEnd) {
            const tc = (delta as Record<string, unknown> | undefined)?.['tool_calls'];
            if (Array.isArray(tc)) {
              for (const entry of tc as Array<Record<string, unknown>>) {
                const id =
                  typeof entry['id'] === 'string' ? entry['id'] : String(entry['index'] ?? '');
                const fn = entry['function'] as Record<string, unknown> | undefined;
                if (fn?.['name'] && typeof fn['name'] === 'string') {
                  callbacks.onToolUseStart?.(id, fn['name']);
                }
                if (fn?.['arguments'] && typeof fn['arguments'] === 'string') {
                  callbacks.onToolUseDelta?.(id, fn['arguments']);
                }
                if (entry['finish_reason'] === 'tool_calls') {
                  callbacks.onToolUseEnd?.(id);
                }
              }
            }
          }
        },
        cancellationToken,
      ),
    );
    // Only fire onDone and record metrics if the request wasn't cancelled
    if (!cancellationToken.isCancellationRequested) {
      callbacks.onDone();
      getModelMetrics().recordRequest(model, Date.now() - requestStartTime);
      getTokenCounter().addUsage(undefined, undefined, bodyStr.length, responseChars);
    }
  } else {
    // Non-streaming fallback
    const response = await httpsPost(
      `${endpoint}/chat/completions`,
      authHeaders,
      bodyStr,
      cancellationToken,
    );

    if (response.statusCode >= 400) {
      // Detect structured paywall payload: 429 + { kind: 'paywall', ... }
      if (response.statusCode === 429) {
        try {
          const parsed = JSON.parse(response.body) as Record<string, unknown>;
          if (
            parsed['kind'] === 'paywall' &&
            typeof parsed['feature'] === 'string' &&
            typeof parsed['requiredTier'] === 'string' &&
            typeof parsed['reason'] === 'string'
          ) {
            throw new AgiWorkforcePaywallError(
              parsed['feature'],
              parsed['requiredTier'],
              parsed['reason'],
            );
          }
        } catch (parseErr) {
          if (parseErr instanceof AgiWorkforcePaywallError) throw parseErr;
          // Not JSON — fall through to generic error
        }
      }
      throw new AgiWorkforceApiError(
        `API error ${response.statusCode}: ${response.body}`,
        response.statusCode,
        'HTTP_ERROR',
      );
    }

    const parsed = JSON.parse(response.body) as ChatCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content ?? '';
    callbacks.onToken(content);
    callbacks.onDone();
    getModelMetrics().recordRequest(
      model,
      Date.now() - requestStartTime,
      parsed.usage?.total_tokens,
    );
    getTokenCounter().addUsage(
      parsed.usage?.prompt_tokens,
      parsed.usage?.completion_tokens,
      bodyStr.length,
      content.length,
    );
  }
}

/**
 * Send a non-streaming chat completion and return the full response text.
 */
export async function chatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value: string): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const safeReject = (err: unknown): void => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const tokens: string[] = [];
    const streamCompletion = Config.useProviderStream()
      ? streamChatCompletionViaProvider
      : streamChatCompletion;
    streamCompletion(
      secrets,
      messages,
      {
        onToken: (t) => tokens.push(t),
        onDone: () => safeResolve(tokens.join('')),
        onError: safeReject,
      },
      cancellationToken,
      overrideModel,
    ).catch(safeReject);
  });
}

// ─── Tier info ────────────────────────────────────────────────────────────────

export interface TierInfo {
  /** Effective tier after subscription-status enforcement. */
  tier: string;
  /** Recorded plan when it differs from the effective tier. */
  accountPlanTier?: string;
  subscriptionStatus?: string;
  /** Plan usage this period as a 0-100 percentage (canonical /api/usage). */
  usagePercentage?: number;
  /** ISO reset timestamp for the current usage window, when returned. */
  resetsAt?: string;
}

export interface AccountIdentity {
  displayName: string;
  email: string | null;
  accountType: 'Personal account' | 'Organization account';
  planName: string;
  tier: string;
}

/** Validate and project the canonical `/api/me` response into editor-safe identity copy. */
export function parseAccountIdentityResponse(raw: unknown): AccountIdentity | undefined {
  const parsed = MeResponseSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const tier = parsed.data.plan.tier.trim().toLowerCase();
  const email = parsed.data.email?.trim() || null;
  const displayName =
    parsed.data.profile?.display_name?.trim() ||
    parsed.data.name.trim() ||
    email ||
    'AGI Cloud account';
  const planName =
    parsed.data.plan.display_name.trim() ||
    (tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : 'Unknown');

  return {
    displayName,
    email,
    accountType:
      tier === 'team' || tier === 'enterprise' ? 'Organization account' : 'Personal account',
    planName,
    tier,
  };
}

/** Validate and project the canonical `/api/usage` response into editor state. */
export function parseTierInfoResponse(raw: unknown): TierInfo | undefined {
  const parsed = TierInfoSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const effectiveTier = effectivePlanTier(parsed.data.plan_tier, parsed.data.subscription_status);
  const tierInfo: TierInfo = {
    tier: effectiveTier,
    subscriptionStatus: parsed.data.subscription_status,
  };
  if (effectiveTier !== parsed.data.plan_tier) {
    tierInfo.accountPlanTier = parsed.data.plan_tier;
  }
  if (typeof parsed.data.usage_percentage === 'number') {
    tierInfo.usagePercentage = parsed.data.usage_percentage;
  }
  if (typeof parsed.data.usage_reset_at === 'string') {
    tierInfo.resetsAt = parsed.data.usage_reset_at;
  }
  return tierInfo;
}

/**
 * Resolve the browser-approved AGI Cloud account behind this editor session.
 * This intentionally uses only the device-account token: an API key may fund a
 * utility request, but it is not proof of a signed-in account identity.
 */
export async function fetchAccountIdentity(
  secrets: vscode.SecretStorage,
): Promise<AccountIdentity | undefined> {
  const accountToken = await getAccountToken(secrets);
  if (accountToken === undefined || accountToken === '') return undefined;

  const parsed = new URL('/api/me?surface=vscode', getCloudWebOrigin());
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accountToken}`,
        'User-Agent': 'agi-workforce-vscode/0.1.0',
        'X-Client': 'vscode-extension',
        'X-AGI-Surface': 'vscode',
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          if (res.statusCode === 401) void clearAccountToken(secrets);
          resolve(undefined);
          return;
        }
        try {
          resolve(parseAccountIdentityResponse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        } catch {
          resolve(undefined);
        }
      });
      res.on('error', () => resolve(undefined));
    });

    req.on('error', () => resolve(undefined));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve(undefined);
    });
    req.end();
  });
}

/**
 * Fetch the current user's tier and usage from the canonical percentage-only
 * GET /api/usage (ManagedUsageSummaryResponse). Never exposes exact token or
 * cent counts. Returns undefined if the request fails (e.g. no key, network
 * error) — callers should treat undefined as "unknown tier".
 */
export async function fetchTierInfo(secrets: vscode.SecretStorage): Promise<TierInfo | undefined> {
  const apiKey = await getAuthToken(secrets);
  if (apiKey === undefined || apiKey === '') {
    return undefined;
  }

  const endpoint = getCloudApiEndpoint();
  // Strip the /api/llm/v1 suffix to get the root origin, then append /api/usage
  const rootOrigin = endpoint.replace(/\/api\/llm\/v1$/, '').replace(/\/api\/llm$/, '');
  const url = `${rootOrigin}/api/usage`;

  return new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'agi-workforce-vscode/0.1.0',
        'X-Client': 'vscode-extension',
        'X-AGI-Surface': 'vscode',
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          resolve(undefined);
          return;
        }
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const raw = JSON.parse(body);
          // Runtime-validate the percentage usage response. A malformed upstream
          // response resolves to undefined rather than silently overwriting
          // global tier state with garbage.
          const tierInfo = parseTierInfoResponse(raw);
          if (tierInfo === undefined) {
            resolve(undefined);
            return;
          }
          resolve(tierInfo);
        } catch {
          resolve(undefined);
        }
      });
      res.on('error', () => resolve(undefined));
    });

    req.on('error', () => resolve(undefined));
    req.end();
  });
}

// ─── Provider-stream path ─────────────────────────────────────────────────────
//
// AGI Cloud account sign-in IS wired (features/account-auth/deviceAuth.ts,
// command agi-workforce.signIn, token stored via setAccountToken/getAccountToken)
// and the SSE client for /api/v1/providers/:id/stream IS implemented
// (integrations/providerStreamClient.ts) — this function's job is just to
// glue those two already-working pieces together.

const PROVIDER_STREAM_SUPPORTED = new Set(['anthropic', 'openai', 'ollama', 'google']);

function getGatewayUrl(): string {
  return getCloudGatewayOrigin();
}

/**
 * Stream a chat completion through the /api/v1/providers/:id/stream gateway,
 * authenticated with the AGI Cloud account token from `signInToAgiCloud`.
 * Same `StreamCallbacks` shape as `streamChatCompletion`, so chat participant
 * call sites can branch on the `agiWorkforce.useProviderStream` feature flag
 * without restructuring.
 */
export async function streamChatCompletionViaProvider(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  callbacks: StreamCallbacks,
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<void> {
  const accountToken = await getAccountToken(secrets);
  if (accountToken === undefined || accountToken === '') {
    throw new AgiWorkforceApiError(
      'Sign in to AGI Cloud to use provider-stream routing (agi-workforce.signIn), or disable agiWorkforce.useProviderStream to use the default AGI Workforce proxy instead.',
      401,
      'AGI_ACCOUNT_TOKEN_MISSING',
    );
  }

  const model = overrideModel ?? getModel();
  const { providerId } = getModelProviderInfo(model);
  if (providerId === null || !PROVIDER_STREAM_SUPPORTED.has(providerId)) {
    throw new AgiWorkforceApiError(
      `The provider-stream gateway does not yet support '${providerId ?? 'unknown'}' models. Disable agiWorkforce.useProviderStream to route this model through the default AGI Workforce proxy instead.`,
      400,
      'AGI_PROVIDER_STREAM_UNSUPPORTED_PROVIDER',
    );
  }

  const { streamFromProvider } = await import('../integrations/providerStreamClient');
  const abortController = new AbortController();
  const cancelListener = cancellationToken.onCancellationRequested(() => abortController.abort());

  try {
    if (cancellationToken.isCancellationRequested) {
      throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
    }
    for await (const chunk of streamFromProvider({
      gatewayUrl: getGatewayUrl(),
      providerId: providerId as 'anthropic' | 'openai' | 'ollama' | 'google',
      authToken: accountToken,
      request: { model, messages },
      signal: abortController.signal,
    })) {
      if (cancellationToken.isCancellationRequested) {
        throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
      }
      switch (chunk.type) {
        case 'text-delta':
          callbacks.onToken(chunk.delta);
          break;
        case 'tool-use-start':
          callbacks.onToolUseStart?.(chunk.toolUseId, chunk.name);
          break;
        case 'tool-use-delta':
          callbacks.onToolUseDelta?.(chunk.toolUseId, chunk.deltaJson);
          break;
        case 'tool-use-end':
          callbacks.onToolUseEnd?.(chunk.toolUseId);
          break;
        case 'thinking-delta':
        case 'usage':
          // No StreamCallbacks hook for extended-thinking text or usage
          // accounting yet — ignored rather than mis-routed as a token.
          break;
        case 'error':
          callbacks.onError(new AgiWorkforceApiError(chunk.message, chunk.retryable ? 503 : 500));
          return;
        case 'stop':
          break;
      }
    }
    if (cancellationToken.isCancellationRequested) {
      throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
    }
    callbacks.onDone();
  } catch (error) {
    if (cancellationToken.isCancellationRequested) {
      throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
    }
    throw error;
  } finally {
    cancelListener.dispose();
  }
}

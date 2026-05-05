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
import * as https from 'https';
import { URL } from 'url';
import { getModelMetrics } from '../services/modelMetrics';
import { normalizeConfiguredModelId } from '../services/modelConstants';
import { getTokenCounter } from '../services/tokenCounter';

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
const SUPABASE_JWT_SECRET_KEY = 'agiWorkforce.supabaseJwt';
const DEFAULT_ENDPOINT = 'https://agiworkforce.com/api/llm/v1';
const DEFAULT_GATEWAY_URL = 'https://api.agiworkforce.com';

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

/**
 * Retrieve the stored Supabase JWT used by the new provider-stream path
 * (`/api/v1/providers/:id/stream`). Distinct from the legacy `apiKey` so
 * users can run both paths in parallel during rollout.
 */
export async function getSupabaseJwt(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SUPABASE_JWT_SECRET_KEY);
}

export async function setSupabaseJwt(secrets: vscode.SecretStorage, jwt: string): Promise<void> {
  await secrets.store(SUPABASE_JWT_SECRET_KEY, jwt);
}

export async function clearSupabaseJwt(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SUPABASE_JWT_SECRET_KEY);
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

function getModel(): string {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return normalizeConfiguredModelId(config.get<string>('model'));
}

function isStreamingEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return config.get<boolean>('streamingEnabled') ?? true;
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
  const apiKey = await getApiKey(secrets);
  if (apiKey === undefined || apiKey === '') {
    throw new AgiWorkforceApiError(
      'No AGI Workforce API key configured. Run "AGI Workforce: Set API Key".',
      401,
      'NO_API_KEY',
    );
  }

  const endpoint = getCloudApiEndpoint();
  const model = overrideModel ?? getModel();
  const streaming = isStreamingEnabled();
  const features = getFeatureFlags();

  const requestBody: ChatCompletionRequest = {
    model,
    messages,
    stream: streaming,
    temperature: 0.2,
    max_tokens: 4096,
    metadata: {
      mcp_enabled: features.mcpEnabled,
      desktop_bridge_enabled: features.desktopBridgeEnabled,
      desktop_bridge_port: features.desktopBridgePort,
    },
  };

  const bodyStr = JSON.stringify(requestBody);
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'agi-workforce-vscode/0.1.0',
    'X-Client': 'vscode-extension',
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
          const content = chunk.choices[0]?.delta?.content;
          if (content !== undefined && content !== '') {
            responseChars += content.length;
            callbacks.onToken(content);
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
    streamChatCompletion(
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

// ─── Provider-stream path (Wave 3 follow-up) ──────────────────────────────────
//
// Opt-in alternative to streamChatCompletion that calls the new
// /api/v1/providers/:id/stream route on the AGI Workforce gateway. Activated
// via the `agiWorkforce.useProviderStream: true` setting. Requires a
// Supabase JWT in SecretStorage (set via "AGI Workforce: Set Supabase JWT").

import { streamFromProvider } from '../services/providerStreamClient';

type ProviderStreamId = 'anthropic' | 'openai' | 'google' | 'ollama';

/**
 * Map a model id to its provider stream id. Best-effort by prefix; falls
 * through to Ollama (the catch-all for local / any-string-model). Caller
 * can override by setting `agiWorkforce.providerStreamProvider` if the
 * heuristic doesn't fit.
 */
function inferProviderFromModel(model: string): ProviderStreamId {
  const id = model.toLowerCase();
  if (id.startsWith('claude') || id.startsWith('anthropic/')) return 'anthropic';
  if (
    id.startsWith('gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    id.startsWith('codex') ||
    id.startsWith('openai/')
  ) {
    return 'openai';
  }
  if (id.startsWith('gemini') || id.startsWith('palm') || id.startsWith('google/')) {
    return 'google';
  }
  return 'ollama';
}

function getGatewayUrl(): string {
  // SECURITY (VSCODE-01): read from global config only — same as getCloudApiEndpoint().
  const raw = getGlobalConfig('agiWorkforce', 'gatewayUrl', DEFAULT_GATEWAY_URL);
  return validateEndpointUrl(raw) ?? DEFAULT_GATEWAY_URL;
}

function getProviderOverride(): ProviderStreamId | undefined {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const raw = config.get<string>('providerStreamProvider');
  if (raw === 'anthropic' || raw === 'openai' || raw === 'google' || raw === 'ollama') {
    return raw;
  }
  return undefined;
}

/**
 * Stream a chat completion through the new ProviderAdapter pipeline. Same
 * `StreamCallbacks` shape as `streamChatCompletion`, so chat participant
 * call sites can branch on a feature flag without restructuring.
 */
export async function streamChatCompletionViaProvider(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  callbacks: StreamCallbacks,
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<void> {
  const jwt = await getSupabaseJwt(secrets);
  if (jwt === undefined || jwt === '') {
    throw new AgiWorkforceApiError(
      'No Supabase JWT configured for provider-stream path. Run "AGI Workforce: Set Supabase JWT", or unset agiWorkforce.useProviderStream to use the legacy API key path.',
      401,
      'NO_SUPABASE_JWT',
    );
  }

  const model = overrideModel ?? getModel();
  const providerId = getProviderOverride() ?? inferProviderFromModel(model);
  const gatewayUrl = getGatewayUrl();

  const ctrl = new AbortController();
  const cancelSub = cancellationToken.onCancellationRequested(() => ctrl.abort());

  try {
    for await (const chunk of streamFromProvider({
      gatewayUrl,
      providerId,
      authToken: jwt,
      request: {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
      signal: ctrl.signal,
    })) {
      switch (chunk.type) {
        case 'text-delta':
          callbacks.onToken(chunk.delta);
          break;
        case 'error':
          callbacks.onError(
            new AgiWorkforceApiError(chunk.message, 500, chunk.code ?? 'STREAM_ERROR'),
          );
          return;
        case 'stop':
          if (chunk.reason === 'error') {
            callbacks.onError(
              new AgiWorkforceApiError('Stream ended with error stop', 500, 'STREAM_STOP_ERROR'),
            );
            return;
          }
          callbacks.onDone();
          return;
        // text-delta / thinking-delta / tool-use-* / usage are ignored in
        // the chat-participant integration for now (they don't have a slot
        // in the StreamCallbacks shape). Future: enrich callbacks to
        // surface usage + thinking inline.
        default:
          break;
      }
    }
    // Stream ended without an explicit stop — treat as done.
    callbacks.onDone();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    cancelSub.dispose();
  }
}

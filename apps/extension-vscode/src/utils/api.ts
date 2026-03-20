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
import { getTokenCounter } from '../services/tokenCounter';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
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
    message: ChatMessage;
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
const DEFAULT_ENDPOINT = 'https://agiworkforce.com/api/llm/v1';

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

// ─── Config helpers ───────────────────────────────────────────────────────────

/**
 * Returns the cloud AI API endpoint. Used for all LLM calls (chat completions).
 * Never routes through the desktop bridge — the bridge is for non-AI operations only.
 */
function getCloudApiEndpoint(): string {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return (config.get<string>('apiEndpoint') ?? DEFAULT_ENDPOINT).replace(/\/+$/, '');
}

/**
 * Returns the desktop bridge base URL for bridge-specific (non-AI) operations.
 * Returns undefined if the bridge is not enabled.
 */
function _getBridgeEndpoint(): string | undefined {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const enabled = config.get<boolean>('desktopBridge.enabled') ?? false;
  if (!enabled) return undefined;
  const port = config.get<number>('desktopBridge.port') ?? 8787;
  return `http://127.0.0.1:${port}`;
}

function getModel(): string {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return config.get<string>('model') ?? 'auto-balanced';
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
 * Low-level HTTPS/HTTP GET that returns the full response body as a string.
 */
function httpsGet(
  urlString: string,
  headers: Record<string, string>,
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
      method: 'GET',
      headers,
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

    const cancelListener = token.onCancellationRequested(() => {
      cancelListener.dispose();
      req.destroy(new Error('Request cancelled'));
      reject(new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED'));
    });

    req.end();
  });
}

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

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
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
  messages: ChatMessage[],
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
    callbacks.onDone();
    getModelMetrics().recordRequest(model, Date.now() - requestStartTime);
    getTokenCounter().addUsage(undefined, undefined, bodyStr.length, responseChars);
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
  messages: ChatMessage[],
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokens: string[] = [];
    streamChatCompletion(
      secrets,
      messages,
      {
        onToken: (t) => tokens.push(t),
        onDone: () => resolve(tokens.join('')),
        onError: reject,
      },
      cancellationToken,
      overrideModel,
    ).catch(reject);
  });
}

/**
 * Quick connectivity check — returns true if the API is reachable and the
 * API key is valid. Returns false on any error.
 * Always uses the cloud API endpoint (not the bridge) for the health check.
 */
async function _pingApi(secrets: vscode.SecretStorage): Promise<boolean> {
  try {
    const apiKey = await getApiKey(secrets);
    if (apiKey === undefined || apiKey === '') {
      return false;
    }
    // Always ping the cloud API endpoint, not the bridge
    const endpoint = getCloudApiEndpoint();
    const cancelSource = new vscode.CancellationTokenSource();
    const result = await httpsGet(
      `${endpoint}/models`,
      {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'agi-workforce-vscode/0.1.0',
      },
      cancelSource.token,
    );
    cancelSource.dispose();
    return result.statusCode < 400;
  } catch {
    return false;
  }
}

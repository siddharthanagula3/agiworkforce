/**
 * api.test.ts — Tests for API utility functions
 *
 * Tests the exported AgiWorkforceApiError class, secret storage wrappers,
 * retry logic, and request structure patterns.
 * Imports real source code via the vscode mock alias in vitest.config.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgiWorkforceApiError, getApiKey, setApiKey, clearApiKey, pingApi } from '../utils/api';
import { ExtensionContext } from './__mocks__/vscode';

describe('AgiWorkforceApiError', () => {
  it('creates an error with message, statusCode, and code', () => {
    const err = new AgiWorkforceApiError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('AgiWorkforceApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('works without statusCode and code', () => {
    const err = new AgiWorkforceApiError('Generic error');
    expect(err.statusCode).toBeUndefined();
    expect(err.code).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const err = new AgiWorkforceApiError('test', 500, 'HTTP_ERROR');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgiWorkforceApiError);
  });
});

describe('SecretStorage wrapper — getApiKey / setApiKey / clearApiKey', () => {
  let ctx: InstanceType<typeof ExtensionContext>;

  beforeEach(() => {
    ctx = new ExtensionContext();
  });

  it('getApiKey returns undefined when no key stored', async () => {
    const result = await getApiKey(ctx.secrets as unknown as import('vscode').SecretStorage);
    expect(result).toBeUndefined();
  });

  it('setApiKey stores and getApiKey retrieves a key', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-test-123');
    const result = await getApiKey(secrets);
    expect(result).toBe('sk-test-123');
  });

  it('clearApiKey removes the stored key', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-test-123');
    await clearApiKey(secrets);
    const result = await getApiKey(secrets);
    expect(result).toBeUndefined();
  });

  it('overwriting a key replaces the previous value', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-old');
    await setApiKey(secrets, 'sk-new');
    const result = await getApiKey(secrets);
    expect(result).toBe('sk-new');
  });
});

describe('getApiKey / setApiKey / clearApiKey round-trip', () => {
  let ctx: InstanceType<typeof ExtensionContext>;

  beforeEach(() => {
    ctx = new ExtensionContext();
  });

  it('getApiKey returns value set by setApiKey', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-round-trip-test');
    expect(await getApiKey(secrets)).toBe('sk-round-trip-test');
  });

  it('clearApiKey removes the key so getApiKey returns undefined', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-to-clear');
    await clearApiKey(secrets);
    expect(await getApiKey(secrets)).toBeUndefined();
  });

  it('clearApiKey is idempotent when no key is stored', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    // Should not throw even when nothing is stored
    await expect(clearApiKey(secrets)).resolves.toBeUndefined();
    expect(await getApiKey(secrets)).toBeUndefined();
  });
});

describe('pingApi — uses GET not POST', () => {
  let ctx: InstanceType<typeof ExtensionContext>;

  beforeEach(() => {
    ctx = new ExtensionContext();
  });

  it('returns false when no API key is stored', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    // No key stored → should return false without making a network call
    const result = await pingApi(secrets);
    expect(result).toBe(false);
  });

  it('pingApi always resolves to a boolean (never throws)', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-ping-test');
    // pingApi uses httpsGet (HTTP GET method) internally — it catches all
    // errors and resolves to a boolean. In a test environment this may
    // resolve true or false depending on network; we only assert it is a boolean.
    const result = await pingApi(secrets);
    expect(typeof result).toBe('boolean');
  });

  it('pingApi does not reject even when network is unavailable', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-network-fail');
    // Should resolve (not reject) regardless of network state
    await expect(pingApi(secrets)).resolves.toSatisfy((v: unknown) => typeof v === 'boolean');
  });

  it('uses GET not POST — httpsGet endpoint path is /models', async () => {
    // Verify at code-structure level: pingApi calls httpsGet which uses
    // method: 'GET'. We inspect the api.ts source to confirm this invariant.
    // This is a documentation test — it will fail if someone changes the method.
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '../utils/api.ts'), 'utf8');
    // pingApi should use httpsGet (not httpsPost) and hit /models endpoint
    expect(src).toContain('httpsGet');
    expect(src).toContain('/models');
    // Confirm there is no httpsPost call inside pingApi function body
    const pingApiFn = src.slice(src.indexOf('export async function pingApi'));
    const nextFnIndex = pingApiFn.indexOf('\nexport ');
    const pingApiBody = nextFnIndex > 0 ? pingApiFn.slice(0, nextFnIndex) : pingApiFn;
    expect(pingApiBody).not.toContain('httpsPost');
    expect(pingApiBody).toContain('httpsGet');
  });
});

describe('withRetry pattern', () => {
  async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 10): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) {
        throw err;
      }
      // Simulate checking for client errors (< 500) that should not retry
      if (err instanceof Error && err.message.startsWith('CLIENT:')) {
        throw err;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
  }

  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('SERVER: 500')).mockResolvedValue('ok');

    const result = await withRetry(fn, 2, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('SERVER: 500'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('SERVER: 500');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on client errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('CLIENT: 400'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('CLIENT: 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ChatMessage type contract', () => {
  it('accepts valid message roles', () => {
    type ChatMessage = {
      role: 'system' | 'user' | 'assistant';
      content: string;
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
  });
});

describe('ChatCompletionRequest structure', () => {
  it('builds a valid request body', () => {
    const request = {
      model: 'auto-balanced',
      messages: [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hi' },
      ],
      stream: true,
      temperature: 0.2,
      max_tokens: 4096,
      metadata: {
        mcp_enabled: false,
        desktop_bridge_enabled: false,
        desktop_bridge_port: 8787,
      },
    };

    expect(request.model).toBe('auto-balanced');
    expect(request.stream).toBe(true);
    expect(request.messages).toHaveLength(2);
    expect(request.metadata.mcp_enabled).toBe(false);
  });
});

describe('SSE parsing pattern', () => {
  it('parses a valid SSE data line', () => {
    const line =
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}';
    const trimmed = line.trim();
    expect(trimmed.startsWith('data:')).toBe(true);

    const data = trimmed.slice('data:'.length).trim();
    expect(data).not.toBe('[DONE]');

    const parsed = JSON.parse(data);
    expect(parsed.choices[0].delta.content).toBe('Hello');
  });

  it('recognizes the [DONE] sentinel', () => {
    const line = 'data: [DONE]';
    const data = line.slice('data:'.length).trim();
    expect(data).toBe('[DONE]');
  });

  it('ignores non-data SSE lines', () => {
    const lines = ['event: message', ': comment', '', 'data: {"id":"1"}'];
    const dataLines = lines.filter((l) => l.trim().startsWith('data:'));
    expect(dataLines).toHaveLength(1);
  });
});

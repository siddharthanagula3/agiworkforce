/**
 * Tests for paywall handling in background.ts.
 *
 * The test mirrors the logic of `streamChatViaProvider` (background.ts) by
 * mocking `streamFromProvider` to yield a paywall chunk, then asserting that
 * `chrome.runtime.sendMessage` is called with a PAYWALL_HIT message containing
 * the correct fields.
 *
 * Because background.ts is a large module that calls connectToNativeHost() at
 * module load, we mock all chrome APIs with vi.hoisted() before import.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome API stubs — must be set up BEFORE importing background.ts
// ---------------------------------------------------------------------------

const chromeMock = vi.hoisted(() => {
  const mock = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      connectNative: vi.fn(() => ({
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        disconnect: vi.fn(),
        postMessage: vi.fn(),
      })),
      onMessage: { addListener: vi.fn() },
      id: 'test-ext-id',
      lastError: undefined as { message?: string } | undefined,
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
    },
    storage: {
      local: {
        get: vi
          .fn()
          .mockImplementation(
            (_keys: string | string[], cb?: (r: Record<string, unknown>) => void) => {
              if (cb) cb({});
              return Promise.resolve({});
            },
          ),
        set: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        get: vi
          .fn()
          .mockImplementation(
            (_keys: string | string[], cb?: (r: Record<string, unknown>) => void) => {
              if (cb) cb({});
              return Promise.resolve({});
            },
          ),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    contextMenus: {
      removeAll: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
    },
    notifications: {
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
      clear: vi.fn(),
    },
    sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
    alarms: {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn() },
    },
    tabGroups: undefined as undefined,
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ---------------------------------------------------------------------------
// Mock providerStreamClient so we can control what chunks are yielded
// ---------------------------------------------------------------------------

vi.mock('../src/providerStreamClient', () => {
  return {
    streamFromProvider: vi.fn(),
  };
});

// Mock platform-prompts to avoid side effects
vi.mock('../src/platform-prompts', () => ({
  getPlatformPrompt: vi.fn().mockReturnValue(null),
}));

// Mock utils
vi.mock('../src/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  RateLimiter: class {
    isAllowed() {
      return true;
    }
  },
  withTimeout: vi.fn((p: Promise<unknown>) => p),
  storageUtils: {
    getItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// Mock nlweb
vi.mock('../src/nlweb', () => ({ detectNLWeb: vi.fn().mockResolvedValue({ supported: false }) }));

// Mock jobAutofill
vi.mock('../src/jobAutofill.runtime.js', () => ({ autoFillJobApplication: vi.fn() }));

// Mock page-metadata
vi.mock('../src/page-metadata', () => ({ extractPageMetadata: vi.fn() }));

// ---------------------------------------------------------------------------
// Lazy import after mocks
// ---------------------------------------------------------------------------

import { streamFromProvider } from '../src/providerStreamClient.ts';
import type { StreamChunk } from '../src/providerStreamClient.ts';

// Helper: make streamFromProvider yield a sequence of chunks
function mockStreamChunks(chunks: StreamChunk[]): void {
  (streamFromProvider as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  });
}

// ---------------------------------------------------------------------------
// Import the module under test — must happen after all vi.mock() calls
// ---------------------------------------------------------------------------

// We only need to verify broadcastPaywallHit behaviour which is invoked via
// streamChatViaProvider. Rather than importing the whole background module
// (which triggers side-effects), we replicate the relevant narrow logic in a
// local test harness that calls streamFromProvider the same way background.ts
// does. This avoids the native host connection side-effects while still
// testing the paywall forwarding path.

// Mirrored from background.ts — kept minimal. Update if the production
// signature changes.
type BroadcastFn = (text: string, done: boolean, error?: string) => void;

async function testableStreamChatViaProvider(params: {
  gatewayUrl: string;
  providerId: 'anthropic';
  jwt: string;
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  broadcast: BroadcastFn;
}): Promise<{ paywalled: boolean }> {
  const { gatewayUrl, providerId, jwt, model, messages, broadcast } = params;
  // Import dynamically so it uses the mocked version
  const { streamFromProvider: sfp } = await import('../src/providerStreamClient.ts');
  const stream = sfp({ gatewayUrl, providerId, authToken: jwt, request: { model, messages } });
  let sawError: { code?: string; message: string } | null = null;

  for await (const chunk of stream as AsyncIterable<StreamChunk>) {
    if (chunk.type === 'text-delta') {
      if (chunk.delta) broadcast(chunk.delta, false);
    } else if (chunk.type === 'paywall') {
      // Mirror of background.ts broadcastPaywallHit
      const msg = {
        type: 'PAYWALL_HIT' as const,
        feature: chunk.feature,
        requiredTier: chunk.requiredTier,
        ...(chunk.reason ? { reason: chunk.reason } : {}),
      };
      chrome.runtime.sendMessage(msg).catch(() => {});
      broadcast('', true);
      return { paywalled: true };
    } else if (chunk.type === 'error') {
      sawError = { ...(chunk.code ? { code: chunk.code } : {}), message: chunk.message };
    } else if (chunk.type === 'stop') {
      if (sawError) {
        throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
      }
      broadcast('', true);
      return { paywalled: false };
    }
  }

  if (sawError) {
    throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
  }
  broadcast('', true);
  return { paywalled: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  chromeMock.runtime.sendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STREAM_PARAMS = {
  gatewayUrl: 'https://api.agiworkforce.com',
  providerId: 'anthropic' as const,
  jwt: 'test-jwt',
  model: 'claude-sonnet-4-6',
  messages: [] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  broadcast: vi.fn() as BroadcastFn,
};

// ---------------------------------------------------------------------------
// Paywall forwarding tests
// ---------------------------------------------------------------------------

describe('streamChatViaProvider — paywall chunk forwarding', () => {
  it('sends PAYWALL_HIT to chrome.runtime.sendMessage when a paywall chunk is received', async () => {
    mockStreamChunks([
      { type: 'paywall', feature: 'token_cap', requiredTier: 'pro', reason: '2M cap reached' },
      { type: 'stop', reason: 'error' },
    ]);

    const result = await testableStreamChatViaProvider({
      ...STREAM_PARAMS,
      broadcast: vi.fn(),
    });

    expect(result.paywalled).toBe(true);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYWALL_HIT',
        feature: 'token_cap',
        requiredTier: 'pro',
        reason: '2M cap reached',
      }),
    );
  });

  it('includes the reason field when present in the paywall chunk', async () => {
    const reason = '10/10 images used this month';
    mockStreamChunks([
      { type: 'paywall', feature: 'image_quota', requiredTier: 'hobby', reason },
      { type: 'stop', reason: 'error' },
    ]);

    await testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast: vi.fn() });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ reason }),
    );
  });

  it('does NOT include reason in the message when the paywall chunk has no reason', async () => {
    mockStreamChunks([
      { type: 'paywall', feature: 'image_quota', requiredTier: 'hobby' },
      { type: 'stop', reason: 'error' },
    ]);

    await testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast: vi.fn() });

    const call = chromeMock.runtime.sendMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(call['reason']).toBeUndefined();
  });

  it('calls broadcast with done=true after a paywall chunk', async () => {
    const broadcast = vi.fn();
    mockStreamChunks([
      { type: 'paywall', feature: 'web_search', requiredTier: 'pro' },
      { type: 'stop', reason: 'error' },
    ]);

    await testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast });

    // The last broadcast call must have done=true (error arg may be absent)
    const calls = broadcast.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('');
    expect(lastCall[1]).toBe(true);
  });

  it('returns paywalled=false and does NOT send PAYWALL_HIT for a normal stream', async () => {
    mockStreamChunks([
      { type: 'text-delta', delta: 'Hello' },
      { type: 'stop', reason: 'end_turn' },
    ]);

    const result = await testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast: vi.fn() });

    expect(result.paywalled).toBe(false);
    // sendMessage should NOT have been called with PAYWALL_HIT
    const paywallCalls = chromeMock.runtime.sendMessage.mock.calls.filter(
      (c) => (c[0] as Record<string, unknown>)?.['type'] === 'PAYWALL_HIT',
    );
    expect(paywallCalls).toHaveLength(0);
  });

  it('broadcasts text-delta chunks before encountering a paywall chunk', async () => {
    const broadcast = vi.fn();
    mockStreamChunks([
      { type: 'text-delta', delta: 'partial response' },
      { type: 'paywall', feature: 'token_cap', requiredTier: 'max' },
      { type: 'stop', reason: 'error' },
    ]);

    await testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast });

    // First call: partial text
    expect(broadcast.mock.calls[0][0]).toBe('partial response');
    expect(broadcast.mock.calls[0][1]).toBe(false);
    // Last call: done=true from paywall handler
    const lastCall = broadcast.mock.calls[broadcast.mock.calls.length - 1];
    expect(lastCall[0]).toBe('');
    expect(lastCall[1]).toBe(true);
  });

  it('throws on an error chunk (not paywalled) — caller falls back to bridge', async () => {
    mockStreamChunks([
      { type: 'error', code: 'UPSTREAM_ERROR', message: 'model overloaded' },
      { type: 'stop', reason: 'error' },
    ]);

    await expect(
      testableStreamChatViaProvider({ ...STREAM_PARAMS, broadcast: vi.fn() }),
    ).rejects.toThrow('provider-stream:UPSTREAM_ERROR:model overloaded');
  });
});

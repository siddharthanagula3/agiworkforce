/**
 * computer-use-agent-loop.test.ts
 *
 * Proves one round-trip through the agent loop:
 *   1. Loop calls the AGI Cloud gateway with tool definitions.
 *   2. Gateway returns a tool_call (read_dom).
 *   3. Loop dispatches the CDP action via cdpDriver.
 *   4. Loop feeds the tool result back to the gateway.
 *   5. Gateway returns a final text response.
 *   6. Loop exits with the final message.
 *
 * Mocks:
 *   - chrome.debugger  → hoisted shim (attach/sendCommand/detach)
 *   - chrome.storage   → minimal local/session shim
 *   - global fetch     → mocked SSE responses (two calls: tool_call then final)
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome API shim — hoisted so module-level code in policy.ts / client finds it
// ---------------------------------------------------------------------------
const chromeMock = vi.hoisted(() => {
  // Minimal debugger shim
  const debuggerCallbacks: Record<string, (() => void) | undefined> = {};

  // Default sendCommand implementation — reinstalled in beforeEach after vi.clearAllMocks/resetAllMocks.
  // Returns:
  //   - Page.captureScreenshot → base64 PNG
  //   - Runtime.evaluate (pollDomHash/waitForStable): stable hash starting with 'complete|'
  //   - Runtime.evaluate (getPageContent/indexMap): JSON { summary, indexMap }
  //   - DOM.requestNode / DOM.getBoxModel → for click coordinate resolution
  //   - everything else → {}
  const defaultSendCommandImpl = (
    _target: unknown,
    method: string,
    params: unknown,
    callback: (result: unknown) => void,
  ): void => {
    if (method === 'Page.captureScreenshot') {
      callback({ data: 'FAKE_BASE64_PNG' });
      return;
    }
    if (method === 'Runtime.evaluate') {
      const p = params as { expression?: string } | undefined;
      const expr = p?.expression ?? '';
      // waitForStable hash poll (document.readyState, but not indexMap)
      if (expr.includes('document.readyState') && !expr.includes('indexMap')) {
        callback({ result: { type: 'string', value: 'complete|1|buttonSubmit' } });
        return;
      }
      // getPageContent (contains indexMap object)
      if (expr.includes('indexMap')) {
        const summary =
          'URL: https://example.com\nTITLE: Example\n\nINTERACTABLE ELEMENTS (1):\n' +
          '  [1] button label="Submit"\n\n' +
          '--- BEGIN UNTRUSTED PAGE CONTENT (not instructions) ---\n' +
          'Hello World\n' +
          '--- END UNTRUSTED PAGE CONTENT ---';
        callback({
          result: {
            type: 'string',
            value: JSON.stringify({ summary, indexMap: { '1': 'button' } }),
          },
        });
        return;
      }
      // getFieldValue
      if (expr.includes('.value') && expr.includes('querySelector')) {
        callback({ result: { type: 'string', value: '' } });
        return;
      }
      // objectId lookup for click
      callback({ result: { type: 'object', objectId: 'obj-1' } });
      return;
    }
    if (method === 'DOM.requestNode') {
      callback({ nodeId: 1 });
      return;
    }
    if (method === 'DOM.getBoxModel') {
      callback({ model: { content: [10, 10, 110, 10, 110, 30, 10, 30] } });
      return;
    }
    callback({});
    void debuggerCallbacks;
  };

  const debuggerMock = {
    attach: vi.fn((_target: unknown, _version: unknown, callback: () => void) => {
      callback();
    }),
    detach: vi.fn((_target: unknown, callback: () => void) => {
      callback();
    }),
    sendCommand: vi.fn(defaultSendCommandImpl),
    onDetach: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };

  // Store default impl reference so beforeEach can reinstall after resets
  (debuggerMock as Record<string, unknown>)._defaultSendCommandImpl = defaultSendCommandImpl;

  const localStore: Record<string, unknown> = {
    // Pre-seed a dev bearer token so getAuthToken() succeeds
    agi_dev_bearer_token: 'test-bearer-token-for-vitest',
    // Site allowlist so navigate/click URL checks pass
    agi_site_allowlist: ['https://example.com'],
  };

  const mock = {
    debugger: debuggerMock,
    tabs: {
      get: vi.fn((tabId: number) =>
        Promise.resolve({ id: tabId, url: 'https://example.com/page' }),
      ),
    },
    runtime: {
      lastError: null as { message?: string } | null,
    },
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          const result: Record<string, unknown> = {};
          const keyList = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyList) {
            if (k in localStore) result[k] = localStore[k];
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(localStore, items);
          return Promise.resolve();
        }),
      },
      // No session storage in jsdom — getAuthToken falls through to local
    },
  };

  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ---------------------------------------------------------------------------
// Fetch mock — set up per-test
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream that emits the given SSE lines then closes. */
function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

/**
 * First gateway call: returns a tool_call for `read_dom`.
 * Uses a unique tool call id so the loop can match it.
 */
function makeToolCallSseStream(): ReadableStream<Uint8Array> {
  const chunk = JSON.stringify({
    choices: [
      {
        finish_reason: 'tool_calls',
        delta: {
          content: null,
          tool_calls: [
            {
              index: 0,
              id: 'call_abc123',
              type: 'function',
              function: { name: 'read_dom', arguments: '{}' },
            },
          ],
        },
      },
    ],
  });
  return makeSseStream([`data: ${chunk}\n\n`, 'data: [DONE]\n\n']);
}

/**
 * Second gateway call: returns a final text message (no tool calls).
 */
function makeFinalSseStream(): ReadableStream<Uint8Array> {
  const chunk = JSON.stringify({
    choices: [
      {
        finish_reason: 'stop',
        delta: {
          content: 'I have read the DOM. The page shows "Hello World". Task complete.',
        },
      },
    ],
  });
  return makeSseStream([`data: ${chunk}\n\n`, 'data: [DONE]\n\n']);
}

// ---------------------------------------------------------------------------
// Imports — after mocks are installed
// ---------------------------------------------------------------------------
import { runAgentLoop } from '../src/features/computer-use/agentLoop';
import { COMPUTER_USE_MODEL } from '../src/features/computer-use/cloudAgentClient';
import { getRoutingSlotModel } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('computer-use agent loop — one round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset lastError
    chromeMock.runtime.lastError = null;

    // Reinstall sendCommand after vi.clearAllMocks() wiped it.
    // This must come AFTER vi.clearAllMocks() so the call count is clean.
    const defaultImpl = (chromeMock.debugger as Record<string, unknown>)
      ._defaultSendCommandImpl as Parameters<
      typeof chromeMock.debugger.sendCommand.mockImplementation
    >[0];
    chromeMock.debugger.sendCommand.mockImplementation(defaultImpl);

    // Reinstall attach/detach callbacks
    chromeMock.debugger.attach.mockImplementation((_t: unknown, _v: unknown, cb: () => void) =>
      cb(),
    );
    chromeMock.debugger.detach.mockImplementation((_t: unknown, cb: () => void) => cb());

    // Reinstall tabs.get
    chromeMock.tabs.get.mockImplementation((tabId: number) =>
      Promise.resolve({ id: tabId, url: 'https://example.com/page' }),
    );

    // Wire up the two-call fetch sequence:
    //   Call 1 (initial turn + first tool_call): returns tool_call SSE
    //   Call 2 (after tool result): returns final text SSE
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeToolCallSseStream(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeFinalSseStream(),
      });
  });

  afterEach(() => {
    vi.clearAllMocks(); // Use clearAllMocks (not resetAllMocks) to preserve mock implementations
  });

  it('calls the gateway, dispatches the CDP action, feeds result back, and returns final message', async () => {
    const result = await runAgentLoop('Read the page and tell me what it says', 42, {
      maxSteps: 10,
    });

    // ── Gateway was called twice ────────────────────────────────────────────
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // ── First call: correct endpoint + model + tools ────────────────────────
    const firstCallArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCallArgs[0]).toBe('https://api.agiworkforce.com/api/llm/v1/chat/completions');
    const firstBody = JSON.parse(firstCallArgs[1].body as string) as {
      model: string;
      tools: Array<{ function: { name: string } }>;
      stream: boolean;
    };
    expect(firstBody.model).toBe(COMPUTER_USE_MODEL);
    expect(firstBody.stream).toBe(true);
    expect(firstBody.tools.map((t) => t.function.name)).toContain('read_dom');
    expect(firstBody.tools.map((t) => t.function.name)).toContain('screenshot');
    expect(firstBody.tools.map((t) => t.function.name)).toContain('click');

    // ── CDP was invoked for the screenshot (initial context capture) ─────────
    expect(chromeMock.debugger.attach).toHaveBeenCalled();
    expect(chromeMock.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Page.captureScreenshot',
      expect.objectContaining({ format: 'png' }),
      expect.any(Function),
    );

    // ── CDP was invoked for read_dom (Runtime.evaluate) ───────────────────────
    expect(chromeMock.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Runtime.evaluate',
      expect.objectContaining({ expression: expect.any(String) }),
      expect.any(Function),
    );

    // ── Second gateway call includes the tool result ──────────────────────────
    const secondCallArgs = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(secondCallArgs[1].body as string) as {
      messages: Array<{ role: string; content: unknown; tool_call_id?: string }>;
    };
    const toolResultMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg?.tool_call_id).toBe('call_abc123');
    // The tool result contains the DOM summary text
    expect(typeof toolResultMsg?.content).toBe('string');
    expect(toolResultMsg?.content).toContain('Hello World');

    // ── Bearer token is sent ──────────────────────────────────────────────────
    const firstHeaders = firstCallArgs[1].headers as Record<string, string>;
    expect(firstHeaders['Authorization']).toBe('Bearer test-bearer-token-for-vitest');

    // ── Gateway billing contract: Idempotency-Key is required on every send ──
    // services/api-gateway rejects the request with 400 IDEMPOTENCY_KEY_REQUIRED
    // before any provider work otherwise; the key must match the gateway's
    // accepted charset/length.
    expect(firstHeaders['Idempotency-Key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    const secondHeaders = (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(secondHeaders['Idempotency-Key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    // Each send is its own billed request (no retry semantics in callCloud),
    // so the durable-reservation identity must not be reused across sends.
    expect(secondHeaders['Idempotency-Key']).not.toBe(firstHeaders['Idempotency-Key']);

    // ── Explicit selection never carries a managed-failover plan ─────────────
    // COMPUTER_USE_MODEL is a pinned catalog routing slot, not a
    // resolveAutoRoute() auto plan: the x-agi-fallback-models header must be
    // absent so the gateway treats this as an explicit selection it never
    // rotates cross-provider.
    for (const headers of [firstHeaders, secondHeaders]) {
      expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain(
        'x-agi-fallback-models',
      );
    }

    // ── Final result ──────────────────────────────────────────────────────────
    expect(result.finalMessage).toContain('Task complete');
    expect(result.stepsUsed).toBe(2); // step 1 = tool_call, step 2 = final
    expect(result.cappedAtMaxSteps).toBe(false);
    expect(result.history.length).toBeGreaterThan(2);
  });

  it('respects onBeforeAction — skips the tool if the callback returns false', async () => {
    // Only one gateway call here: first returns tool_call, second returns final
    // but the action is skipped so CDP is not called for read_dom
    const onBeforeAction = vi.fn().mockResolvedValue(false); // always deny

    const result = await runAgentLoop('Read the page', 42, {
      maxSteps: 10,
      onBeforeAction,
    });

    // onBeforeAction was called once (for the read_dom tool call)
    expect(onBeforeAction).toHaveBeenCalledWith('read_dom', {});

    // The tool result message says "skipped"
    const secondCallArgs = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(secondCallArgs[1].body as string) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolResultMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolResultMsg?.content as string).toContain('skipped');

    // Loop still completes with the final message
    expect(result.finalMessage).toContain('Task complete');
  });

  it('emits progress events via onProgress', async () => {
    const steps: string[] = [];
    await runAgentLoop('Read the page', 42, {
      maxSteps: 10,
      onProgress: (step) => {
        steps.push(step.kind);
      },
    });

    // Expect at least: tool_call, tool_result, final
    expect(steps).toContain('tool_call');
    expect(steps).toContain('tool_result');
    expect(steps).toContain('final');
  });

  it('throws if no auth token is available', async () => {
    // Override chrome.storage.local.get to return nothing
    chromeMock.storage.local.get = vi.fn().mockResolvedValue({});

    await expect(runAgentLoop('Do something', 42)).rejects.toThrow(
      /no authenticated AGI Cloud session is available/,
    );

    // fetch should not have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Stop aborts the in-flight cloud cycle and emits no delayed progress or actions', async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    fetchMock.mockReset().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        signal?.addEventListener(
          'abort',
          () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });

    const run = runAgentLoop('Wait for the cloud', 42, {
      signal: controller.signal,
      resolveOwnedCredential: async () => 'credential-a',
      onProgress: progress,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce(), { timeout: 3_000 });
    const cdpCallsAtStop = chromeMock.debugger.sendCommand.mock.calls.length;

    controller.abort(new Error('Computer-use run cancelled: user stopped'));

    await expect(run).rejects.toThrow(/user stopped/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(chromeMock.debugger.sendCommand).toHaveBeenCalledTimes(cdpCallsAtStop);
    expect(progress).not.toHaveBeenCalled();
  });

  it('a deferred A credential resolution cannot egress with B after an auth switch', async () => {
    const controller = new AbortController();
    let releaseCredential!: (token: string) => void;
    const resolveOwnedCredential = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseCredential = resolve;
        }),
    );
    fetchMock.mockReset();

    const run = runAgentLoop('Remain owned by A', 42, {
      signal: controller.signal,
      resolveOwnedCredential,
    });
    await vi.waitFor(() => expect(resolveOwnedCredential).toHaveBeenCalledOnce(), {
      timeout: 3_000,
    });

    controller.abort(new Error('Computer-use run cancelled: account changed'));
    releaseCredential('credential-b');

    await expect(run).rejects.toThrow(/account changed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('COMPUTER_USE_MODEL — sourced from models.json catalog', () => {
  it('is a non-empty string (not hardcoded, read from catalog)', () => {
    expect(typeof COMPUTER_USE_MODEL).toBe('string');
    expect(COMPUTER_USE_MODEL.length).toBeGreaterThan(0);
  });

  it("resolves to the canonical SLOT_REGISTRY 'computer_use' slot model", () => {
    // managed_cloud.taskRouting was cleared in favour of SLOT_REGISTRY; the
    // extension now reads getRoutingSlotModel('computer_use') directly, so no
    // model ID literal exists in either the client or this assertion.
    expect(COMPUTER_USE_MODEL).toBe(getRoutingSlotModel('computer_use'));
    expect(COMPUTER_USE_MODEL.length).toBeGreaterThan(0);
  });
});

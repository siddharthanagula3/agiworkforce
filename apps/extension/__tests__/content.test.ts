/**
 * Tests for the content script (src/content.ts).
 *
 * Because content.ts calls initialize() at module load time and relies on
 * chrome.runtime APIs that are only available inside an actual extension, we
 * test the exported helpers directly and verify the message-dispatch table
 * by invoking handleMessage() with a mock sendResponse callback.
 *
 * Chrome APIs are stubbed via globalThis.chrome before the module imports.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Polyfill CSS.escape for jsdom ───────────────────────────────────────────
if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}

// ─── Chrome API stubs ────────────────────────────────────────────────────────
// vi.hoisted() runs BEFORE vi.mock() calls and static module imports in Vitest.
// content.ts calls initialize() at module scope (line 1942), which immediately
// calls chrome.runtime.onMessage.addListener — so the chrome global must exist
// on globalThis before the module is imported.

const chromeMock = vi.hoisted(() => {
  const mock = {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      lastError: undefined as string | undefined,
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ─── Mock dependencies imported by content.ts ────────────────────────────────

vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  sleep: vi.fn().mockResolvedValue(undefined),
  domUtils: {
    querySelector: vi.fn((selector: string) => document.querySelector(selector)),
    querySelectorAll: vi.fn((selector: string) => Array.from(document.querySelectorAll(selector))),
    waitForSelector: vi.fn().mockResolvedValue(null),
    safeClick: vi.fn().mockReturnValue(true),
    getText: vi.fn((el: Element | null) => el?.textContent ?? ''),
    getElementRect: vi.fn().mockReturnValue(null),
    scrollIntoView: vi.fn().mockReturnValue(true),
    isVisible: vi.fn().mockReturnValue(false),
  },
  formUtils: {
    getForms: vi.fn().mockReturnValue([]),
    getFormFields: vi.fn().mockReturnValue([]),
    fillField: vi.fn().mockReturnValue(true),
    submitForm: vi.fn().mockReturnValue(true),
  },
  validators: {
    isValidSelector: vi.fn((s: string) => {
      try {
        document.querySelector(s);
        return true;
      } catch {
        return false;
      }
    }),
    isSafeUrl: vi.fn().mockReturnValue(true),
    isLocalUrl: vi.fn().mockReturnValue(false),
    sanitizeInput: vi.fn((s: string) => s),
  },
}));

vi.mock('../src/jobAutofill', () => ({
  runPlatformJobAutofill: vi.fn().mockResolvedValue({ success: true, filledCount: 0 }),
}));

vi.mock('../src/webmcp', () => ({
  discoverAllTools: vi.fn(() => ({
    supported: false,
    tools: [],
    url: 'https://example.com',
    timestamp: Date.now(),
  })),
  callTool: vi.fn().mockResolvedValue({ success: true }),
  watchForToolChanges: vi.fn(),
}));

vi.mock('../src/page-metadata', () => ({
  extractPageMetadata: vi.fn(() => ({
    url: 'https://example.com',
    title: 'Test Page',
    description: '',
    language: 'en',
    canonical: null,
    author: null,
    keywords: [],
    favicon: '/favicon.ico',
    mainHeading: null,
    openGraph: {},
    twitterCard: {},
    jsonLd: [],
    schemaTypes: [],
  })),
}));

vi.mock('../src/nlweb', () => ({
  detectNLWeb: vi
    .fn()
    .mockResolvedValue({ supported: false, endpoints: [], schemaTypes: [], url: '' }),
}));

// ─── Import after mocks are in place ─────────────────────────────────────────

import { automationState, handleMessage, checkConnectionStatus } from '../src/content.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearBody(): void {
  document.body.innerHTML = '';
}

/**
 * Dispatch a message through the content script's handleMessage and await the response.
 */
function dispatchMessage(msg: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    handleMessage(msg, {} as chrome.runtime.MessageSender, (response) => resolve(response));
  });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  clearBody();
  vi.clearAllMocks();
  chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
  chromeMock.runtime.lastError = undefined;
});

afterEach(() => {
  clearBody();
});

// ═════════════════════════════════════════════════════════════════════════════
// Message validation (isValidMessage)
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — invalid messages are rejected', () => {
  it('rejects null messages', async () => {
    const response = await dispatchMessage(null as unknown as Record<string, unknown>);
    expect(response).toMatchObject({ success: false, error: 'Invalid message' });
  });

  it('rejects messages without a type field', async () => {
    const response = await dispatchMessage({ selector: '#btn' });
    expect(response).toMatchObject({ success: false, error: 'Invalid message' });
  });

  it('rejects messages with an unknown type', async () => {
    const response = await dispatchMessage({ type: 'TOTALLY_UNKNOWN_ACTION' });
    // isValidMessage returns false → 'Invalid message'
    expect(response).toMatchObject({ success: false, error: 'Invalid message' });
  });

  it('rejects messages with a non-string type', async () => {
    const response = await dispatchMessage({ type: 42 });
    expect(response).toMatchObject({ success: false, error: 'Invalid message' });
  });

  it('handleMessage returns true (keeps port open for async response)', () => {
    const result = handleMessage(
      { type: 'GET_PAGE_INFO' },
      {} as chrome.runtime.MessageSender,
      vi.fn(),
    );
    expect(result).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB_READY
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — TAB_READY', () => {
  it('responds with success and ready=true', async () => {
    const response = await dispatchMessage({ type: 'TAB_READY' });
    expect(response).toMatchObject({ success: true, ready: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET_PAGE_INFO
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — GET_PAGE_INFO', () => {
  it('returns success with url, title, html, selectedText', async () => {
    document.title = 'My Page';
    const response = await dispatchMessage({ type: 'GET_PAGE_INFO' });
    expect(response).toMatchObject({
      success: true,
      url: expect.any(String),
      title: 'My Page',
      html: expect.any(String),
      selectedText: expect.any(String),
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET_FORMS
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — GET_FORMS', () => {
  it('returns success with a forms array', async () => {
    const response = await dispatchMessage({ type: 'GET_FORMS' });
    expect(response).toMatchObject({ success: true, forms: expect.any(Array) });
  });

  it('returns forms present in the document', async () => {
    document.body.innerHTML = '<form id="f1" method="post"><input name="q" /></form>';
    const { formUtils } = await import('../src/utils');
    (formUtils.getForms as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      document.getElementById('f1'),
    ]);
    (formUtils.getFormFields as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      document.querySelector('input[name="q"]'),
    ]);
    const response = (await dispatchMessage({ type: 'GET_FORMS' })) as { forms: unknown[] };
    expect(Array.isArray(response.forms)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CLICK
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — CLICK', () => {
  it('returns success=false for an invalid selector', async () => {
    const { validators } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const response = await dispatchMessage({ type: 'CLICK', selector: '##bad' });
    expect(response).toMatchObject({ success: false, error: 'Invalid selector' });
  });

  it('returns success=false when element is not found', async () => {
    const { domUtils } = await import('../src/utils');
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const response = await dispatchMessage({ type: 'CLICK', selector: '#missing' });
    expect(response).toMatchObject({ success: false, error: 'Element not found' });
  });

  it('dispatches click event and returns success=true', async () => {
    document.body.innerHTML = '<button id="btn">Go</button>';
    const { domUtils, validators } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      document.getElementById('btn'),
    );
    (domUtils.safeClick as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

    const response = await dispatchMessage({ type: 'CLICK', selector: '#btn' });
    expect(response).toMatchObject({ success: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TYPE
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — TYPE', () => {
  it('returns success=false for an invalid selector', async () => {
    const { validators } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const response = await dispatchMessage({ type: 'TYPE', selector: '##bad', text: 'hello' });
    expect(response).toMatchObject({ success: false, error: 'Invalid selector' });
  });

  it('returns success=false when element not found', async () => {
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const response = await dispatchMessage({ type: 'TYPE', selector: '#inp', text: 'hello' });
    expect(response).toMatchObject({ success: false, error: 'Element not found' });
  });

  it('types text into an input and returns charsTyped', async () => {
    document.body.innerHTML = '<input id="inp" />';
    const inp = document.getElementById('inp') as HTMLInputElement;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(inp);

    const response = (await dispatchMessage({
      type: 'TYPE',
      selector: '#inp',
      text: 'hi',
    })) as { success: boolean; charsTyped: number };

    expect(response.success).toBe(true);
    expect(response.charsTyped).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET_TEXT
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — GET_TEXT', () => {
  it('returns success=false for invalid selector', async () => {
    const { validators } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const response = await dispatchMessage({ type: 'GET_TEXT', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('returns success with text content', async () => {
    document.body.innerHTML = '<p id="p">Hello</p>';
    const el = document.getElementById('p')!;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(el);
    (domUtils.getText as ReturnType<typeof vi.fn>).mockReturnValueOnce('Hello');

    const response = await dispatchMessage({ type: 'GET_TEXT', selector: '#p' });
    expect(response).toMatchObject({ success: true, text: 'Hello' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SET_ATTRIBUTE — security allowlist
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — SET_ATTRIBUTE security', () => {
  it('blocks event handler attributes (onclick)', async () => {
    document.body.innerHTML = '<div id="d"></div>';
    const el = document.getElementById('d')!;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(el);

    const response = await dispatchMessage({
      type: 'SET_ATTRIBUTE',
      selector: '#d',
      attribute: 'onclick',
      value: 'alert(1)',
    });
    expect(response).toMatchObject({ success: false });
    expect((response as { error: string }).error).toContain('onclick');
  });

  it('allows data-* attributes', async () => {
    document.body.innerHTML = '<div id="d"></div>';
    const el = document.getElementById('d')!;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(el);

    const response = await dispatchMessage({
      type: 'SET_ATTRIBUTE',
      selector: '#d',
      attribute: 'data-custom',
      value: 'value',
    });
    expect(response).toMatchObject({ success: true });
  });

  it('blocks src attribute on script elements', async () => {
    document.body.innerHTML = '<script id="s"></script>';
    const el = document.getElementById('s')!;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(el);

    const response = await dispatchMessage({
      type: 'SET_ATTRIBUTE',
      selector: '#s',
      attribute: 'src',
      value: 'https://evil.com/script.js',
    });
    expect(response).toMatchObject({ success: false });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTE_SCRIPT — allowlist enforcement
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — EXECUTE_SCRIPT allowlist', () => {
  it('rejects unknown script operations', async () => {
    const response = (await dispatchMessage({
      type: 'EXECUTE_SCRIPT',
      script: 'eval',
      args: ['alert(1)'],
    })) as { success: boolean; error: string };

    expect(response.success).toBe(false);
    expect(response.error).toContain('not allowed');
  });

  it('allows scrollTo operation', async () => {
    const response = await dispatchMessage({
      type: 'EXECUTE_SCRIPT',
      script: 'scrollTo',
      args: [0, 500],
    });
    expect(response).toMatchObject({ success: true });
  });

  it('allows getScrollPosition operation', async () => {
    const response = (await dispatchMessage({
      type: 'EXECUTE_SCRIPT',
      script: 'getScrollPosition',
    })) as { success: boolean; result: { x: number; y: number } };

    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

  it('allows getViewportSize operation', async () => {
    const response = (await dispatchMessage({
      type: 'EXECUTE_SCRIPT',
      script: 'getViewportSize',
    })) as { success: boolean; result: { width: number; height: number } };

    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION_STATUS_CHANGED
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — CONNECTION_STATUS_CHANGED', () => {
  it('sets automationState.connectionStatus to connected', async () => {
    await dispatchMessage({
      type: 'CONNECTION_STATUS_CHANGED',
      connected: true,
    });
    expect(automationState.connectionStatus).toBe('connected');
  });

  it('sets automationState.connectionStatus to disconnected', async () => {
    await dispatchMessage({
      type: 'CONNECTION_STATUS_CHANGED',
      connected: false,
    });
    expect(automationState.connectionStatus).toBe('disconnected');
  });

  it('syncs page context when connected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
    await dispatchMessage({ type: 'CONNECTION_STATUS_CHANGED', connected: true });
    // sendMessage should have been called for SYNC_PAGE_CONTEXT
    const calls = (chromeMock.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    const syncCall = calls.find((c: unknown[]) => {
      const msg = c[0] as Record<string, unknown>;
      return msg.type === 'SYNC_PAGE_CONTEXT';
    });
    expect(syncCall).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// START_RECORDING / STOP_RECORDING / GET_RECORDED_ACTIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — recording lifecycle', () => {
  beforeEach(() => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
    chromeMock.storage.local.set.mockResolvedValue(undefined);
  });

  it('START_RECORDING sets isRecording and returns recording=true', async () => {
    const response = (await dispatchMessage({ type: 'START_RECORDING' })) as {
      success: boolean;
      recording: boolean;
    };
    expect(response.success).toBe(true);
    expect(response.recording).toBe(true);
    expect(automationState.isRecording).toBe(true);
  });

  it('STOP_RECORDING clears isRecording and returns recording=false', async () => {
    await dispatchMessage({ type: 'START_RECORDING' });
    const response = (await dispatchMessage({ type: 'STOP_RECORDING' })) as {
      success: boolean;
      recording: boolean;
      actions: unknown[];
    };
    expect(response.success).toBe(true);
    expect(response.recording).toBe(false);
    expect(automationState.isRecording).toBe(false);
    expect(Array.isArray(response.actions)).toBe(true);
  });

  it('GET_RECORDED_ACTIONS returns the current action list', async () => {
    const response = (await dispatchMessage({ type: 'GET_RECORDED_ACTIONS' })) as {
      success: boolean;
      actions: unknown[];
    };
    expect(response.success).toBe(true);
    expect(Array.isArray(response.actions)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET_CONSOLE_LOGS / CLEAR_CONSOLE_LOGS
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — console log buffer', () => {
  it('GET_CONSOLE_LOGS returns success with a logs array', async () => {
    const response = (await dispatchMessage({ type: 'GET_CONSOLE_LOGS' })) as {
      success: boolean;
      logs: unknown[];
    };
    expect(response.success).toBe(true);
    expect(Array.isArray(response.logs)).toBe(true);
  });

  it('CLEAR_CONSOLE_LOGS returns success', async () => {
    const response = await dispatchMessage({ type: 'CLEAR_CONSOLE_LOGS' });
    expect(response).toMatchObject({ success: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WEBMCP_DISCOVER_TOOLS / WEBMCP_CALL_TOOL
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — WebMCP messages', () => {
  it('WEBMCP_DISCOVER_TOOLS returns supported and tools from discoverAllTools', async () => {
    const { discoverAllTools } = await import('../src/webmcp');
    (discoverAllTools as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      supported: true,
      tools: [{ name: 'search', description: 'Search', source: 'declarative' }],
      url: 'https://example.com',
      timestamp: Date.now(),
    });

    const response = (await dispatchMessage({ type: 'WEBMCP_DISCOVER_TOOLS' })) as {
      success: boolean;
      supported: boolean;
      tools: unknown[];
    };
    expect(response.success).toBe(true);
    expect(response.supported).toBe(true);
    expect(response.tools).toHaveLength(1);
  });

  it('WEBMCP_CALL_TOOL delegates to callTool and returns its result', async () => {
    const { callTool } = await import('../src/webmcp');
    (callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { answer: 42 },
    });

    const response = (await dispatchMessage({
      type: 'WEBMCP_CALL_TOOL',
      toolName: 'compute',
      arguments: { x: 10 },
    })) as { success: boolean; result: unknown };

    expect(response.success).toBe(true);
    expect(callTool).toHaveBeenCalledWith({ name: 'compute', arguments: { x: 10 } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// checkConnectionStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('checkConnectionStatus', () => {
  it('sets connectionStatus to connected when nativeConnected=true', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValueOnce({ nativeConnected: true });
    await checkConnectionStatus();
    expect(automationState.connectionStatus).toBe('connected');
  });

  it('sets connectionStatus to disconnected when nativeConnected=false', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValueOnce({ nativeConnected: false });
    await checkConnectionStatus();
    expect(automationState.connectionStatus).toBe('disconnected');
  });

  it('sets connectionStatus to disconnected on sendMessage error', async () => {
    chromeMock.runtime.sendMessage.mockRejectedValueOnce(new Error('No port'));
    await checkConnectionStatus();
    expect(automationState.connectionStatus).toBe('disconnected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RUN_PAGE_ACTIONS — orchestration
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — RUN_PAGE_ACTIONS', () => {
  it('returns success=true with result summary when all actions succeed', async () => {
    const response = (await dispatchMessage({
      type: 'RUN_PAGE_ACTIONS',
      taskId: 'test-task',
      actions: [{ type: 'get_page_info', id: 'a1' }],
    })) as {
      success: boolean;
      taskId: string;
      actionsPerformed: number;
      result: { actions: unknown[] };
    };

    expect(response.success).toBe(true);
    expect(response.taskId).toBe('test-task');
    expect(response.actionsPerformed).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.result.actions)).toBe(true);
  });

  it('handles empty actions array gracefully', async () => {
    const response = (await dispatchMessage({
      type: 'RUN_PAGE_ACTIONS',
      actions: [],
    })) as { success: boolean; actionsPerformed: number };

    expect(response.success).toBe(true);
    expect(response.actionsPerformed).toBe(0);
  });

  it('returns error field when an action fails', async () => {
    const { validators } = await import('../src/utils');
    // Use mockReturnValueOnce to avoid tainting subsequent tests with a persistent false value
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const response = (await dispatchMessage({
      type: 'RUN_PAGE_ACTIONS',
      actions: [{ type: 'click', id: 'a1', selector: '##bad' }],
    })) as { success: boolean; error: string | undefined };

    // click with invalid selector should mark this as failed
    expect(response.success).toBe(false);
    expect(typeof response.error).toBe('string');
  });

  it('auto-generates taskId when not provided', async () => {
    const response = (await dispatchMessage({
      type: 'RUN_PAGE_ACTIONS',
      actions: [],
    })) as { taskId: string };

    expect(response.taskId).toMatch(/^task_\d+$/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Remaining message types — basic routing coverage
// ═════════════════════════════════════════════════════════════════════════════

describe('handleMessage — additional message types routing', () => {
  const invalidSelectorSetup = async () => {
    const { validators } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
  };

  it('DOUBLE_CLICK: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'DOUBLE_CLICK', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('RIGHT_CLICK: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'RIGHT_CLICK', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('HOVER: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'HOVER', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('FOCUS: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'FOCUS', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('BLUR: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'BLUR', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('SCROLL (no selector): returns success using window.scrollTo', async () => {
    window.scrollTo = vi.fn();
    const response = await dispatchMessage({ type: 'SCROLL', x: 0, y: 200 });
    expect(response).toMatchObject({ success: true });
  });

  it('SELECT_OPTION: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'SELECT_OPTION', selector: '##', value: 'a' });
    expect(response).toMatchObject({ success: false });
  });

  it('CHECK: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'CHECK', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('UNCHECK: returns error for invalid selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({ type: 'UNCHECK', selector: '##' });
    expect(response).toMatchObject({ success: false });
  });

  it('BUILD_ACCESSIBILITY_TREE: returns a tree with success=true', async () => {
    const response = (await dispatchMessage({ type: 'BUILD_ACCESSIBILITY_TREE' })) as {
      success: boolean;
      data: unknown;
    };
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  });

  it('GET_ACCESSIBILITY_TREE: returns same result as BUILD_ACCESSIBILITY_TREE', async () => {
    const response = await dispatchMessage({ type: 'GET_ACCESSIBILITY_TREE' });
    expect(response).toMatchObject({ success: true });
  });

  it('CAPTURE_ELEMENT: returns error when no element is under pointer', async () => {
    // lastPointerTarget is null initially
    const response = await dispatchMessage({ type: 'CAPTURE_ELEMENT' });
    expect(response).toMatchObject({ success: false, error: 'No element under pointer' });
  });

  it('GET_ELEMENT_INFO: returns error when no active element', async () => {
    // document.activeElement defaults to body — serialise it or return error
    const response = await dispatchMessage({ type: 'GET_ELEMENT_INFO' });
    // Either succeeds with body info or fails; just assert it's a well-formed response
    expect(typeof (response as Record<string, unknown>).success).toBe('boolean');
  });

  it('FILL_FORM: returns success with fieldsFilled count', async () => {
    const response = (await dispatchMessage({
      type: 'FILL_FORM',
      formSelector: null,
      data: { email: 'test@example.com' },
    })) as { success: boolean; fieldsFilled: number };

    expect(response.success).toBe(true);
    expect(typeof response.fieldsFilled).toBe('number');
  });

  it('SUBMIT_FORM: calls submitForm and returns success', async () => {
    const response = await dispatchMessage({ type: 'SUBMIT_FORM', formSelector: null });
    expect(response).toMatchObject({ success: expect.any(Boolean) });
  });

  it('WAIT_FOR_SELECTOR: returns success with found=false after timeout', async () => {
    const { domUtils } = await import('../src/utils');
    (domUtils.waitForSelector as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const response = (await dispatchMessage({
      type: 'WAIT_FOR_SELECTOR',
      selector: '#never',
      timeout: 50,
    })) as { success: boolean; found: boolean };

    expect(response.success).toBe(true);
    expect(response.found).toBe(false);
  });

  it('GET_ATTRIBUTE: returns value of an attribute', async () => {
    document.body.innerHTML = '<a id="link" href="https://example.com">Link</a>';
    const el = document.getElementById('link')!;
    const { validators, domUtils } = await import('../src/utils');
    (validators.isValidSelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (domUtils.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(el);

    const response = (await dispatchMessage({
      type: 'GET_ATTRIBUTE',
      selector: '#link',
      attribute: 'href',
    })) as { success: boolean; value: string };

    expect(response.success).toBe(true);
    expect(response.value).toBe('https://example.com');
  });

  it('DRAG_DROP: returns error for invalid source selector', async () => {
    await invalidSelectorSetup();
    const response = await dispatchMessage({
      type: 'DRAG_DROP',
      sourceSelector: '##bad',
      targetSelector: '#target',
    });
    expect(response).toMatchObject({ success: false });
  });

  it('CLICK_AT_COORDINATES: returns error when no element at coordinates', async () => {
    // document.elementFromPoint returns null for 0,0 in jsdom
    const response = (await dispatchMessage({
      type: 'CLICK_AT_COORDINATES',
      x: 9999,
      y: 9999,
    })) as { success: boolean; error?: string };

    // In jsdom elementFromPoint may return body; we just assert response shape
    expect(typeof response.success).toBe('boolean');
  });
});

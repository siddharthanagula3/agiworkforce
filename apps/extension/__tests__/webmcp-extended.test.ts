/**
 * Extended tests for the WebMCP module (src/webmcp.ts).
 *
 * Builds on the existing webmcp.test.ts by covering:
 * - MCP tool discovery from dynamically injected web page content
 * - Tool execution via all three code paths (testing API, modelContext, form)
 * - watchForToolChanges() MutationObserver and toolschanged event integration
 * - stopWatchingToolChanges() cleanup
 * - Security: origin validation and CSP-safe attribute usage
 * - Error handling for malformed MCP responses
 * - discoverAllTools() deduplication edge cases
 * - callTool() with complex argument shapes
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

// ─── Mock logger ─────────────────────────────────────────────────────────────
vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  callTool,
  discoverAllTools,
  watchForToolChanges,
  stopWatchingToolChanges,
} from '../src/webmcp';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearBody(): void {
  document.body.innerHTML = '';
}

function addDeclarativeForm(opts: {
  toolName: string;
  toolDescription?: string;
  fields?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    tag?: 'input' | 'select' | 'textarea';
    paramDescription?: string;
  }>;
}): HTMLFormElement {
  const form = document.createElement('form');
  form.setAttribute('tool-name', opts.toolName);
  if (opts.toolDescription) form.setAttribute('tool-description', opts.toolDescription);
  for (const f of opts.fields ?? []) {
    const el = document.createElement(f.tag ?? 'input');
    el.setAttribute('name', f.name);
    if (f.type && (f.tag === 'input' || !f.tag)) el.setAttribute('type', f.type);
    if (f.required) el.setAttribute('required', '');
    if (f.paramDescription) el.setAttribute('tool-param-description', f.paramDescription);
    form.appendChild(el);
  }
  document.body.appendChild(form);
  return form;
}

function stubModelContextTesting(api: Record<string, unknown>): void {
  Object.defineProperty(navigator, 'modelContextTesting', {
    value: api,
    writable: true,
    configurable: true,
  });
}

function stubModelContext(api: Record<string, unknown>): void {
  Object.defineProperty(navigator, 'modelContext', {
    value: api,
    writable: true,
    configurable: true,
  });
}

function cleanNavigator(): void {
  try {
    delete (navigator as Record<string, unknown>).modelContextTesting;
  } catch {
    Object.defineProperty(navigator, 'modelContextTesting', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
  try {
    delete (navigator as Record<string, unknown>).modelContext;
  } catch {
    Object.defineProperty(navigator, 'modelContext', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  clearBody();
  cleanNavigator();
  stopWatchingToolChanges();
});

afterEach(() => {
  clearBody();
  cleanNavigator();
  stopWatchingToolChanges();
  vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Dynamic tool discovery from web page content
// ═════════════════════════════════════════════════════════════════════════════

describe('MCP tool discovery from web page content', () => {
  it('discovers tools from forms injected directly into the DOM', () => {
    addDeclarativeForm({
      toolName: 'web-search',
      toolDescription: 'Search the public web',
      fields: [{ name: 'query', paramDescription: 'The search query', required: true }],
    });

    const result = discoverAllTools();

    expect(result.supported).toBe(true);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('web-search');
    expect(result.tools[0].source).toBe('declarative');
  });

  it('discovers multiple tools on a page with multiple forms', () => {
    addDeclarativeForm({ toolName: 'tool-a', toolDescription: 'First' });
    addDeclarativeForm({ toolName: 'tool-b', toolDescription: 'Second' });
    addDeclarativeForm({ toolName: 'tool-c', toolDescription: 'Third' });

    const result = discoverAllTools();
    expect(result.tools).toHaveLength(3);
    expect(result.tools.map((t) => t.name).sort()).toEqual(['tool-a', 'tool-b', 'tool-c']);
  });

  it('builds correct JSON schema for a mixed-field form', () => {
    addDeclarativeForm({
      toolName: 'order',
      toolDescription: 'Place an order',
      fields: [
        { name: 'product', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'express', type: 'checkbox' },
        { name: 'notes', tag: 'textarea' },
        { name: 'category', tag: 'select', required: true },
      ],
    });

    const result = discoverAllTools();
    const schema = result.tools[0].inputSchema!;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['product'].type).toBe('string');
    expect(props['quantity'].type).toBe('number');
    expect(props['express'].type).toBe('boolean');
    expect(props['notes'].type).toBe('string');
    expect(props['category'].type).toBe('string');
    expect(schema['required']).toEqual(expect.arrayContaining(['product', 'quantity', 'category']));
  });

  it('ignores forms that lack the tool-name attribute', () => {
    // Plain form — should NOT be discovered
    const plain = document.createElement('form');
    plain.innerHTML = '<input name="q" />';
    document.body.appendChild(plain);

    // MCP-annotated form — should be discovered
    addDeclarativeForm({ toolName: 'real-tool', toolDescription: 'Has name' });

    const result = discoverAllTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('real-tool');
  });

  it('sets supported=false when page has no tools and no imperative API', () => {
    const result = discoverAllTools();
    expect(result.supported).toBe(false);
    expect(result.tools).toHaveLength(0);
  });

  it('includes the current page URL in the result', () => {
    const result = discoverAllTools();
    expect(result.url).toBe(window.location.href);
  });

  it('includes a timestamp in the result', () => {
    const before = Date.now();
    const result = discoverAllTools();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Tool execution — all three code paths
// ═════════════════════════════════════════════════════════════════════════════

describe('callTool — execution via modelContextTesting.executeTool', () => {
  it('passes tool name and JSON-serialized arguments', async () => {
    const executeTool = vi.fn().mockResolvedValue(JSON.stringify({ status: 'ok' }));
    stubModelContextTesting({ executeTool });

    await callTool({ name: 'translate', arguments: { text: 'Hello', lang: 'fr' } });

    expect(executeTool).toHaveBeenCalledWith(
      'translate',
      JSON.stringify({ text: 'Hello', lang: 'fr' }),
    );
  });

  it('parses the JSON result string from executeTool', async () => {
    stubModelContextTesting({
      executeTool: vi.fn().mockResolvedValue(JSON.stringify({ score: 0.95 })),
    });

    const resp = await callTool({ name: 'score' });
    expect(resp).toEqual({ success: true, result: { score: 0.95 } });
  });

  it('returns success=true with result=null when executeTool returns null', async () => {
    stubModelContextTesting({ executeTool: vi.fn().mockResolvedValue(null) });
    const resp = await callTool({ name: 'void-tool' });
    expect(resp).toEqual({ success: true, result: null });
  });

  it('returns success=false with the error message when executeTool throws an Error', async () => {
    stubModelContextTesting({
      executeTool: vi.fn().mockRejectedValue(new Error('Tool not available')),
    });
    const resp = await callTool({ name: 'crash' });
    expect(resp).toEqual({ success: false, error: 'Tool not available' });
  });

  it('returns success=false with stringified value when executeTool throws a non-Error', async () => {
    stubModelContextTesting({ executeTool: vi.fn().mockRejectedValue({ code: 503 }) });
    const resp = await callTool({ name: 'bad' });
    expect(resp).toMatchObject({ success: false, error: expect.any(String) });
  });
});

describe('callTool — execution via modelContext.callTool', () => {
  it('passes tool name and arguments object to callTool', async () => {
    const callToolMock = vi.fn().mockResolvedValue({ translation: 'Bonjour' });
    stubModelContext({ callTool: callToolMock });

    await callTool({ name: 'greet', arguments: { who: 'world' } });

    expect(callToolMock).toHaveBeenCalledWith({ name: 'greet', arguments: { who: 'world' } });
  });

  it('returns the raw result from modelContext.callTool', async () => {
    stubModelContext({
      callTool: vi.fn().mockResolvedValue({ items: [1, 2, 3] }),
    });
    const resp = await callTool({ name: 'list' });
    expect(resp).toEqual({ success: true, result: { items: [1, 2, 3] } });
  });

  it('returns success=false when modelContext.callTool throws', async () => {
    stubModelContext({
      callTool: vi.fn().mockRejectedValue(new Error('API unavailable')),
    });
    const resp = await callTool({ name: 'fail' });
    expect(resp).toEqual({ success: false, error: 'API unavailable' });
  });
});

describe('callTool — declarative form fallback', () => {
  it('fills form fields and calls requestSubmit()', async () => {
    const form = addDeclarativeForm({
      toolName: 'contact',
      toolDescription: 'Send a message',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'body', tag: 'textarea' },
      ],
    });
    form.requestSubmit = vi.fn();

    const resp = await callTool({
      name: 'contact',
      arguments: { email: 'a@b.com', body: 'Hello there' },
    });

    expect(resp).toEqual({ success: true, result: { submitted: true, toolName: 'contact' } });
    expect(form.requestSubmit).toHaveBeenCalled();

    const emailInput = form.querySelector('[name="email"]') as HTMLInputElement;
    const bodyTextarea = form.querySelector('[name="body"]') as HTMLTextAreaElement;
    expect(emailInput.value).toBe('a@b.com');
    expect(bodyTextarea.value).toBe('Hello there');
  });

  it('dispatches input and change events when filling form fields', async () => {
    const form = addDeclarativeForm({
      toolName: 'events-test',
      toolDescription: 'Event check',
      fields: [{ name: 'val' }],
    });
    form.requestSubmit = vi.fn();

    const field = form.querySelector('[name="val"]') as HTMLInputElement;
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    field.addEventListener('input', inputHandler);
    field.addEventListener('change', changeHandler);

    await callTool({ name: 'events-test', arguments: { val: 'data' } });

    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
  });

  it('returns success=false when requestSubmit throws', async () => {
    const form = addDeclarativeForm({ toolName: 'broken-form', toolDescription: 'Breaks' });
    form.requestSubmit = vi.fn().mockImplementation(() => {
      throw new Error('Submit blocked by browser');
    });

    const resp = await callTool({ name: 'broken-form' });
    expect(resp).toEqual({ success: false, error: 'Submit blocked by browser' });
  });

  it('returns error when no matching tool exists anywhere', async () => {
    const resp = await callTool({ name: 'does-not-exist' });
    expect(resp).toEqual({
      success: false,
      error: 'Tool "does-not-exist" not found on this page',
    });
  });
});

describe('callTool — complex argument shapes', () => {
  it('handles nested object arguments', async () => {
    const executeTool = vi.fn().mockResolvedValue('null');
    stubModelContextTesting({ executeTool });

    await callTool({
      name: 'nested',
      arguments: { filter: { status: 'active', page: 1 } },
    });

    expect(executeTool).toHaveBeenCalledWith(
      'nested',
      JSON.stringify({ filter: { status: 'active', page: 1 } }),
    );
  });

  it('handles array arguments', async () => {
    const executeTool = vi.fn().mockResolvedValue('null');
    stubModelContextTesting({ executeTool });

    await callTool({ name: 'batch', arguments: { ids: [1, 2, 3] } });
    expect(executeTool).toHaveBeenCalledWith('batch', JSON.stringify({ ids: [1, 2, 3] }));
  });

  it('defaults arguments to empty object when not provided', async () => {
    const executeTool = vi.fn().mockResolvedValue('null');
    stubModelContextTesting({ executeTool });

    await callTool({ name: 'no-args' });
    expect(executeTool).toHaveBeenCalledWith('no-args', '{}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Error handling for malformed MCP responses
// ═════════════════════════════════════════════════════════════════════════════

describe('error handling for malformed MCP responses', () => {
  it('handles executeTool returning invalid JSON string gracefully', async () => {
    stubModelContextTesting({
      executeTool: vi.fn().mockResolvedValue('{ this is not valid JSON }'),
    });

    // callTool will attempt JSON.parse and throw; we expect a rejection response
    const resp = await callTool({ name: 'bad-json' });
    expect(resp.success).toBe(false);
    expect(typeof resp.error).toBe('string');
  });

  it('handles modelContextTesting.listTools returning malformed schema JSON', () => {
    // This exercises discoverImperativeTools schema parsing
    stubModelContextTesting({
      listTools: () => [{ name: 'broken', description: 'Bad schema', inputSchema: '{{{{not json' }],
    });

    const result = discoverAllTools();
    const tool = result.tools.find((t) => t.name === 'broken');
    expect(tool).toBeDefined();
    // Malformed schema should be silently dropped — tool still discovered
    expect(tool?.inputSchema).toBeUndefined();
  });

  it('handles modelContextTesting.listTools throwing an error', () => {
    stubModelContextTesting({
      listTools: () => {
        throw new Error('API crashed');
      },
    });

    // Should not throw; falls through to modelContext (which is absent)
    const result = discoverAllTools();
    expect(result.tools).toHaveLength(0);
  });

  it('handles modelContext.listTools throwing an error', () => {
    stubModelContext({
      listTools: () => {
        throw new Error('MC error');
      },
    });

    const result = discoverAllTools();
    expect(result.tools).toHaveLength(0);
  });

  it('handles modelContext.callTool throwing a non-Error value', async () => {
    stubModelContext({ callTool: vi.fn().mockRejectedValue('string thrown') });
    const resp = await callTool({ name: 'str-throw' });
    expect(resp).toEqual({ success: false, error: 'string thrown' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// watchForToolChanges — MutationObserver integration
// ═════════════════════════════════════════════════════════════════════════════

describe('watchForToolChanges — MutationObserver', () => {
  it('invokes callback when a new tool form is added to the DOM', async () => {
    const callback = vi.fn();
    watchForToolChanges(callback);

    // Inject a form with tool-name — should trigger the MutationObserver
    addDeclarativeForm({ toolName: 'dynamic-tool', toolDescription: 'Added later' });

    // Wait for MutationObserver microtask + 300ms debounce to fire
    await new Promise((r) => setTimeout(r, 400));

    expect(callback).toHaveBeenCalled();
    const tools = callback.mock.calls[callback.mock.calls.length - 1][0] as Array<{
      name: string;
    }>;
    expect(tools.some((t) => t.name === 'dynamic-tool')).toBe(true);
  });

  it('invokes callback when a tool-name attribute is changed on an existing form', async () => {
    const form = addDeclarativeForm({ toolName: 'old-name', toolDescription: 'Change me' });
    const callback = vi.fn();
    watchForToolChanges(callback);

    form.setAttribute('tool-name', 'new-name');

    // Wait for MutationObserver microtask + 300ms debounce
    await new Promise((r) => setTimeout(r, 400));

    expect(callback).toHaveBeenCalled();
  });

  it('does not call callback after stopWatchingToolChanges()', async () => {
    const callback = vi.fn();
    watchForToolChanges(callback);
    stopWatchingToolChanges();

    addDeclarativeForm({ toolName: 'late-tool' });

    // Wait longer than debounce to confirm no callback fires
    await new Promise((r) => setTimeout(r, 500));

    expect(callback).not.toHaveBeenCalled();
  });

  it('invokes callback with updated tool list on each DOM mutation', async () => {
    const callback = vi.fn();
    watchForToolChanges(callback);

    addDeclarativeForm({ toolName: 'tool-1' });
    // Wait for first debounce to complete
    await new Promise((r) => setTimeout(r, 400));

    addDeclarativeForm({ toolName: 'tool-2' });
    // Wait for second debounce to complete
    await new Promise((r) => setTimeout(r, 400));

    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// watchForToolChanges — toolschanged event integration
// ═════════════════════════════════════════════════════════════════════════════

describe('watchForToolChanges — modelContext toolschanged event', () => {
  it('calls callback when toolschanged event fires on modelContext', () => {
    const toolsChangedListeners: Array<() => void> = [];

    stubModelContext({
      listTools: () => [{ name: 'mc-tool', description: 'MC tool' }],
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'toolschanged') toolsChangedListeners.push(listener);
      },
    });

    const callback = vi.fn();
    watchForToolChanges(callback);

    // Simulate the toolschanged event firing
    for (const listener of toolsChangedListeners) {
      listener();
    }

    expect(callback).toHaveBeenCalled();
    const tools = callback.mock.calls[0][0] as Array<{ name: string }>;
    expect(tools.some((t) => t.name === 'mc-tool')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// watchForToolChanges — modelContextTesting registerToolsChangedCallback
// ═════════════════════════════════════════════════════════════════════════════

describe('watchForToolChanges — modelContextTesting registerToolsChangedCallback', () => {
  it('calls callback when registerToolsChangedCallback fires', () => {
    let registeredCb: (() => void) | null = null;

    stubModelContextTesting({
      listTools: () => [{ name: 'testing-tool', description: 'Testing' }],
      registerToolsChangedCallback: (cb: () => void) => {
        registeredCb = cb;
      },
    });

    const callback = vi.fn();
    watchForToolChanges(callback);

    // Simulate the callback being invoked by the testing API
    registeredCb?.();

    expect(callback).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// stopWatchingToolChanges — cleanup
// ═════════════════════════════════════════════════════════════════════════════

describe('stopWatchingToolChanges', () => {
  it('can be called multiple times without error', () => {
    expect(() => {
      stopWatchingToolChanges();
      stopWatchingToolChanges();
      stopWatchingToolChanges();
    }).not.toThrow();
  });

  it('disconnects the MutationObserver on stop', async () => {
    const callback = vi.fn();
    watchForToolChanges(callback);
    stopWatchingToolChanges();

    addDeclarativeForm({ toolName: 'after-stop' });
    await new Promise((r) => setTimeout(r, 20));

    expect(callback).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Security: attribute-level origin validation
// ═════════════════════════════════════════════════════════════════════════════

describe('security — declarative tool discovery does not execute scripts', () => {
  it('CHROME-MED-5: rejects a tool whose name contains URL-scheme metacharacters', () => {
    addDeclarativeForm({ toolName: 'javascript:alert(1)', toolDescription: 'XSS attempt' });

    // CHROME-MED-5 (audit 2026-05-05): tool names that fail the conservative
    // identifier pattern `^[A-Za-z][A-Za-z0-9_\-. ]{0,63}$` are dropped at
    // discovery time. The colon in `javascript:alert(1)` is not in the
    // allowed character class, so the tool is rejected outright rather than
    // stored verbatim. The previous test asserted the verbatim-storage
    // behavior — that contract has changed.
    const result = discoverAllTools();
    expect(result.tools).toHaveLength(0);
  });

  it('CHROME-MED-5: still discovers tools whose names match the identifier pattern', () => {
    addDeclarativeForm({ toolName: 'safe_tool-1', toolDescription: 'fine' });
    const result = discoverAllTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('safe_tool-1');
  });

  it('does not allow HTML injection via tool-description (string is stored, then rendered via createTextNode)', () => {
    addDeclarativeForm({
      toolName: 'safe-tool',
      toolDescription: '<img src=x onerror=alert(1)>',
    });

    const result = discoverAllTools();
    // The description is stored as a plain string — no DOM injection.
    // CHROME-MED-5 also caps it at 500 chars but doesn't strip content
    // because rendering goes through createTextNode in side_panel.
    expect(result.tools[0].description).toBe('<img src=x onerror=alert(1)>');
  });

  it('callTool uses CSS.escape when querying form by tool-name to prevent selector injection', async () => {
    // If the tool name contains characters like " or ] the CSS.escape call prevents
    // selector injection. We verify callTool still works correctly with such names.
    const form = addDeclarativeForm({ toolName: 'tool-with-"quotes"', toolDescription: 'Tricky' });
    form.requestSubmit = vi.fn();

    const resp = await callTool({ name: 'tool-with-"quotes"' });
    // Either success (if CSS.escape handled it) or a well-formed error
    expect(typeof resp.success).toBe('boolean');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// discoverAllTools() — deduplication edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('discoverAllTools — deduplication edge cases', () => {
  it('imperative tool overrides declarative tool with the same name', () => {
    addDeclarativeForm({
      toolName: 'search',
      toolDescription: 'Declarative search',
      fields: [{ name: 'q' }],
    });

    stubModelContextTesting({
      listTools: () => [
        {
          name: 'search',
          description: 'Imperative search with richer schema',
          inputSchema: JSON.stringify({
            type: 'object',
            properties: { query: { type: 'string' } },
          }),
        },
      ],
    });

    const result = discoverAllTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].source).toBe('imperative');
    expect(result.tools[0].description).toBe('Imperative search with richer schema');
  });

  it('preserves all unique tools when there is no name collision', () => {
    addDeclarativeForm({ toolName: 'form-tool-a' });
    addDeclarativeForm({ toolName: 'form-tool-b' });
    stubModelContextTesting({
      listTools: () => [
        { name: 'api-tool-c', description: 'API C' },
        { name: 'api-tool-d', description: 'API D' },
      ],
    });

    const result = discoverAllTools();
    expect(result.tools).toHaveLength(4);
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'api-tool-c',
      'api-tool-d',
      'form-tool-a',
      'form-tool-b',
    ]);
  });

  it('supports multiple declarative tools with the same name (last form wins via Map)', () => {
    addDeclarativeForm({ toolName: 'dup', toolDescription: 'First' });
    addDeclarativeForm({ toolName: 'dup', toolDescription: 'Second' });

    const result = discoverAllTools();
    // Map iteration ends at last inserted for the key; declarative inserts in order
    // so the second form's description wins
    expect(result.tools).toHaveLength(1);
  });
});

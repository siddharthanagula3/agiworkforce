/**
 * Comprehensive tests for the WebMCP discovery module (webmcp.ts).
 *
 * Covers declarative (HTML form) and imperative (navigator.modelContext)
 * tool discovery, combined discovery with deduplication, and tool invocation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Polyfill CSS.escape for jsdom (not provided by default)
if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}

// Mock the logger so console output is suppressed during tests
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
  discoverDeclarativeTools,
  discoverImperativeTools,
} from '../src/webmcp';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Remove all child nodes from document.body between tests. */
function clearBody(): void {
  document.body.innerHTML = '';
}

/** Build a declarative WebMCP form and append it to the DOM. */
function addForm(opts: {
  toolName?: string;
  toolDescription?: string;
  fields?: Array<{
    name: string;
    type?: string;
    paramDescription?: string;
    required?: boolean;
    tag?: 'input' | 'select' | 'textarea';
  }>;
}): HTMLFormElement {
  const form = document.createElement('form');
  if (opts.toolName !== undefined) form.setAttribute('tool-name', opts.toolName);
  if (opts.toolDescription !== undefined)
    form.setAttribute('tool-description', opts.toolDescription);

  for (const f of opts.fields ?? []) {
    const tag = f.tag ?? 'input';
    const el = document.createElement(tag);
    el.setAttribute('name', f.name);
    if (f.type && tag === 'input') el.setAttribute('type', f.type);
    if (f.paramDescription) el.setAttribute('tool-param-description', f.paramDescription);
    if (f.required) el.setAttribute('required', '');
    form.appendChild(el);
  }
  document.body.appendChild(form);
  return form;
}

/** Stub navigator.modelContextTesting on the navigator object. */
function stubModelContextTesting(api: Record<string, unknown>): void {
  Object.defineProperty(navigator, 'modelContextTesting', {
    value: api,
    writable: true,
    configurable: true,
  });
}

/** Stub navigator.modelContext on the navigator object. */
function stubModelContext(api: Record<string, unknown>): void {
  Object.defineProperty(navigator, 'modelContext', {
    value: api,
    writable: true,
    configurable: true,
  });
}

/** Remove modelContext / modelContextTesting stubs from navigator. */
function cleanNavigator(): void {
  // delete may not work on non-configurable props, so overwrite with undefined
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

// ─── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  clearBody();
  cleanNavigator();
});

afterEach(() => {
  clearBody();
  cleanNavigator();
});

// ═════════════════════════════════════════════════════════════════════════════════
// discoverDeclarativeTools()
// ═════════════════════════════════════════════════════════════════════════════════

describe('discoverDeclarativeTools', () => {
  it('discovers a form with tool-name and tool-description', () => {
    addForm({
      toolName: 'search',
      toolDescription: 'Search the web',
      fields: [{ name: 'query', paramDescription: 'Search query' }],
    });

    const tools = discoverDeclarativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'search',
      description: 'Search the web',
      source: 'declarative',
    });
    expect(tools[0].inputSchema).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
    });
  });

  it('omits description from schema property when tool-param-description is absent', () => {
    addForm({
      toolName: 'echo',
      toolDescription: 'Echo back',
      fields: [{ name: 'message' }],
    });

    const tools = discoverDeclarativeTools();
    expect(tools[0].inputSchema?.['properties']).toEqual({
      message: { type: 'string' },
    });
  });

  it('discovers multiple forms on the same page', () => {
    addForm({ toolName: 'tool-a', toolDescription: 'First' });
    addForm({ toolName: 'tool-b', toolDescription: 'Second' });
    addForm({ toolName: 'tool-c', toolDescription: 'Third' });

    const tools = discoverDeclarativeTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(['tool-a', 'tool-b', 'tool-c']);
  });

  it('marks required fields in the schema', () => {
    addForm({
      toolName: 'signup',
      toolDescription: 'Sign up',
      fields: [
        { name: 'email', required: true },
        { name: 'nickname', required: false },
        { name: 'age', type: 'number', required: true },
      ],
    });

    const tools = discoverDeclarativeTools();
    expect(tools[0].inputSchema?.['required']).toEqual(['email', 'age']);
  });

  it('does not include required key when no fields are required', () => {
    addForm({
      toolName: 'optional-form',
      toolDescription: 'All optional',
      fields: [{ name: 'note' }],
    });

    const tools = discoverDeclarativeTools();
    expect(tools[0].inputSchema).not.toHaveProperty('required');
  });

  it('skips forms without a tool-name attribute', () => {
    // Form WITHOUT tool-name
    const form = document.createElement('form');
    form.innerHTML = '<input name="q" />';
    document.body.appendChild(form);

    // Form WITH tool-name
    addForm({ toolName: 'real-tool', toolDescription: 'Has name' });

    const tools = discoverDeclarativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('real-tool');
  });

  it('infers type "number" for number and range inputs', () => {
    addForm({
      toolName: 'numbers',
      toolDescription: 'Numeric inputs',
      fields: [
        { name: 'count', type: 'number' },
        { name: 'volume', type: 'range' },
      ],
    });

    const tools = discoverDeclarativeTools();
    const props = tools[0].inputSchema?.['properties'] as Record<string, Record<string, unknown>>;
    expect(props['count'].type).toBe('number');
    expect(props['volume'].type).toBe('number');
  });

  it('infers type "boolean" for checkbox inputs', () => {
    addForm({
      toolName: 'prefs',
      toolDescription: 'Preferences',
      fields: [{ name: 'darkMode', type: 'checkbox' }],
    });

    const tools = discoverDeclarativeTools();
    const props = tools[0].inputSchema?.['properties'] as Record<string, Record<string, unknown>>;
    expect(props['darkMode'].type).toBe('boolean');
  });

  it('defaults to type "string" for text and other input types', () => {
    addForm({
      toolName: 'misc',
      toolDescription: 'Misc',
      fields: [
        { name: 'field1', type: 'text' },
        { name: 'field2', type: 'email' },
        { name: 'field3' }, // no type attribute at all
      ],
    });

    const tools = discoverDeclarativeTools();
    const props = tools[0].inputSchema?.['properties'] as Record<string, Record<string, unknown>>;
    expect(props['field1'].type).toBe('string');
    expect(props['field2'].type).toBe('string');
    expect(props['field3'].type).toBe('string');
  });

  it('discovers select and textarea elements as fields', () => {
    addForm({
      toolName: 'feedback',
      toolDescription: 'Leave feedback',
      fields: [
        { name: 'category', tag: 'select', paramDescription: 'Category' },
        { name: 'body', tag: 'textarea', paramDescription: 'Your feedback' },
      ],
    });

    const tools = discoverDeclarativeTools();
    const props = tools[0].inputSchema?.['properties'] as Record<string, Record<string, unknown>>;
    expect(props['category']).toEqual({ type: 'string', description: 'Category' });
    expect(props['body']).toEqual({ type: 'string', description: 'Your feedback' });
  });

  it('uses empty string as description when tool-description is absent', () => {
    addForm({ toolName: 'no-desc' });

    const tools = discoverDeclarativeTools();
    expect(tools[0].description).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// discoverImperativeTools()
// ═════════════════════════════════════════════════════════════════════════════════

describe('discoverImperativeTools', () => {
  it('discovers tools via navigator.modelContextTesting.listTools()', () => {
    stubModelContextTesting({
      listTools: () => [
        {
          name: 'summarize',
          description: 'Summarize text',
          inputSchema: JSON.stringify({ type: 'object', properties: { text: { type: 'string' } } }),
        },
      ],
    });

    const tools = discoverImperativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'summarize',
      description: 'Summarize text',
      source: 'imperative',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    });
  });

  it('discovers tools via navigator.modelContext.listTools() when testing API is absent', () => {
    stubModelContext({
      listTools: () => [
        {
          name: 'translate',
          description: 'Translate text',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
        },
      ],
    });

    const tools = discoverImperativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'translate',
      description: 'Translate text',
      source: 'imperative',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    });
  });

  it('prefers modelContextTesting over modelContext when both are present', () => {
    stubModelContextTesting({
      listTools: () => [{ name: 'from-testing', description: 'Testing API' }],
    });
    stubModelContext({
      listTools: () => [{ name: 'from-mc', description: 'ModelContext API' }],
    });

    const tools = discoverImperativeTools();
    // modelContextTesting returns early, so modelContext is not consulted
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('from-testing');
  });

  it('returns empty array when neither API is available', () => {
    const tools = discoverImperativeTools();
    expect(tools).toEqual([]);
  });

  it('handles malformed inputSchema JSON gracefully', () => {
    stubModelContextTesting({
      listTools: () => [{ name: 'broken', description: 'Bad schema', inputSchema: '{{not json}}' }],
    });

    const tools = discoverImperativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].inputSchema).toBeUndefined();
  });

  it('handles tool with no inputSchema', () => {
    stubModelContextTesting({
      listTools: () => [{ name: 'simple', description: 'No schema' }],
    });

    const tools = discoverImperativeTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].inputSchema).toBeUndefined();
  });

  it('uses empty string for missing description in modelContext API', () => {
    stubModelContext({
      listTools: () => [{ name: 'no-desc' }],
    });

    const tools = discoverImperativeTools();
    expect(tools[0].description).toBe('');
  });

  it('returns empty array when modelContextTesting.listTools throws', () => {
    stubModelContextTesting({
      listTools: () => {
        throw new Error('API unavailable');
      },
    });

    const tools = discoverImperativeTools();
    expect(tools).toEqual([]);
  });

  it('returns empty array when modelContext.listTools throws', () => {
    stubModelContext({
      listTools: () => {
        throw new Error('API unavailable');
      },
    });

    const tools = discoverImperativeTools();
    expect(tools).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// discoverAllTools()
// ═════════════════════════════════════════════════════════════════════════════════

describe('discoverAllTools', () => {
  it('combines declarative and imperative tools', () => {
    addForm({ toolName: 'form-tool', toolDescription: 'From form' });
    stubModelContextTesting({
      listTools: () => [{ name: 'api-tool', description: 'From API' }],
    });

    const result = discoverAllTools();
    expect(result.supported).toBe(true);
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name).sort()).toEqual(['api-tool', 'form-tool']);
  });

  it('deduplicates by name, imperative overrides declarative', () => {
    addForm({
      toolName: 'search',
      toolDescription: 'Declarative search',
      fields: [{ name: 'q' }],
    });
    stubModelContextTesting({
      listTools: () => [
        {
          name: 'search',
          description: 'Imperative search',
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
    expect(result.tools[0].description).toBe('Imperative search');
  });

  it('returns empty tools on a blank page with no APIs', () => {
    const result = discoverAllTools();
    expect(result.supported).toBe(false);
    expect(result.tools).toHaveLength(0);
  });

  it('sets supported to true when declarative tools exist but no imperative API', () => {
    addForm({ toolName: 'declarative-only', toolDescription: 'Form only' });

    const result = discoverAllTools();
    expect(result.supported).toBe(true);
  });

  it('sets supported to true when modelContext is present even without tools', () => {
    stubModelContext({ listTools: () => [] });

    const result = discoverAllTools();
    expect(result.supported).toBe(true);
    expect(result.tools).toHaveLength(0);
  });

  it('includes url and timestamp in the result', () => {
    const before = Date.now();
    const result = discoverAllTools();
    const after = Date.now();

    expect(result.url).toBe(window.location.href);
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// callTool()
// ═════════════════════════════════════════════════════════════════════════════════

describe('callTool', () => {
  it('invokes via modelContextTesting.executeTool when available', async () => {
    const executeTool = vi.fn().mockResolvedValue(JSON.stringify({ answer: 42 }));
    stubModelContextTesting({ executeTool });

    const response = await callTool({ name: 'compute', arguments: { x: 10 } });

    expect(executeTool).toHaveBeenCalledWith('compute', JSON.stringify({ x: 10 }));
    expect(response).toEqual({ success: true, result: { answer: 42 } });
  });

  it('handles null result from executeTool', async () => {
    stubModelContextTesting({ executeTool: vi.fn().mockResolvedValue(null) });

    const response = await callTool({ name: 'noop' });
    expect(response).toEqual({ success: true, result: null });
  });

  it('returns error when executeTool throws', async () => {
    stubModelContextTesting({
      executeTool: vi.fn().mockRejectedValue(new Error('Tool crashed')),
    });

    const response = await callTool({ name: 'crash' });
    expect(response).toEqual({ success: false, error: 'Tool crashed' });
  });

  it('invokes via modelContext.callTool when testing API is absent', async () => {
    const callToolMock = vi.fn().mockResolvedValue({ data: 'hello' });
    stubModelContext({ callTool: callToolMock });

    const response = await callTool({ name: 'greet', arguments: { who: 'world' } });

    expect(callToolMock).toHaveBeenCalledWith({ name: 'greet', arguments: { who: 'world' } });
    expect(response).toEqual({ success: true, result: { data: 'hello' } });
  });

  it('returns error when modelContext.callTool throws', async () => {
    stubModelContext({
      callTool: vi.fn().mockRejectedValue(new Error('MC error')),
    });

    const response = await callTool({ name: 'fail' });
    expect(response).toEqual({ success: false, error: 'MC error' });
  });

  it('falls back to declarative form submission when no imperative API exists', async () => {
    const form = addForm({
      toolName: 'contact',
      toolDescription: 'Contact form',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'message', tag: 'textarea' },
      ],
    });

    // Prevent actual form submission in jsdom
    form.requestSubmit = vi.fn();

    const response = await callTool({
      name: 'contact',
      arguments: { email: 'test@example.com', message: 'Hello' },
    });

    expect(response).toEqual({
      success: true,
      result: { submitted: true, toolName: 'contact' },
    });
    expect(form.requestSubmit).toHaveBeenCalled();

    // Verify form fields were filled
    const emailInput = form.querySelector('[name="email"]') as HTMLInputElement;
    const messageTextarea = form.querySelector('[name="message"]') as HTMLTextAreaElement;
    expect(emailInput.value).toBe('test@example.com');
    expect(messageTextarea.value).toBe('Hello');
  });

  it('dispatches input and change events when filling form fields', async () => {
    const form = addForm({
      toolName: 'evented',
      toolDescription: 'Event test',
      fields: [{ name: 'val' }],
    });
    form.requestSubmit = vi.fn();

    const inputField = form.querySelector('[name="val"]') as HTMLInputElement;
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    inputField.addEventListener('input', inputHandler);
    inputField.addEventListener('change', changeHandler);

    await callTool({ name: 'evented', arguments: { val: 'hello' } });

    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
  });

  it('returns error when form submission throws', async () => {
    const form = addForm({ toolName: 'bad-form', toolDescription: 'Broken' });
    form.requestSubmit = vi.fn().mockImplementation(() => {
      throw new Error('Submit failed');
    });

    const response = await callTool({ name: 'bad-form' });
    expect(response).toEqual({ success: false, error: 'Submit failed' });
  });

  it('returns tool-not-found error when no matching tool exists', async () => {
    const response = await callTool({ name: 'nonexistent' });
    expect(response).toEqual({
      success: false,
      error: 'Tool "nonexistent" not found on this page',
    });
  });

  it('defaults arguments to empty object when not provided', async () => {
    const executeTool = vi.fn().mockResolvedValue(null);
    stubModelContextTesting({ executeTool });

    await callTool({ name: 'no-args' });

    expect(executeTool).toHaveBeenCalledWith('no-args', '{}');
  });

  it('handles non-Error thrown values in executeTool', async () => {
    stubModelContextTesting({
      executeTool: vi.fn().mockRejectedValue('string error'),
    });

    const response = await callTool({ name: 'str-throw' });
    expect(response).toEqual({ success: false, error: 'string error' });
  });

  it('handles non-Error thrown values in modelContext.callTool', async () => {
    stubModelContext({
      callTool: vi.fn().mockRejectedValue(404),
    });

    const response = await callTool({ name: 'num-throw' });
    expect(response).toEqual({ success: false, error: '404' });
  });
});

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type UtilsModule = typeof import('../src/utils');
type WebMcpModule = typeof import('../src/webmcp');

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      onMessage: { addListener: () => undefined },
      sendMessage: () => Promise.resolve({ success: true }),
      lastError: undefined,
      getManifest: () => ({ version: '1.2.0' }),
    },
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(undefined),
      },
    },
  };
});

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<UtilsModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    isValidSelector: vi.fn().mockReturnValue(true),
    isSafeUrl: vi.fn().mockReturnValue(true),
    isLocalUrl: vi.fn().mockReturnValue(false),
    sanitizeInput: vi.fn((s: string) => s),
  },
}));

vi.mock('../src/jobAutofill', () => ({
  runPlatformJobAutofill: vi.fn().mockResolvedValue({ success: true, filledCount: 0 }),
}));

vi.mock('../src/webmcp', async (importOriginal) => ({
  ...(await importOriginal<WebMcpModule>()),
  discoverAllTools: vi.fn(() => ({ supported: false, tools: [], url: '', timestamp: 0 })),
  callTool: vi.fn().mockResolvedValue({ success: true }),
  startToolChangeReporting: vi.fn(),
}));

vi.mock('../src/page-metadata', () => ({
  extractPageMetadata: vi.fn(() => ({ url: '', title: '' })),
}));

import { handleMessage } from '../src/content.ts';

interface RecordedAction {
  type: string;
  selector: string;
  value?: string;
}

function dispatch(message: Record<string, unknown>): Promise<{ actions?: RecordedAction[] }> {
  return new Promise((resolve) => {
    handleMessage(message, {} as chrome.runtime.MessageSender, (response) =>
      resolve(response as { actions?: RecordedAction[] }),
    );
  });
}

async function recordInput(attributes: {
  type?: string;
  autocomplete?: string;
  name?: string;
  value: string;
}): Promise<RecordedAction | undefined> {
  document.body.innerHTML = '<input id="field">';
  const input = document.getElementById('field') as HTMLInputElement;
  if (attributes.type) input.type = attributes.type;
  if (attributes.autocomplete) input.setAttribute('autocomplete', attributes.autocomplete);
  if (attributes.name) input.setAttribute('name', attributes.name);
  await dispatch({ type: 'START_RECORDING' });
  input.value = attributes.value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const { actions } = await dispatch({ type: 'STOP_RECORDING' });
  return actions?.find((action) => action.type === 'input' && action.selector === '#field');
}

beforeEach(async () => {
  await dispatch({ type: 'SET_RECORDING_VALUE_CAPTURE', enabled: true });
});

afterEach(async () => {
  await dispatch({ type: 'SET_RECORDING_VALUE_CAPTURE', enabled: false });
  document.body.innerHTML = '';
});

describe('C-05 recorder value sanitization (content-script recorder)', () => {
  describe('password fields are dropped entirely', () => {
    it('records no value for <input type="password">', async () => {
      const action = await recordInput({ type: 'password', value: 'hunter2' });
      expect(action).toBeDefined();
      expect(action).not.toHaveProperty('value');
    });

    it('records no value even when the password field has autocomplete', async () => {
      const action = await recordInput({
        type: 'password',
        autocomplete: 'new-password',
        value: 'x',
      });
      expect(action).not.toHaveProperty('value');
    });
  });

  describe('autocomplete-tagged protected fields record no value', () => {
    it.each([
      ['cc-number', '4111111111111111'],
      ['cc-csc', '123'],
      ['cc-exp-month', '12'],
      ['current-password', 'secret'],
      ['new-password', 'secret'],
      ['one-time-code', '482931'],
      ['CURRENT-PASSWORD', 'x'],
    ])('drops %s', async (autocomplete, value) => {
      const action = await recordInput({ autocomplete, value });
      expect(action).toBeDefined();
      expect(action).not.toHaveProperty('value');
    });
  });

  describe('fields the rest of the extension protects by name record no value', () => {
    it.each([
      ['otp', '123456'],
      ['cvv', '737'],
      ['ssn', '078-05-1120'],
      ['pin', '4821'],
      ['cardNumber', '4111111111111111'],
    ])('drops a field named %s', async (name, value) => {
      const action = await recordInput({ name, value });
      expect(action).toBeDefined();
      expect(action).not.toHaveProperty('value');
      expect(JSON.stringify(action)).not.toContain(value);
    });
  });

  describe('secret-shaped substrings are redacted inline', () => {
    it.each([
      ['an Anthropic API key', 'My key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'],
      ['an AWS access key', 'AKIAIOSFODNN7EXAMPLE'],
      ['a GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL'],
      [
        'a bearer JWT',
        'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXZhbHVlLWhlcmU',
      ],
    ])('redacts %s', async (_label, value) => {
      const secret = value.split(' ').at(-1)!;
      const recorded = (await recordInput({ value }))?.value;
      expect(recorded).toBeDefined();
      expect(recorded).not.toContain(secret);
    });

    it('leaves benign text unchanged', async () => {
      expect((await recordInput({ value: 'Hello, world!' }))?.value).toBe('Hello, world!');
    });
  });

  it('records an empty value as empty', async () => {
    expect((await recordInput({ value: '' }))?.value).toBe('');
  });

  it('records no value at all while value capture is off', async () => {
    await dispatch({ type: 'SET_RECORDING_VALUE_CAPTURE', enabled: false });
    const action = await recordInput({ value: 'Hello, world!' });
    expect(action).toBeDefined();
    expect(action).not.toHaveProperty('value');
  });
});

describe('recorded clicks name exactly one element', () => {
  it('records a selector that matches only the clicked row, not the first look-alike', async () => {
    document.body.innerHTML =
      '<ul><li><button class="btn">Delete</button></li><li><button class="btn">Delete</button></li><li><button class="btn">Delete</button></li></ul>';
    const third = document.querySelectorAll('button.btn')[2] as HTMLButtonElement;
    const reported = vi.spyOn(chrome.runtime, 'sendMessage');
    await dispatch({ type: 'START_RECORDING' });
    third.click();
    const { actions } = await dispatch({ type: 'STOP_RECORDING' });

    const click = actions?.find((action) => action.type === 'click');
    expect(click).toBeDefined();
    expect(Array.from(document.querySelectorAll(click!.selector))).toEqual([third]);
    expect(reported).toHaveBeenCalledWith({
      type: 'RECORDING_ACTION',
      action: expect.objectContaining({ type: 'click', selector: click!.selector }),
    });
    reported.mockRestore();
  });

  it('refuses to replay a click whose selector now matches several elements', async () => {
    document.body.innerHTML =
      '<button class="btn">Delete</button><button class="btn">Delete</button><button class="btn">Delete</button>';
    const { domUtils } = await import('../src/utils');
    vi.mocked(domUtils.safeClick).mockClear();

    const response = (await dispatch({
      type: 'RUN_PAGE_ACTIONS',
      taskId: 'replay',
      actions: [{ id: 'a1', type: 'click', selector: 'button.btn' }],
    })) as { success?: boolean; error?: string };

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/matches 3 elements/);
    expect(domUtils.safeClick).not.toHaveBeenCalled();
  });
});

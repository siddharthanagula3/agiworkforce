/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/utils', () => ({
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

vi.mock('../src/webmcp', () => ({
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
  value: string;
}): Promise<RecordedAction | undefined> {
  document.body.innerHTML = '<input id="field">';
  const input = document.getElementById('field') as HTMLInputElement;
  if (attributes.type) input.type = attributes.type;
  if (attributes.autocomplete) input.setAttribute('autocomplete', attributes.autocomplete);
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

  describe('autocomplete-tagged sensitive fields are redacted to a placeholder', () => {
    it.each([
      ['cc-number', '4111111111111111'],
      ['cc-csc', '123'],
      ['cc-exp-month', '12'],
      ['current-password', 'secret'],
      ['new-password', 'secret'],
      ['one-time-code', '482931'],
      ['CURRENT-PASSWORD', 'x'],
    ])('redacts %s', async (autocomplete, value) => {
      expect((await recordInput({ autocomplete, value }))?.value).toBe('[REDACTED]');
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

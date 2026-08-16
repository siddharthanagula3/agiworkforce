/**
 * Tests for utility functions in src/utils.ts.
 *
 * Covers: logger, sleep, withTimeout, RateLimiter, domUtils, formUtils,
 * storageUtils, and validators.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logger,
  sleep,
  withTimeout,
  RateLimiter,
  domUtils,
  formUtils,
  storageUtils,
  validators,
} from '../src/utils';

const _storageData: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: _storageData[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(_storageData, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete _storageData[key];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(_storageData)) delete _storageData[k];
      }),
    },
  },
};

(globalThis as Record<string, unknown>).chrome = chromeMock;

function clearBody(): void {
  document.body.innerHTML = '';
}

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger.debug calls console.debug with [AGI Workforce] prefix', () => {
    logger.debug('test message', { key: 'val' });
    expect(console.debug).toHaveBeenCalledWith('[AGI Workforce] %s', 'test message', {
      key: 'val',
    });
  });

  it('logger.info calls console.info with [AGI Workforce] prefix', () => {
    logger.info('info msg');
    // eslint-disable-next-line no-console
    expect(console.info).toHaveBeenCalledWith('[AGI Workforce] %s', 'info msg', undefined);
  });

  it('logger.warn calls console.warn with [AGI Workforce] prefix', () => {
    logger.warn('warn msg', 'extra');
    expect(console.warn).toHaveBeenCalledWith('[AGI Workforce] %s', 'warn msg', 'extra');
  });

  it('logger.error calls console.error with [AGI Workforce] prefix', () => {
    const err = new Error('oops');
    logger.error('error msg', err);
    expect(console.error).toHaveBeenCalledWith('[AGI Workforce] %s', 'error msg', err);
  });
});

describe('sleep', () => {
  it('resolves after approximately the specified milliseconds', async () => {
    vi.useFakeTimers();
    const promise = sleep(500);
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();
  });

  it('returns a Promise', () => {
    vi.useFakeTimers();
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
    vi.advanceTimersByTime(10);
    vi.useRealTimers();
  });

  it('sleep(0) resolves immediately', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('withTimeout', () => {
  it('resolves with the promise value when it completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it('rejects with a timeout error when the promise is too slow', async () => {
    vi.useFakeTimers();

    const slowPromise = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 5000));
    const racePromise = withTimeout(slowPromise, 100);

    vi.advanceTimersByTime(100);

    await expect(racePromise).rejects.toThrow('Operation timed out after 100ms');
    vi.useRealTimers();
  });

  it('clears the timeout after resolution to avoid memory leaks', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve('done'), 5000);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('uses 30000ms as the default timeout', async () => {
    vi.useFakeTimers();

    const neverResolves = new Promise<never>(() => {});
    const racePromise = withTimeout(neverResolves);

    vi.advanceTimersByTime(30000);

    await expect(racePromise).rejects.toThrow('Operation timed out after 30000ms');
    vi.useRealTimers();
  });

  it('propagates rejection from the wrapped promise', async () => {
    const failing = Promise.reject(new Error('upstream failure'));
    await expect(withTimeout(failing, 1000)).rejects.toThrow('upstream failure');
  });
});

describe('RateLimiter', () => {
  it('returns false (not limited) on first call for a new key', () => {
    const limiter = new RateLimiter(10);
    expect(limiter.isLimited(1, 'CLICK')).toBe(false);
  });

  it('limits after maxRequestsPerMinute calls', () => {
    const limiter = new RateLimiter(3);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
    expect(limiter.isLimited(1, 'TYPE')).toBe(true);
  });

  it('tracks separate limits per tab and message type', () => {
    const limiter = new RateLimiter(2);
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    expect(limiter.isLimited(1, 'CLICK')).toBe(true);
    expect(limiter.isLimited(2, 'CLICK')).toBe(false);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
  });

  it('enforces screenshot cooldown within the cooldown window', () => {
    const limiter = new RateLimiter(120, 500);
    expect(limiter.isLimited(1, 'CAPTURE_SCREENSHOT')).toBe(false);
    expect(limiter.isLimited(1, 'CAPTURE_SCREENSHOT')).toBe(false);
    expect(limiter.isLimited(1, 'CAPTURE_SCREENSHOT')).toBe(true);
  });

  it('allows screenshot after cooldown period has elapsed', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(120, 500);
    limiter.isLimited(1, 'CAPTURE_SCREENSHOT');
    limiter.isLimited(1, 'CAPTURE_SCREENSHOT');
    vi.advanceTimersByTime(501);
    expect(limiter.isLimited(1, 'CAPTURE_SCREENSHOT')).toBe(false);
    vi.useRealTimers();
  });

  it('reset() clears only entries for the given tab', () => {
    const limiter = new RateLimiter(2);
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(2, 'CLICK');
    limiter.isLimited(2, 'CLICK');
    limiter.isLimited(2, 'CLICK');

    limiter.reset(1);

    expect(limiter.isLimited(1, 'CLICK')).toBe(false);
    expect(limiter.isLimited(2, 'CLICK')).toBe(true);
  });

  it('clear() removes all state', () => {
    const limiter = new RateLimiter(2);
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    limiter.isLimited(1, 'CLICK');
    limiter.clear();
    expect(limiter.isLimited(1, 'CLICK')).toBe(false);
  });

  it('resets count when one minute window expires', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(2);
    limiter.isLimited(1, 'TYPE');
    limiter.isLimited(1, 'TYPE');
    limiter.isLimited(1, 'TYPE');
    expect(limiter.isLimited(1, 'TYPE')).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(limiter.isLimited(1, 'TYPE')).toBe(false);
    vi.useRealTimers();
  });
});

describe('domUtils', () => {
  beforeEach(clearBody);
  afterEach(clearBody);

  describe('querySelector', () => {
    it('returns a matching element', () => {
      document.body.innerHTML = '<div id="target">Hello</div>';
      expect(domUtils.querySelector('#target')).not.toBeNull();
    });

    it('returns null when element is not found', () => {
      expect(domUtils.querySelector('#does-not-exist')).toBeNull();
    });

    it('returns null for an invalid CSS selector instead of throwing', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(domUtils.querySelector('##invalid##')).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('querySelectorAll', () => {
    it('returns all matching elements', () => {
      document.body.innerHTML = '<span class="item">A</span><span class="item">B</span>';
      expect(domUtils.querySelectorAll('.item')).toHaveLength(2);
    });

    it('returns empty array when nothing matches', () => {
      expect(domUtils.querySelectorAll('.missing')).toEqual([]);
    });

    it('returns empty array for an invalid selector', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(domUtils.querySelectorAll('##bad')).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  describe('waitForSelector', () => {
    it('resolves immediately when element already exists', async () => {
      document.body.innerHTML = '<div id="ready"></div>';
      const el = await domUtils.waitForSelector('#ready', 1000);
      expect(el).not.toBeNull();
    });

    it('returns null when element never appears within timeout', async () => {
      const el = await domUtils.waitForSelector('#nonexistent', 50);
      expect(el).toBeNull();
    });

    it('returns null when visible=true but element has zero dimensions (jsdom)', async () => {
      document.body.innerHTML = '<div id="vis" style="width:100px;height:100px"></div>';
      const el = await domUtils.waitForSelector('#vis', 50, true);
      expect(el).toBeNull();
    });
  });

  describe('safeClick', () => {

    it('returns false and logs error when MouseEvent constructor throws (jsdom limitation)', () => {
      document.body.innerHTML = '<button id="btn">Click</button>';
      const btn = document.getElementById('btn')!;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = domUtils.safeClick(btn);
      expect(typeof result).toBe('boolean');
      expect(console.error).toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('returns false for right-button click in jsdom (same MouseEvent constructor limitation)', () => {
      document.body.innerHTML = '<div id="box"></div>';
      const box = document.getElementById('box')!;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = domUtils.safeClick(box, 'right');
      expect(typeof result).toBe('boolean');
      vi.restoreAllMocks();
    });
  });

  describe('getText', () => {
    it('returns text content of an element', () => {
      document.body.innerHTML = '<p id="p">Hello World</p>';
      const el = document.getElementById('p')!;
      expect(domUtils.getText(el)).toBe('Hello World');
    });

    it('returns empty string for null element', () => {
      expect(domUtils.getText(null)).toBe('');
    });
  });

  describe('getElementRect', () => {
    it('returns null for null element', () => {
      expect(domUtils.getElementRect(null)).toBeNull();
    });

    it('returns a DOMRect-like object for a real element', () => {
      document.body.innerHTML = '<div id="r"></div>';
      const el = document.getElementById('r')!;
      const rect = domUtils.getElementRect(el);
      expect(rect).not.toBeNull();
      expect(typeof rect!.width).toBe('number');
      expect(typeof rect!.height).toBe('number');
    });
  });

  describe('scrollIntoView', () => {
    it('returns true when called on a valid element', () => {
      document.body.innerHTML = '<div id="s">Scroll target</div>';
      const el = document.getElementById('s')!;
      el.scrollIntoView = vi.fn();
      expect(domUtils.scrollIntoView(el)).toBe(true);
    });
  });

  describe('isVisible', () => {
    it('returns false for null', () => {
      expect(domUtils.isVisible(null)).toBe(false);
    });

    it('returns false for zero-dimension elements (jsdom default)', () => {
      document.body.innerHTML = '<div id="hidden"></div>';
      const el = document.getElementById('hidden')!;
      expect(domUtils.isVisible(el)).toBe(false);
    });
  });
});

describe('formUtils', () => {
  beforeEach(clearBody);
  afterEach(clearBody);

  describe('getForms', () => {
    it('returns all forms on the page', () => {
      document.body.innerHTML = '<form id="f1"></form><form id="f2"></form>';
      expect(formUtils.getForms()).toHaveLength(2);
    });

    it('returns empty array when no forms exist', () => {
      expect(formUtils.getForms()).toEqual([]);
    });
  });

  describe('getFormFields', () => {
    it('returns inputs, selects, and textareas from a form', () => {
      document.body.innerHTML = `
        <form id="myForm">
          <input name="a" />
          <select name="b"><option>1</option></select>
          <textarea name="c"></textarea>
        </form>
      `;
      const form = document.getElementById('myForm') as HTMLFormElement;
      expect(formUtils.getFormFields(form)).toHaveLength(3);
    });

    it('searches entire document when form is null', () => {
      document.body.innerHTML = '<input name="x" /><input name="y" />';
      expect(formUtils.getFormFields(null)).toHaveLength(2);
    });
  });

  describe('fillField', () => {
    it('fills an input field and dispatches change/input events', () => {
      document.body.innerHTML = '<input id="inp" name="q" />';
      const input = document.getElementById('inp') as HTMLInputElement;
      const changeHandler = vi.fn();
      const inputHandler = vi.fn();
      input.addEventListener('change', changeHandler);
      input.addEventListener('input', inputHandler);

      const result = formUtils.fillField(input, 'hello');

      expect(result).toBe(true);
      expect(input.value).toBe('hello');
      expect(changeHandler).toHaveBeenCalledTimes(1);
      expect(inputHandler).toHaveBeenCalledTimes(1);
    });

    it('fills a select field and dispatches change event', () => {
      document.body.innerHTML = `
        <select id="sel">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      `;
      const sel = document.getElementById('sel') as HTMLSelectElement;
      const changeHandler = vi.fn();
      sel.addEventListener('change', changeHandler);

      const result = formUtils.fillField(sel, 'b');
      expect(result).toBe(true);
      expect(sel.value).toBe('b');
      expect(changeHandler).toHaveBeenCalledTimes(1);
    });

    it('fills a textarea and dispatches change/input events', () => {
      document.body.innerHTML = '<textarea id="ta"></textarea>';
      const ta = document.getElementById('ta') as HTMLTextAreaElement;
      const result = formUtils.fillField(ta, 'multi\nline');
      expect(result).toBe(true);
      expect(ta.value).toBe('multi\nline');
    });
  });

  describe('submitForm', () => {
    it('submits the given form via requestSubmit and returns true (L-02)', () => {
      document.body.innerHTML = '<form id="f"></form>';
      const form = document.getElementById('f') as HTMLFormElement;
      form.requestSubmit = vi.fn();
      expect(formUtils.submitForm(form)).toBe(true);
      expect(form.requestSubmit).toHaveBeenCalled();
    });

    it('submits the first form when no form argument is given (L-02)', () => {
      document.body.innerHTML = '<form id="first"></form><form id="second"></form>';
      const first = document.getElementById('first') as HTMLFormElement;
      const second = document.getElementById('second') as HTMLFormElement;
      first.requestSubmit = vi.fn();
      second.requestSubmit = vi.fn();

      formUtils.submitForm(null);
      expect(first.requestSubmit).toHaveBeenCalled();
      expect(second.requestSubmit).not.toHaveBeenCalled();
    });

    it('falls back to submit() when requestSubmit is missing', () => {
      document.body.innerHTML = '<form id="legacy"></form>';
      const form = document.getElementById('legacy') as HTMLFormElement;
      (form as unknown as { requestSubmit?: undefined }).requestSubmit = undefined;
      form.submit = vi.fn();
      expect(formUtils.submitForm(form)).toBe(true);
      expect(form.submit).toHaveBeenCalled();
    });

    it('returns true even when no form is present in the document', () => {
      expect(formUtils.submitForm(null)).toBe(true);
    });
  });
});

describe('storageUtils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const k of Object.keys(_storageData)) delete _storageData[k];

    chromeMock.storage.local.get.mockImplementation(async (key: string) => ({
      [key]: _storageData[key],
    }));
    chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(_storageData, items);
    });
    chromeMock.storage.local.remove.mockImplementation(async (key: string) => {
      delete _storageData[key];
    });
    chromeMock.storage.local.clear.mockImplementation(async () => {
      for (const k of Object.keys(_storageData)) delete _storageData[k];
    });
  });

  it('getItem returns stored value', async () => {
    _storageData['myKey'] = { count: 5 };
    const result = await storageUtils.getItem<{ count: number }>('myKey');
    expect(result).toEqual({ count: 5 });
  });

  it('getItem returns defaultValue when key is missing', async () => {
    const result = await storageUtils.getItem<number>('missing', 99);
    expect(result).toBe(99);
  });

  it('getItem returns defaultValue on storage error', async () => {
    chromeMock.storage.local.get.mockRejectedValue(new Error('quota exceeded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await storageUtils.getItem('badKey', 'default');
    expect(result).toBe('default');
    vi.restoreAllMocks();
  });

  it('setItem stores a value that can be retrieved', async () => {
    await storageUtils.setItem('theme', 'dark');
    expect(_storageData['theme']).toBe('dark');
  });

  it('setItem handles storage errors gracefully', async () => {
    chromeMock.storage.local.set.mockRejectedValue(new Error('storage full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storageUtils.setItem('key', 'val')).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it('removeItem deletes a key', async () => {
    _storageData['toRemove'] = 'bye';
    await storageUtils.removeItem('toRemove');
    expect(_storageData['toRemove']).toBeUndefined();
  });

  it('removeItem handles errors gracefully', async () => {
    chromeMock.storage.local.remove.mockRejectedValue(new Error('error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storageUtils.removeItem('key')).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it('clear empties all stored data', async () => {
    _storageData['a'] = 1;
    _storageData['b'] = 2;
    await storageUtils.clear();
    expect(Object.keys(_storageData)).toHaveLength(0);
  });

  it('clear handles errors gracefully', async () => {
    chromeMock.storage.local.clear.mockRejectedValue(new Error('error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storageUtils.clear()).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe('validators', () => {
  describe('isSafeUrl', () => {
    it('returns true for https URLs', () => {
      expect(validators.isSafeUrl('https://example.com')).toBe(true);
    });

    it('returns true for http URLs', () => {
      expect(validators.isSafeUrl('http://example.com')).toBe(true);
    });

    it('returns false for chrome: URLs', () => {
      expect(validators.isSafeUrl('chrome://settings')).toBe(false);
    });

    it('returns false for about: URLs', () => {
      expect(validators.isSafeUrl('about:blank')).toBe(false);
    });

    it('returns false for data: URLs', () => {
      expect(validators.isSafeUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    });

    it('returns false for javascript: URLs', () => {
      expect(validators.isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    it('returns false for file: URLs', () => {
      expect(validators.isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    it('returns false for a completely malformed URL', () => {
      expect(validators.isSafeUrl('not a url')).toBe(false);
    });
  });

  describe('isLocalUrl', () => {
    it('returns true for http://localhost', () => {
      expect(validators.isLocalUrl('http://localhost:8787')).toBe(true);
    });

    it('returns true for http://127.0.0.1', () => {
      expect(validators.isLocalUrl('http://127.0.0.1:3000')).toBe(true);
    });

    it('returns true for ws://localhost (normalized to http)', () => {
      expect(validators.isLocalUrl('ws://localhost:8787')).toBe(true);
    });

    it('returns true for wss://127.0.0.1 (normalized to https)', () => {
      expect(validators.isLocalUrl('wss://127.0.0.1:8787')).toBe(true);
    });

    it('returns false for a remote URL', () => {
      expect(validators.isLocalUrl('https://example.com')).toBe(false);
    });

    it('returns false for a malformed URL', () => {
      expect(validators.isLocalUrl('not a url')).toBe(false);
    });
  });

  describe('isValidSelector', () => {
    it('returns true for a valid CSS selector', () => {
      expect(validators.isValidSelector('#myId')).toBe(true);
    });

    it('returns true for a class selector', () => {
      expect(validators.isValidSelector('.my-class')).toBe(true);
    });

    it('returns true for a complex selector', () => {
      expect(validators.isValidSelector('div > span.active[aria-label]')).toBe(true);
    });

    it('rejects selectors containing expression-injection metacharacters (M-11)', () => {
      expect(validators.isValidSelector('{evil}')).toBe(false);
      expect(validators.isValidSelector('foo; bar')).toBe(false);
      expect(validators.isValidSelector('`tickmark`')).toBe(false);
    });

    it('returns false for an empty string (M-11)', () => {
      expect(validators.isValidSelector('')).toBe(false);
    });

    it('returns false for an overly long selector (M-11 DoS guard)', () => {
      expect(validators.isValidSelector('a'.repeat(2049))).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('HTML-encodes script tags', () => {
      const result = validators.sanitizeInput('<script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('HTML-encodes angle brackets', () => {
      const result = validators.sanitizeInput('<b>bold</b>');
      expect(result).toContain('&lt;b&gt;');
    });

    it('returns safe plain text unchanged', () => {
      const safe = 'Hello, World!';
      expect(validators.sanitizeInput(safe)).toBe(safe);
    });

    it('encodes ampersands', () => {
      expect(validators.sanitizeInput('a & b')).toContain('&amp;');
    });
  });
});

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';

let dom: JSDOM;
const objects = new Map<string, Element>();
let sequence = 0;
let afterFocus = (_element: HTMLElement) => {};
const send = vi.fn(
  (
    _target: unknown,
    method: string,
    params: Record<string, unknown>,
    callback: (result: unknown) => void,
  ) => {
    try {
      if (method === 'Runtime.evaluate') {
        // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
        const value = dom.window.eval(String(params.expression));
        if (params.returnByValue === false && value?.nodeType === 1) {
          const objectId = `object-${++sequence}`;
          objects.set(objectId, value);
          callback({ result: { type: 'object', objectId } });
        } else callback({ result: { type: typeof value, value } });
      } else if (method === 'Runtime.callFunctionOn') {
        // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
        const fn = dom.window.eval(`(${String(params.functionDeclaration)})`);
        const value = fn.call(objects.get(String(params.objectId)));
        callback({ result: { type: typeof value, value } });
      } else if (method === 'DOM.focus') {
        const element = objects.get(String(params.objectId)) as HTMLElement;
        element.focus();
        afterFocus(element);
        callback({});
      } else callback({});
    } catch (error) {
      callback({ result: {}, exceptionDetails: { text: (error as Error).message } });
    }
  },
);

beforeEach(() => {
  dom = new JSDOM('<body></body>', { url: document.URL, runScripts: 'outside-only' });
  objects.clear();
  sequence = 0;
  afterFocus = () => {};
  send.mockClear();
  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    debugger: {
      attach: (_t: unknown, _v: unknown, cb: () => void) => cb(),
      detach: (_t: unknown, cb: () => void) => cb(),
      sendCommand: send,
      onDetach: { addListener: vi.fn() },
      onEvent: { addListener: vi.fn() },
    },
  });
});
afterEach(() => {
  driver.unregisterActiveTab(42);
  dom.window.close();
  vi.unstubAllGlobals();
});

function indexFor(label: string): number {
  return [...driver.getElementIndexMap(42)].find(([index]) =>
    driver.resolveIndexedElement(42, index)?.signature.endsWith(`|${label}`),
  )![0];
}
function commands(method: string) {
  return send.mock.calls.filter((call) => call[1] === method).map((call) => call[2]);
}
function framedInput(label: string) {
  const frame = dom.window.document.createElement('iframe');
  dom.window.document.body.append(frame);
  const child = frame.contentDocument!;
  const host = child.createElement('div');
  child.body.append(host);
  const input = child.createElement('input');
  input.setAttribute('aria-label', label);
  host.attachShadow({ mode: 'open' }).append(input);
  return { frame, child, input };
}

describe('production serialized DOM targeting', () => {
  it('indexes, resolves, focuses and reads an actual iframe/open-shadow input without clicking', async () => {
    const { input } = framedInput('Frame name');
    input.value = 'Current actual value';
    const summary = await driver.getPageContent(42);
    expect(summary).toContain('label="Frame name"');
    const index = indexFor('Frame name');
    const locator = driver.resolveIndexedSelector(42, index)!;
    expect(locator).toContain('@agi-dom:');
    expect(await driver.getFieldValue(42, locator)).toBe('Current actual value');
    await driver.type(
      42,
      'Attempted input',
      index,
      undefined,
      driver.resolveIndexedElement(42, index)!.signature,
    );
    expect(dom.window.document.activeElement?.localName).toBe('iframe');
    expect(input.getRootNode()).toHaveProperty('activeElement', input);
    expect(commands('DOM.focus')).toHaveLength(1);
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
    expect(commands('Input.insertText')).toEqual([{ text: 'Attempted input' }]);
  });

  it('indexes a contentEditable textbox and a custom widget keyboard control', async () => {
    dom.window.document.body.innerHTML =
      '<div contenteditable="true" role="textbox" tabindex="0" aria-label="Editable note"></div><div role="combobox" tabindex="0" aria-label="Custom choice"></div>';
    const editable = dom.window.document.querySelector<HTMLElement>('[contenteditable]')!;
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    await driver.getPageContent(42);
    await driver.type(42, 'Note', indexFor('Editable note'));
    await driver.pressKey(42, 'ArrowDown', [], indexFor('Custom choice'));
    expect(commands('Input.insertText')).toEqual([{ text: 'Note' }]);
    expect(commands('Input.dispatchKeyEvent')).toHaveLength(2);
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('refuses an original iframe input replaced while receiving focus', async () => {
    const { input } = framedInput('Original input');
    await driver.getPageContent(42);
    afterFocus = (element) => {
      if (element === input) element.replaceWith(element.cloneNode(true));
    };
    await expect(driver.type(42, 'Private text', indexFor('Original input'))).rejects.toThrow(
      'could not receive focus',
    );
    expect(commands('Input.insertText')).toEqual([]);
  });

  it('obeys Stop during deep focus before sending text', async () => {
    framedInput('Stopped input');
    const stop = new AbortController();
    await driver.getPageContent(42);
    afterFocus = () => stop.abort(new Error('Stopped'));
    await expect(
      driver.type(42, 'Private text', indexFor('Stopped input'), stop.signal),
    ).rejects.toThrow('Stopped');
    expect(commands('Input.insertText')).toEqual([]);
  });

  it('excludes foreign frame data and refuses its focused or coordinate fallback', async () => {
    const frame = dom.window.document.createElement('iframe');
    frame.src = 'https://foreign.example/form';
    dom.window.document.body.append(frame);
    frame.contentDocument!.write('<input aria-label="Foreign secret">');
    const summary = await driver.getPageContent(42);
    expect(summary).not.toContain('Foreign secret');
    expect(summary).toContain('Some controls were not inspected');
    frame.focus();
    await expect(driver.type(42, 'Private text')).rejects.toThrow('cannot be inspected');
    await expect(driver.pressKey(42, 'Enter')).rejects.toThrow('unapproved scope');
    Object.defineProperty(dom.window.document, 'elementFromPoint', { value: () => frame });
    await expect(driver.click(42, { x: 10, y: 10 })).rejects.toThrow('unapproved scope');
    expect(commands('Input.insertText')).toEqual([]);
    expect(commands('Input.dispatchKeyEvent')).toEqual([]);
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('keeps closed interiors undisclosed and refuses text into an opaque focused host', async () => {
    const host = dom.window.document.createElement('div');
    host.tabIndex = 0;
    dom.window.document.body.append(host);
    const input = dom.window.document.createElement('input');
    input.setAttribute('aria-label', 'Closed secret');
    host.attachShadow({ mode: 'closed' }).append(input);
    const summary = await driver.getPageContent(42);
    expect(summary).not.toContain('Closed secret');
    expect(summary).toContain('Closed shadow interiors are not inspected');
    host.focus();
    await expect(driver.type(42, 'Private text')).rejects.toThrow('cannot be inspected');
    expect(commands('Input.insertText')).toEqual([]);
  });
});

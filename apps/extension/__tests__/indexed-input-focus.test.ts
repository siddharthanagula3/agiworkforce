import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture(document.location.href);
const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

const objects = new Map<string, Element>();
let objectSequence = 0;
const send = vi.fn(
  (
    target: { tabId: number },
    method: string,
    params: Record<string, unknown>,
    callback: (result: unknown) => void,
  ) => {
    if (inspection.reply(target, method, params, callback)) return;
    if (method === 'Runtime.evaluate') {
      expect(params['uniqueContextId']).toBe(inspection.uniqueContextId);
      if (String(params['expression']).includes('indexMap')) {
        callback({
          result: {
            type: 'string',
            value: JSON.stringify({
              summary: 'Synthetic focus fixture',
              indexMap: {
                1: { selector: '#name', signature: 'input||text|name|Your name' },
                2: { selector: '#button', signature: 'button||||Submit' },
              },
            }),
          },
        });
        return;
      }
      try {
        // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
        const value = new Function(`return ${String(params['expression'])};`)();
        if (params['returnByValue'] === false && value instanceof Element) {
          const objectId = `element-${++objectSequence}`;
          objects.set(objectId, value);
          callback({ result: { type: 'object', objectId } });
        } else callback({ result: { type: typeof value, value } });
      } catch (error) {
        callback({ exceptionDetails: { text: (error as Error).message }, result: {} });
      }
    } else if (method === 'Runtime.callFunctionOn') {
      // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
      const fn = new Function(`return (${String(params['functionDeclaration'])});`)();
      const value = fn.call(objects.get(String(params['objectId'])));
      callback({
        result: { type: typeof value, value },
      });
    } else if (method === 'DOM.focus') {
      (objects.get(String(params['objectId'])) as HTMLElement).focus();
      callback({});
    } else if (method === 'DOM.getBoxModel') {
      callback({ model: { content: [10, 10, 110, 10, 110, 30, 10, 30] } });
    } else callback({});
  },
);

function calls(method: string): Array<Record<string, unknown>> {
  return send.mock.calls.filter((call) => call[1] === method).map((call) => call[2]);
}

beforeEach(async () => {
  document.body.innerHTML =
    '<input id="name" type="text" name="name" aria-label="Your name" value="Keep this selection"><input id="other" type="text" name="name" aria-label="Your name"><button id="button">Submit</button>';
  const name = document.getElementById('name')!;
  vi.spyOn(name, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 10, 100, 20));
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) => (x >= 10 && x < 110 && y >= 10 && y < 30 ? name : null),
  });
  objects.clear();
  objectSequence = 0;
  inspection.reset();
  send.mockClear();
  vi.stubGlobal('chrome', {
    runtime: { lastError: null, getPlatformInfo: async () => ({ os: 'mac' }) },
    debugger: {
      attach: (_t: unknown, _v: unknown, callback: () => void) => callback(),
      detach: (_t: unknown, callback: () => void) => callback(),
      sendCommand: send,
      onDetach: { addListener: vi.fn() },
      onEvent: inspection.onEvent,
    },
  });
  await driver.getPageContent(42);
});

afterEach(() => {
  driver.unregisterActiveTab(42);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  if (originalElementFromPoint)
    Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
  else Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('indexed keyboard and typing focus', () => {
  it('preserves the selection on the exact already focused input without another focus or click', async () => {
    const input = document.getElementById('name') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    await driver.type(42, 'Replacement', 1);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(calls('DOM.focus')).toEqual([]);
    expect(calls('Input.dispatchMouseEvent')).toEqual([]);
    expect(calls('Input.insertText')).toEqual([{ text: 'Replacement' }]);
  });

  it('focuses the requested live object even when a different focused input has the same signature', async () => {
    document.getElementById('other')!.focus();
    await driver.type(42, 'New value', 1);
    expect(document.activeElement).toBe(document.getElementById('name'));
    expect(calls('DOM.focus')).toHaveLength(1);
    expect(calls('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('focuses an indexed button before a key without clicking it as a side effect', async () => {
    let clicks = 0;
    document.getElementById('button')!.addEventListener('click', () => clicks++);
    await driver.pressKey(42, 'Tab', [], 2);
    expect(document.activeElement).toBe(document.getElementById('button'));
    expect(clicks).toBe(0);
    expect(calls('Input.dispatchMouseEvent')).toEqual([]);
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(2);
  });

  it('refuses a changed indexed target before focusing or inserting text', async () => {
    document.getElementById('name')!.setAttribute('type', 'password');
    await expect(driver.type(42, 'private', 1)).rejects.toThrow('changed since read_dom');
    expect(calls('DOM.focus')).toEqual([]);
    expect(calls('Input.insertText')).toEqual([]);
  });

  it('adds the supported native selectAll command only to the macOS Meta+A chord', async () => {
    await driver.pressKey(42, 'a', ['Meta']);
    expect(calls('Input.dispatchKeyEvent')[0]).toMatchObject({ commands: ['selectAll'] });
    expect(calls('Input.dispatchKeyEvent')[1]).not.toHaveProperty('commands');
    send.mockClear();
    chrome.runtime.getPlatformInfo = vi.fn(async () => ({
      os: 'linux',
      arch: 'x86-64',
    })) as typeof chrome.runtime.getPlatformInfo;
    await driver.pressKey(42, 'a', ['Meta']);
    expect(calls('Input.dispatchKeyEvent')[0]).not.toHaveProperty('commands');
  });
});

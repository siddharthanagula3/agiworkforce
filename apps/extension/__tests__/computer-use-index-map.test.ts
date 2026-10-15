/**
 * The index map is the path the model is told to prefer over raw CSS
 * selectors, so an index that names two elements is a silent click on
 * something the model never chose, inside the user's live session.
 *
 * These tests run the real page-side expressions, the exact strings shipped
 * to Runtime.evaluate, against a jsdom document holding the shapes the old
 * builder collided on: duplicate unlabelled buttons, two inputs sharing a
 * name, and an id that is not a valid CSS identifier.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EVAL_TAB_ID = 7;

interface EvaluateParams {
  expression: string;
  returnByValue?: boolean;
}

const resolvedObjects = new Map<string, Element>();
let objectSequence = 0;

function evaluateInPage(params: EvaluateParams): Record<string, unknown> {
  try {
    const value: unknown = (0, eval)(params.expression);
    if (params.returnByValue) {
      return { result: { type: typeof value, value } };
    }
    const objectId = `obj-${++objectSequence}`;
    if (value instanceof Element) resolvedObjects.set(objectId, value);
    return { result: { type: 'object', objectId } };
  } catch (error) {
    return {
      result: { type: 'undefined' },
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: error instanceof Error ? error.message : String(error) },
      },
    };
  }
}

const chromeMock = vi.hoisted(() => ({
  runtime: { lastError: undefined as { message?: string } | undefined, id: 'test-extension' },
  storage: {
    local: {
      get: vi.fn(async () => ({ agi_site_allowlist: ['http://localhost'] })),
      set: vi.fn(async () => undefined),
    },
  },
  debugger: {
    attach: vi.fn((_target: unknown, _version: unknown, callback: () => void) => callback()),
    detach: vi.fn((_target: unknown, callback: () => void) => callback()),
    sendCommand: vi.fn(),
    onDetach: { addListener: vi.fn(), removeListener: vi.fn() },
    onEvent: {
      addListener: (listener: Parameters<typeof inspection.onEvent.addListener>[0]) =>
        inspection.onEvent.addListener(listener),
    },
  },
  tabs: { get: vi.fn(async () => ({ id: EVAL_TAB_ID, url: 'http://localhost/form' })) },
}));

vi.stubGlobal('chrome', chromeMock);

import {
  buildIndexedElementExpression,
  getElementIndexMap,
  getPageContent,
  click,
  getTargetSignature,
  unregisterActiveTab,
} from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture('http://localhost/form');

const PAGE_HTML = `
  <main>
    <section>
      <button>Continue</button>
      <button>Continue</button>
      <button aria-label="Delete row">x</button>
    </section>
    <form>
      <input name="q" type="text">
      <input name="q" type="text">
      <input id="2fa-code" name="otp" type="text">
      <textarea></textarea>
      <select><option>a</option></select>
    </form>
    <div role="button" tabindex="0">Custom control</div>
  </main>
`;

function installEvaluatingDebugger(): void {
  chromeMock.debugger.sendCommand.mockImplementation(
    (
      target: { tabId: number },
      method: string,
      params: unknown,
      callback: (result: unknown) => void,
    ): void => {
      if (inspection.reply(target, method, params as Record<string, unknown>, callback)) return;
      if (method === 'Runtime.evaluate') {
        callback(evaluateInPage(params as EvaluateParams));
        return;
      }
      if (method === 'DOM.requestNode') {
        callback({ nodeId: 1 });
        return;
      }
      if (method === 'DOM.getBoxModel') {
        callback({ model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } });
        return;
      }
      if (method === 'Runtime.callFunctionOn') {
        const p = params as { objectId: string; functionDeclaration: string };
        const element = resolvedObjects.get(p.objectId)!;
        const originalHitTest = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
          configurable: true,
          value: () => element,
        });
        try {
          const fn = (0, eval)(`(${p.functionDeclaration})`);
          const value = fn.call(element);
          callback({ result: { type: typeof value, value } });
        } catch (error) {
          callback({ result: {}, exceptionDetails: { text: String(error) } });
        } finally {
          Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: originalHitTest,
          });
        }
        return;
      }
      callback({});
    },
  );
}

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  inspection.reset();
  resolvedObjects.clear();
  objectSequence = 0;
  chromeMock.runtime.lastError = undefined;
  vi.clearAllMocks();
  installEvaluatingDebugger();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 10,
    bottom: 10,
    width: 10,
    height: 10,
    toJSON() {},
  });
  unregisterActiveTab(EVAL_TAB_ID);
});

afterEach(() => vi.restoreAllMocks());

describe('the index map addresses exactly one element per index', () => {
  it('describes an id separately without inventing a name attribute', async () => {
    document.body.innerHTML =
      '<button id="upload">Submit file</button><input id="mail" name="email">';
    const summary = await getPageContent(EVAL_TAB_ID);
    const button = summary.split('\n').find((line) => line.includes('id="upload"'))!;
    expect(button).toContain('button');
    expect(button).not.toContain('name=');
    expect(summary).toContain('name="email" id="mail"');
  });
  it('uses the live containing button signature when a coordinate hits its child icon', async () => {
    document.body.innerHTML = '<button aria-label="Pay now"><span id="icon"></span></button>';
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.querySelector('#icon'),
    });
    await expect(getTargetSignature(EVAL_TAB_ID, { x: 10, y: 10 })).resolves.toBe(
      'button||||Pay now',
    );
  });

  it('returns unknown when a coordinate hits an inaccessible frame', async () => {
    document.body.innerHTML = '<iframe></iframe>';
    const frame = document.querySelector('iframe')!;
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: null });
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => frame });
    await expect(getTargetSignature(EVAL_TAB_ID, { x: 10, y: 10 })).resolves.toBeNull();
  });

  it('indexes native drag, slider, editable and nested-scroll targets exactly once', async () => {
    document.body.innerHTML =
      '<div draggable="true" id="drag">Drag item</div><div role="slider" id="slider">Slider</div><div contenteditable="true" id="editor">Edit</div><div id="scroll" tabindex="0" style="overflow-y:auto">Long content</div>';
    const scroller = document.querySelector('#scroll')!;
    Object.defineProperties(scroller, {
      scrollHeight: { value: 500 },
      clientHeight: { value: 100 },
    });
    const summary = await getPageContent(EVAL_TAB_ID);
    const mapped = [...getElementIndexMap(EVAL_TAB_ID).values()].map((selector) =>
      document.querySelector(selector),
    );
    for (const id of ['drag', 'slider', 'editor', 'scroll']) {
      expect(mapped.filter((element) => element?.id === id)).toHaveLength(1);
    }
    expect(summary).toContain('4 addressable of 4 found');
  });

  it('gives every index a selector that resolves to exactly one element', async () => {
    await getPageContent(EVAL_TAB_ID);
    const map = getElementIndexMap(EVAL_TAB_ID);

    expect(map.size).toBeGreaterThan(0);
    for (const [index, selector] of map) {
      const matches = document.querySelectorAll(selector);
      expect(
        matches.length,
        `index ${index} selector ${selector} matched ${matches.length} elements`,
      ).toBe(1);
    }
  });

  it('distinguishes two identical unlabelled buttons', async () => {
    await getPageContent(EVAL_TAB_ID);
    const map = getElementIndexMap(EVAL_TAB_ID);
    const buttons = [...document.querySelectorAll('button')];
    const firstContinue = buttons[0]!;
    const secondContinue = buttons[1]!;

    const selectors = [...map.values()];
    const firstMatch = selectors.filter((sel) => document.querySelector(sel) === firstContinue);
    const secondMatch = selectors.filter((sel) => document.querySelector(sel) === secondContinue);

    expect(firstMatch).toHaveLength(1);
    expect(secondMatch).toHaveLength(1);
    expect(firstMatch[0]).not.toBe(secondMatch[0]);
  });

  it('distinguishes two inputs that share a name attribute', async () => {
    await getPageContent(EVAL_TAB_ID);
    const map = getElementIndexMap(EVAL_TAB_ID);
    const namedInputs = [...document.querySelectorAll('input[name="q"]')];

    const resolved = namedInputs.map(
      (input) => [...map.values()].filter((sel) => document.querySelector(sel) === input)[0],
    );

    expect(resolved.every((sel) => typeof sel === 'string')).toBe(true);
    expect(new Set(resolved).size).toBe(namedInputs.length);
  });

  it('addresses an element whose id is not a valid CSS identifier', async () => {
    await getPageContent(EVAL_TAB_ID);
    const map = getElementIndexMap(EVAL_TAB_ID);
    const awkward = document.getElementById('2fa-code');

    const selector = [...map.values()].find((sel) => document.querySelector(sel) === awkward);

    expect(selector).toBeDefined();
    expect(() => document.querySelectorAll(selector!)).not.toThrow();
  });

  it('reports how many of the found controls are addressable', async () => {
    const summary = await getPageContent(EVAL_TAB_ID);
    expect(summary).toMatch(/INTERACTABLE ELEMENTS \(\d+ addressable of \d+ found\):/);
  });
});

describe('resolution refuses anything but the element the index named', () => {
  it('throws on a selector that matches more than one element', () => {
    const result = evaluateInPage({
      expression: buildIndexedElementExpression('button'),
      returnByValue: false,
    });
    expect(
      String(result['exceptionDetails'] && JSON.stringify(result['exceptionDetails'])),
    ).toMatch(/ambiguous/);
  });

  it('throws when the selector matches nothing', () => {
    const result = evaluateInPage({
      expression: buildIndexedElementExpression('html > body:nth-of-type(1) > nav:nth-of-type(9)'),
      returnByValue: false,
    });
    expect(String(JSON.stringify(result['exceptionDetails']))).toMatch(/No element matches/);
  });

  it('throws when the element at that path is no longer the one indexed', async () => {
    await getPageContent(EVAL_TAB_ID);
    const map = getElementIndexMap(EVAL_TAB_ID);
    const [index, selector] = [...map][0]!;
    const target = document.querySelector(selector)!;
    target.textContent = 'Something else entirely';

    await expect(click(EVAL_TAB_ID, { index })).rejects.toThrow(/changed since read_dom/);
  });

  it('clicks through when the element still matches its recorded signature', async () => {
    await getPageContent(EVAL_TAB_ID);
    const [index] = [...getElementIndexMap(EVAL_TAB_ID)][0]!;

    await expect(click(EVAL_TAB_ID, { index })).resolves.toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    const methods = chromeMock.debugger.sendCommand.mock.calls.map((call) => call[1]);
    expect(methods).toContain('DOM.getBoxModel');
    expect(methods).toContain('Input.dispatchMouseEvent');
  });

  it('refuses an index that no snapshot ever produced', async () => {
    await getPageContent(EVAL_TAB_ID);
    await expect(click(EVAL_TAB_ID, { index: 9_999 })).rejects.toThrow(/call read_dom again/);
  });
});

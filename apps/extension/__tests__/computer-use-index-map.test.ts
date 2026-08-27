/**
 * The index map is the path the model is told to prefer over raw CSS
 * selectors, so an index that names two elements is a silent click on
 * something the model never chose, inside the user's live session.
 *
 * These tests run the real page-side expressions — the exact strings shipped
 * to Runtime.evaluate — against a jsdom document holding the shapes the old
 * builder collided on: duplicate unlabelled buttons, two inputs sharing a
 * name, and an id that is not a valid CSS identifier.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVAL_TAB_ID = 7;

interface EvaluateParams {
  expression: string;
  returnByValue?: boolean;
}

const resolvedObjects = new Map<string, Element>();
let objectSequence = 0;

function evaluateInPage(params: EvaluateParams): Record<string, unknown> {
  try {
    // eslint-disable-next-line no-eval
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
  },
  tabs: { get: vi.fn(async () => ({ id: EVAL_TAB_ID, url: 'http://localhost/form' })) },
}));

vi.stubGlobal('chrome', chromeMock);

import {
  buildIndexedElementExpression,
  getElementIndexMap,
  getPageContent,
  click,
  unregisterActiveTab,
} from '../src/features/computer-use/cdpDriver';

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
      _target: unknown,
      method: string,
      params: unknown,
      callback: (result: unknown) => void,
    ): void => {
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
      callback({});
    },
  );
}

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  resolvedObjects.clear();
  objectSequence = 0;
  chromeMock.runtime.lastError = undefined;
  vi.clearAllMocks();
  installEvaluatingDebugger();
  unregisterActiveTab(EVAL_TAB_ID);
});

describe('the index map addresses exactly one element per index', () => {
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
    ).toMatch(/elements match button/);
  });

  it('throws when the selector matches nothing', () => {
    const result = evaluateInPage({
      expression: buildIndexedElementExpression('html > body:nth-of-type(1) > nav:nth-of-type(9)'),
      returnByValue: false,
    });
    expect(String(JSON.stringify(result['exceptionDetails']))).toMatch(/no element matches/);
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

    await expect(click(EVAL_TAB_ID, { index })).resolves.toBeUndefined();
    const methods = chromeMock.debugger.sendCommand.mock.calls.map((call) => call[1]);
    expect(methods).toContain('DOM.getBoxModel');
    expect(methods).toContain('Input.dispatchMouseEvent');
  });

  it('refuses an index that no snapshot ever produced', async () => {
    await getPageContent(EVAL_TAB_ID);
    await expect(click(EVAL_TAB_ID, { index: 9_999 })).rejects.toThrow(/call read_dom again/);
  });
});

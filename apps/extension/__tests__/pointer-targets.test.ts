import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';

const objects = new Map<string, HTMLElement>();
const rectangles = new Map<Element, DOMRect>();
let objectSequence = 0;
let afterReveal = (_element: HTMLElement) => {};
let occluder: Element | null = null;

function rectangle(top: number): DOMRect {
  return {
    x: 10,
    y: top,
    top,
    left: 10,
    right: 110,
    bottom: top + 40,
    width: 100,
    height: 40,
    toJSON() {},
  };
}

const send = vi.fn(
  (
    _target: unknown,
    method: string,
    params: Record<string, unknown>,
    callback: (result: unknown) => void,
  ) => {
    try {
      if (method === 'Runtime.evaluate') {
        if (String(params['expression']).includes('indexMap')) {
          callback({
            result: {
              type: 'string',
              value: JSON.stringify({
                summary: 'Synthetic pointer fixture',
                indexMap: {
                  1: { selector: '#upload', signature: 'button||||Submit test file locally' },
                  2: { selector: '#destination', signature: 'div||||Destination' },
                },
              }),
            },
          });
          return;
        }
        // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
        const value = new Function(`return ${String(params['expression'])};`)();
        if (params['returnByValue'] === false && value instanceof HTMLElement) {
          const objectId = `element-${++objectSequence}`;
          objects.set(objectId, value);
          callback({ result: { type: 'object', objectId } });
        } else callback({ result: { type: typeof value, value } });
      } else if (method === 'DOM.scrollIntoViewIfNeeded') {
        const element = objects.get(String(params['objectId']))!;
        const rect = rectangles.get(element)!;
        if (rect.top < 0 || rect.bottom > innerHeight) rectangles.set(element, rectangle(100));
        afterReveal(element);
        callback({});
      } else if (method === 'DOM.getBoxModel') {
        const rect = rectangles.get(objects.get(String(params['objectId']))!)!;
        callback({
          model: {
            content: [
              rect.left,
              rect.top,
              rect.right,
              rect.top,
              rect.right,
              rect.bottom,
              rect.left,
              rect.bottom,
            ],
          },
        });
      } else if (method === 'Runtime.callFunctionOn') {
        // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
        const fn = new Function(`return (${String(params['functionDeclaration'])});`)();
        callback({
          result: { type: 'object', value: fn.call(objects.get(String(params['objectId']))) },
        });
      } else callback({});
    } catch (error) {
      callback({ result: {}, exceptionDetails: { text: (error as Error).message } });
    }
  },
);

function commands(method: string) {
  return send.mock.calls.filter((call) => call[1] === method).map((call) => call[2]);
}

beforeEach(async () => {
  document.body.innerHTML =
    '<button id="upload">Submit test file locally</button><div id="destination" draggable="true">Destination</div><div id="overlay"></div>';
  objects.clear();
  rectangles.clear();
  objectSequence = 0;
  afterReveal = () => {};
  occluder = null;
  for (const element of [
    document.getElementById('upload')!,
    document.getElementById('destination')!,
  ]) {
    rectangles.set(element, rectangle(10));
    element.getBoundingClientRect = () => rectangles.get(element)!;
  }
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 703);
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) => {
      if (occluder) return occluder;
      return (
        [...rectangles].find(
          ([_element, rect]) =>
            x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
        )?.[0] ?? document.body
      );
    },
  });
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
  await driver.getPageContent(42);
});

afterEach(() => {
  driver.unregisterActiveTab(42);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as Partial<Document>).elementFromPoint;
  document.body.replaceChildren();
});

describe('revealed, current, unobscured pointer targets', () => {
  it.each(['click', 'hover', 'wheel'] as const)(
    'reveals a below-viewport target before %s input',
    async (kind) => {
      rectangles.set(document.getElementById('upload')!, rectangle(712.1875));
      if (kind === 'click') await driver.click(42, { index: 1 });
      if (kind === 'hover') await driver.hover(42, { index: 1 });
      if (kind === 'wheel') await driver.scroll(42, { index: 1, dy: 100 });
      expect(commands('DOM.scrollIntoViewIfNeeded').length).toBeGreaterThan(0);
      expect(
        commands('Input.dispatchMouseEvent').every((event) => Number(event.y) < innerHeight),
      ).toBe(true);
      expect(commands('Input.dispatchMouseEvent').length).toBeGreaterThan(0);
    },
  );

  it('refuses an occluded target before pressing the pointer', async () => {
    occluder = document.getElementById('overlay');
    await expect(driver.click(42, { index: 1 })).rejects.toThrow('covered');
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('refuses an identical replacement during reveal before any pointer action', async () => {
    afterReveal = (element) => {
      element.replaceWith(element.cloneNode(true));
    };
    await expect(driver.click(42, { index: 1 })).rejects.toThrow('original pointer target changed');
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('sends no pointer input if Stop lands during target reveal', async () => {
    const stop = new AbortController();
    afterReveal = () => stop.abort(new Error('Stopped'));
    await expect(driver.click(42, { index: 1 }, stop.signal)).rejects.toThrow('Stopped');
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('refuses coordinates outside the actual page viewport', async () => {
    await expect(driver.click(42, { x: 999, y: 100 })).rejects.toThrow('outside');
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('refuses a drag if revealing the destination leaves the source offscreen', async () => {
    rectangles.set(document.getElementById('destination')!, rectangle(1000));
    afterReveal = (element) => {
      if (element.id === 'destination')
        rectangles.set(document.getElementById('upload')!, rectangle(-900));
    };
    await expect(driver.drag(42, { index: 1 }, { index: 2 })).rejects.toThrow('outside');
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('fails an unmatched selector scroll instead of reporting success', async () => {
    await expect(driver.scroll(42, { toSelector: 'button[name="upload"]' })).rejects.toThrow(
      'No element',
    );
    expect(commands('DOM.scrollIntoViewIfNeeded')).toEqual([]);
  });
});

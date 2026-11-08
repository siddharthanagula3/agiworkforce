import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture(document.location.href);

let dom: JSDOM;
const objects = new Map<string, Element>();
let sequence = 0;
let afterFocus = (_element: HTMLElement) => {};
let currentTarget: Element | null = null;
let simulateNativeInput = false;
let afterNativeKey = () => {};
let nativeSelectAll = false;

function insertNativeText(text: string): void {
  const input = dom.window.document.activeElement as HTMLInputElement;
  if (nativeSelectAll) {
    input.value = text;
    nativeSelectAll = false;
    input.dispatchEvent(new dom.window.InputEvent('input', { data: text, bubbles: true }));
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, 'end');
  input.dispatchEvent(
    new dom.window.InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }),
  );
}

function nextHop(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  if ('host' in root) return (root as ShadowRoot).host;
  return element.ownerDocument.defaultView?.frameElement ?? null;
}
function hitIn(scope: Document | ShadowRoot): Element | null {
  for (let element = currentTarget; element; element = nextHop(element))
    if (element.getRootNode() === scope) return element;
  return null;
}
function layOut(win: Window & typeof globalThis, scope: Document | ShadowRoot): void {
  win.Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 }) as DOMRect;
  (scope as Document).elementFromPoint = () => hitIn(scope) as Element;
}

const send = vi.fn(
  (
    target: { tabId: number },
    method: string,
    params: Record<string, unknown>,
    callback: (result: unknown) => void,
  ) => {
    if (inspection.reply(target, method, params, callback)) return;
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
        currentTarget = objects.get(String(params.objectId)) ?? null;
        const value = fn.call(currentTarget);
        callback({ result: { type: typeof value, value } });
      } else if (method === 'DOM.getBoxModel') {
        callback({ model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } });
      } else if (method === 'DOM.focus') {
        const element = objects.get(String(params.objectId)) as HTMLElement;
        element.focus();
        afterFocus(element);
        callback({});
      } else if (simulateNativeInput && method === 'Input.insertText') {
        insertNativeText(String(params.text));
        callback({});
      } else if (simulateNativeInput && method === 'Input.dispatchKeyEvent') {
        const target = dom.window.document.activeElement!;
        if (params.type === 'keyDown' || params.type === 'rawKeyDown') {
          if ((params.commands as string[] | undefined)?.includes('selectAll'))
            nativeSelectAll = true;
          target.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', { key: String(params.key), bubbles: true }),
          );
          if (params.text) insertNativeText(String(params.text));
          afterNativeKey();
        } else
          target.dispatchEvent(
            new dom.window.KeyboardEvent('keyup', { key: String(params.key), bubbles: true }),
          );
        callback({});
      } else callback({});
    } catch (error) {
      callback({ result: {}, exceptionDetails: { text: (error as Error).message } });
    }
  },
);

beforeEach(() => {
  inspection.reset();
  dom = new JSDOM('<body></body>', { url: document.URL, runScripts: 'outside-only' });
  currentTarget = null;
  layOut(dom.window as unknown as Window & typeof globalThis, dom.window.document);
  objects.clear();
  sequence = 0;
  afterFocus = () => {};
  simulateNativeInput = false;
  afterNativeKey = () => {};
  nativeSelectAll = false;
  send.mockClear();
  vi.stubGlobal('chrome', {
    runtime: { lastError: null, getPlatformInfo: async () => ({ os: 'mac' }) },
    debugger: {
      attach: (_t: unknown, _v: unknown, cb: () => void) => cb(),
      detach: (_t: unknown, cb: () => void) => cb(),
      sendCommand: send,
      onDetach: { addListener: vi.fn() },
      onEvent: inspection.onEvent,
    },
  });
});

it('includes associated checkbox labels and checked properties in the actual injected DOM observation', async () => {
  dom.window.document.body.innerHTML =
    '<label>Mushroom <input type="checkbox" id="mushroom" checked></label>';
  const input = dom.window.document.querySelector('input')!;
  input.focus();
  const before = await driver.readInteractionState(42);
  expect(JSON.parse(before!).control).toMatchObject({ checked: true });
  const summary = await driver.getPageContent(42);
  expect(summary).toContain('label="Mushroom"');
  expect(summary).toContain('checked=true');
  input.checked = false;
  const after = await driver.readInteractionState(42);
  expect(after).not.toBe(before);
  expect(JSON.parse(after!).control).toMatchObject({ checked: false });
  expect(await driver.getPageContent(42)).toContain('checked=false');
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
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(input);
  layOut(frame.contentWindow as unknown as Window & typeof globalThis, child);
  (shadow as unknown as Document).elementFromPoint = () => hitIn(shadow);
  return { frame, child, input };
}

describe('production serialized DOM targeting', () => {
  it('reads the exact clicked control state without using ambient focus or field values', async () => {
    dom.window.document.body.innerHTML =
      '<label>Flag<input type="checkbox" name="flag" checked></label><input type="password" value="PRIVATE">';
    await driver.getPageContent(42);
    const index = indexFor('Flag');
    const signature = driver.resolveIndexedElement(42, index)!.signature;
    const checkbox = dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    dom.window.document.querySelector<HTMLInputElement>('input[type="password"]')!.focus();
    expect(await driver.getTargetControlState(42, { index }, signature)).toEqual({
      signature,
      state: { checked: true },
    });
    checkbox.checked = false;
    expect(await driver.getTargetControlState(42, { index }, signature)).toEqual({
      signature,
      state: { checked: false },
    });
    expect(await driver.getTargetControlState(42, { index }, 'changed-target')).toBeNull();
    checkbox.remove();
    expect(await driver.getTargetControlState(42, { index }, signature)).toBeNull();
  });

  it('replaces a prefilled number through the existing verified native typing owner', async () => {
    simulateNativeInput = true;
    dom.window.document.body.innerHTML = '<label>Number<input type="number" value="42"></label>';
    await driver.getPageContent(42);
    const index = indexFor('Number');
    await driver.type(
      42,
      '73',
      index,
      undefined,
      driver.resolveIndexedElement(42, index)!.signature,
      undefined,
      true,
    );
    expect(dom.window.document.querySelector('input')!.value).toBe('73');
    expect(commands('Input.dispatchKeyEvent')[0]).toMatchObject({ commands: ['selectAll'] });
    expect(commands('Input.insertText')).toEqual([{ text: '73' }]);
  });

  it('requires an indexed target for replacement instead of changing ambient focus', async () => {
    simulateNativeInput = true;
    dom.window.document.body.innerHTML = '<input value="Keep this">';
    const input = dom.window.document.querySelector('input')!;
    input.focus();
    await expect(
      driver.type(42, 'Other', undefined, undefined, undefined, undefined, true),
    ).rejects.toThrow('index');
    expect(commands('Input.insertText')).toEqual([]);
    expect(input.value).toBe('Keep this');
  });

  it('reports a committed autocomplete display label without exposing its hidden record', async () => {
    dom.window.document.body.innerHTML =
      '<label><div class="application-label">Current location</div><input class="location-input" data-qa="location-input" name="location"><input type="hidden" name="selectedLocation"><div class="dropdown-container" style="display:none"></div></label>';
    const input = dom.window.document.querySelector<HTMLInputElement>('input')!;
    const hidden = dom.window.document.querySelector<HTMLInputElement>('input[type=hidden]')!;
    input.value = 'Austin, TX, USA';
    hidden.value = JSON.stringify({ name: input.value, privateId: 'DO_NOT_EXPOSE_RECORD' });
    const summary = await driver.getPageContent(42);
    expect(summary).toContain('selectionCommitted=true');
    expect(summary).toContain('selectedLabel="Austin, TX, USA"');
    expect(summary).not.toContain('DO_NOT_EXPOSE_RECORD');
    hidden.value = '';
    expect(await driver.getPageContent(42)).not.toContain('selectedLabel=');
  });

  it.each(['one-time-code', 'cc-number'])(
    'does not report a protected autocomplete value: %s',
    async (autocomplete) => {
      dom.window.document.body.innerHTML =
        '<label><div class="application-label">Current location</div><input class="location-input" data-qa="location-input" name="location"><input type="hidden" name="selectedLocation"><div class="dropdown-container" style="display:none"></div></label>';
      const input = dom.window.document.querySelector<HTMLInputElement>('input')!;
      input.autocomplete = autocomplete;
      input.value = 'DO_NOT_EXPOSE_PROTECTED';
      dom.window.document.querySelector<HTMLInputElement>('input[type=hidden]')!.value =
        JSON.stringify({ name: input.value });
      const summary = await driver.getPageContent(42);
      expect(summary).not.toContain('DO_NOT_EXPOSE_PROTECTED');
      expect(summary).not.toContain('selectedLabel=');
    },
  );

  it('does not paste the remainder when a keyboard handler changes the focused target', async () => {
    simulateNativeInput = true;
    dom.window.document.body.innerHTML =
      '<label><div class="application-label">Current location</div><input class="location-input" data-qa="location-input" name="location"></label><input aria-label="Other field">';
    const other = dom.window.document.querySelector<HTMLInputElement>('[aria-label]')!;
    afterNativeKey = () => other.focus();
    await driver.getPageContent(42);
    const index = indexFor('Current location');
    await expect(
      driver.type(
        42,
        'Austin',
        index,
        undefined,
        driver.resolveIndexedElement(42, index)!.signature,
      ),
    ).rejects.toThrow(/focused key target changed/);
    expect(commands('Input.insertText')).toEqual([]);
    expect(other.value).toBe('');
  });

  it('stops an autocomplete wait without issuing later native input', async () => {
    simulateNativeInput = true;
    dom.window.document.body.innerHTML =
      '<label><div class="application-label">Current location</div><input class="location-input" data-qa="location-input" name="location"></label>';
    await driver.getPageContent(42);
    const controller = new AbortController();
    const index = indexFor('Current location');
    const pending = driver.type(
      42,
      'Austin',
      index,
      controller.signal,
      driver.resolveIndexedElement(42, index)!.signature,
    );
    await vi.waitFor(() =>
      expect(
        commands('Runtime.callFunctionOn').some((call) =>
          String(call.functionDeclaration).includes('const input = this'),
        ),
      ).toBe(true),
    );
    const before = commands('Input.dispatchKeyEvent').length;
    controller.abort(new DOMException('Stopped', 'AbortError'));
    await expect(pending).rejects.toThrow(/Stopped|abort|cancel/i);
    expect(commands('Input.dispatchKeyEvent')).toHaveLength(before);
    expect(commands('Input.dispatchMouseEvent')).toEqual([]);
  });

  it.each(['Austin', '東京'])(
    'activates autocomplete with native keyboard input, pastes the remainder and waits for options: %s',
    async (query) => {
      simulateNativeInput = true;
      dom.window.document.body.innerHTML =
        '<label><div class="application-label">Current location</div><div><input class="location-input" data-qa="location-input" name="location"><input type="hidden" name="selectedLocation"><div class="dropdown-results"></div><div class="dropdown-no-results">Previous query had no matches</div></div></label>';
      const input = dom.window.document.querySelector('input')!;
      input.addEventListener('keydown', () =>
        dom.window.setTimeout(() => {
          const option = dom.window.document.createElement('div');
          option.className = 'dropdown-location';
          option.textContent = `Result for ${input.value}`;
          dom.window.document.querySelector<HTMLElement>('.dropdown-no-results')!.hidden = true;
          dom.window.document.querySelector('.dropdown-results')!.replaceChildren(option);
        }, 120),
      );
      await driver.getPageContent(42);
      const index = indexFor('Current location');
      await driver.type(
        42,
        query,
        index,
        undefined,
        driver.resolveIndexedElement(42, index)!.signature,
      );
      const first = [...query][0]!;
      expect(commands('Input.dispatchKeyEvent')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'keyDown', text: first }),
          expect.objectContaining({ type: 'keyUp' }),
        ]),
      );
      expect(commands('Input.insertText')).toEqual([{ text: query.slice(first.length) }]);
      expect(input.value).toBe(query);
      expect(dom.window.document.querySelector('.dropdown-location')?.textContent).toBe(
        `Result for ${query}`,
      );
      const summary = await driver.getPageContent(42);
      expect(summary).toContain(`label="Result for ${query}"`);
      expect(summary).toContain('selectionCommitted=false');
    },
  );

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

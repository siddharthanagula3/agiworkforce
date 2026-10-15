import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import { BROWSER_TOOL_DEFINITIONS } from '../src/features/computer-use/cloudAgentClient';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture('https://fixture.test');

const state = vi.hoisted(() => ({
  signature: 'input||text|name|Your name',
  focused: false,
  offsets: [{ x: 0, y: 0 }],
  sendCommand: vi.fn(),
}));

const debuggerApi = {
  attach: vi.fn((_target: unknown, _version: unknown, callback: () => void) => callback()),
  detach: vi.fn((_target: unknown, callback: () => void) => callback()),
  sendCommand: state.sendCommand,
  onDetach: { addListener: vi.fn() },
  onEvent: inspection.onEvent,
};

function reply(
  target: { tabId: number },
  method: string,
  params: Record<string, unknown>,
  callback: (result: unknown) => void,
): void {
  if (inspection.reply(target, method, params, callback)) return;
  if (method === 'Runtime.evaluate') {
    expect(params['uniqueContextId']).toBe(inspection.uniqueContextId);
    const expression = String(params['expression']);
    if (expression.includes('indexMap')) {
      callback({
        result: {
          type: 'string',
          value: JSON.stringify({
            summary: 'fixture',
            indexMap: {
              1: { selector: '#name', signature: state.signature },
              2: { selector: '#destination', signature: 'div||||Destination' },
            },
          }),
        },
      });
    } else if (expression.includes('window.innerWidth')) {
      callback({ result: { type: 'object', value: { x: 360, y: 240 } } });
    } else if (expression.includes('width: innerWidth')) {
      callback({ result: { type: 'object', value: { width: 720, height: 600 } } });
    } else if (expression === 'location.href') {
      callback({ result: { type: 'string', value: 'https://fixture.test' } });
    } else if (expression.includes('const result = { pageUrl: location.href')) {
      callback({
        result: {
          type: 'object',
          value: {
            pageUrl: 'https://fixture.test',
            targetSignature: state.signature,
            url: null,
            kind: 'none',
          },
        },
      });
    } else if (expression.includes('scrollX') || expression.includes('scrollLeft')) {
      const value = state.offsets.length > 1 ? state.offsets.shift() : state.offsets[0];
      callback({ result: { type: 'string', value: JSON.stringify(value) } });
    } else if (
      expression.includes('const active = document.activeElement') ||
      expression.includes('const focused = ')
    ) {
      callback({ result: { type: 'boolean', value: true } });
    } else if (expression.includes('returnByValue') || params['returnByValue'] === true) {
      callback({ result: { type: 'string', value: state.signature } });
    } else callback({ result: { type: 'object', objectId: 'element' } });
  } else if (method === 'Runtime.callFunctionOn')
    callback(
      String(params['functionDeclaration']).includes('.pointForElement(this,')
        ? { result: { type: 'object', value: { x: 60, y: 20 } } }
        : { result: { type: 'boolean', value: state.focused } },
    );
  else if (method === 'DOM.focus') {
    state.focused = true;
    callback({});
  } else if (method === 'DOM.requestNode') callback({ nodeId: 1 });
  else if (method === 'DOM.getBoxModel')
    callback({ model: { content: [10, 10, 110, 10, 110, 30, 10, 30] } });
  else callback({});
}

beforeEach(() => {
  vi.stubGlobal('chrome', {
    debugger: debuggerApi,
    runtime: { lastError: null, getPlatformInfo: async () => ({ os: 'mac' }) },
  });
  vi.clearAllMocks();
  inspection.reset();
  state.signature = 'input||text|name|Your name';
  state.focused = false;
  state.offsets = [{ x: 0, y: 0 }];
  state.sendCommand.mockImplementation(reply);
});

afterEach(() => {
  driver.unregisterActiveTab(42);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function calls(method: string): Array<Record<string, unknown>> {
  return state.sendCommand.mock.calls
    .filter((call) => call[1] === method)
    .map((call) => call[2] as Record<string, unknown>);
}

describe('native browser input', () => {
  it('rejects a page default context before inspecting or sending input', async () => {
    inspection.setDefaultContext(true);
    await expect(driver.hover(42, { x: 10, y: 20 })).rejects.toThrow(
      'original browser document changed before inspection',
    );
    expect(calls('Runtime.evaluate')).toEqual([]);
    expect(calls('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('rejects navigation between frame observation and world creation', async () => {
    inspection.setNavigateDuringCreation(true);
    await expect(driver.hover(42, { x: 10, y: 20 })).rejects.toThrow(
      'original browser document changed before inspection',
    );
    expect(calls('Runtime.evaluate')).toEqual([]);
    expect(calls('Input.dispatchMouseEvent')).toEqual([]);
  });

  it('resolves fresh indexed coordinates from the current remote object without frontend DOM node ids', async () => {
    await driver.getPageContent(42);
    state.sendCommand.mockImplementation((target, method, params, callback) => {
      if (method === 'DOM.requestNode') {
        callback({ nodeId: 0 });
        return;
      }
      if (method === 'DOM.getBoxModel') {
        expect(params).toEqual({ objectId: 'element' });
      }
      reply(target, method, params, callback);
    });
    await driver.click(42, { index: 1 });
    expect(calls('DOM.requestNode')).toHaveLength(0);
    expect(calls('DOM.getBoxModel')).toHaveLength(2);
    expect(calls('Input.dispatchMouseEvent')).toEqual([
      { type: 'mousePressed', x: 60, y: 20, button: 'left', clickCount: 1 },
      { type: 'mouseReleased', x: 60, y: 20, button: 'left', clickCount: 1 },
    ]);
  });

  it('sends both clicks of a double right click with native click counts', async () => {
    await driver.click(42, { x: 10, y: 20 }, undefined, { button: 'right', clickCount: 2 });
    expect(calls('Input.dispatchMouseEvent')).toEqual([
      { type: 'mousePressed', x: 10, y: 20, button: 'right', clickCount: 1 },
      { type: 'mouseReleased', x: 10, y: 20, button: 'right', clickCount: 1 },
      { type: 'mousePressed', x: 10, y: 20, button: 'right', clickCount: 2 },
      { type: 'mouseReleased', x: 10, y: 20, button: 'right', clickCount: 2 },
    ]);
  });

  it('hovers by moving the native pointer without pressing a button', async () => {
    await driver.hover(42, { x: 30, y: 40 });
    expect(calls('Input.dispatchMouseEvent')).toEqual([
      { type: 'mouseMoved', x: 30, y: 40, button: 'none', buttons: 0 },
    ]);
  });

  it.each(['Enter', 'Tab', 'ArrowDown', 'Delete', 'Escape'])(
    'presses %s through native key events',
    async (key) => {
      await driver.pressKey(42, key);
      const events = calls('Input.dispatchKeyEvent');
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: key === 'Enter' ? 'keyDown' : 'rawKeyDown',
        key,
        modifiers: 0,
      });
      expect(events[1]).toMatchObject({ type: 'keyUp', key });
      if (key === 'Enter') expect(events[0]).toHaveProperty('text', '\r');
    },
  );

  it('uses native modifier bitfields for select-all without inserting text', async () => {
    await driver.pressKey(42, 'a', ['Meta', 'Shift']);
    expect(calls('Input.dispatchKeyEvent')[0]).toEqual({
      type: 'rawKeyDown',
      key: 'A',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 12,
    });
  });

  it('refuses unknown keys and duplicate modifiers before dispatch', async () => {
    await expect(driver.pressKey(42, 'shell')).rejects.toThrow(/supported/);
    await expect(driver.pressKey(42, 'a', ['Meta', 'Meta'])).rejects.toThrow(/unique/);
    expect(calls('Input.dispatchKeyEvent')).toEqual([]);
  });

  it('checks the actual focused target after focusing an approved index', async () => {
    await driver.getPageContent(42);
    const approved = state.signature;
    state.sendCommand.mockImplementation((target, method, params, callback) => {
      if (method === 'DOM.focus') state.signature = 'input||password|password|Password';
      reply(target, method, params, callback);
    });
    await expect(driver.pressKey(42, 'Enter', [], 1, undefined, approved)).rejects.toThrow(
      /focused key target changed/,
    );
    expect(calls('Input.dispatchKeyEvent')).toEqual([]);
  });

  it('checks the actual focused target before typing into an approved index', async () => {
    await driver.getPageContent(42);
    const approved = state.signature;
    state.sendCommand.mockImplementation((target, method, params, callback) => {
      if (method === 'DOM.focus') state.signature = 'input||password|password|Password';
      reply(target, method, params, callback);
    });
    await expect(driver.type(42, 'private text', 1, undefined, approved)).rejects.toThrow(
      /focused typing target changed/,
    );
    expect(calls('Input.insertText')).toEqual([]);
  });

  it.each(['Tab', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])(
    'releases navigation key %s after its intended focus movement',
    async (key) => {
      const approved = state.signature;
      state.sendCommand.mockImplementation((target, method, params, callback) => {
        if (method === 'Input.dispatchKeyEvent' && params.type === 'rawKeyDown')
          state.signature = 'input||text|next|Next field';
        reply(target, method, params, callback);
      });
      await driver.pressKey(42, key, [], undefined, undefined, approved);
      expect(calls('Input.dispatchKeyEvent').map((event) => event.type)).toEqual([
        'rawKeyDown',
        'keyUp',
      ]);
    },
  );

  it('still checks navigation focus before keydown', async () => {
    state.signature = 'input||password|password|Password';
    await expect(
      driver.pressKey(42, 'Tab', [], undefined, undefined, 'input||text|name|Your name'),
    ).rejects.toThrow(/focused key target changed after approval/);
    expect(calls('Input.dispatchKeyEvent')).toEqual([]);
  });

  it.each(['Enter', 'Space'])(
    'blocks activating key %s release if keydown changed its target',
    async (key) => {
      const approved = state.signature;
      state.sendCommand.mockImplementation((target, method, params, callback) => {
        if (method === 'Input.dispatchKeyEvent' && params.type === 'keyDown')
          state.signature = 'button||||Pay now';
        reply(target, method, params, callback);
      });
      await expect(driver.pressKey(42, key, [], undefined, undefined, approved)).rejects.toThrow(
        /focused key target changed during/,
      );
      expect(calls('Input.dispatchKeyEvent')).toHaveLength(1);
    },
  );

  it('scrolls horizontally at the actual viewport center', async () => {
    await driver.scroll(42, { dx: 120 });
    expect(calls('Input.dispatchMouseEvent')).toEqual([
      { type: 'mouseWheel', x: 360, y: 240, deltaX: 120, deltaY: 0 },
    ]);
  });

  it('scrolls a fresh indexed container and reads its own offsets', async () => {
    await driver.getPageContent(42);
    await driver.scroll(42, { dy: 200, index: 1 });
    await driver.readScrollPosition(42, undefined, 1);
    expect(calls('Input.dispatchMouseEvent')).toEqual([
      { type: 'mouseWheel', x: 60, y: 20, deltaX: 0, deltaY: 200 },
    ]);
    expect(calls('Runtime.evaluate').at(-1)?.expression).toContain('el.scrollTop');
    expect(calls('Runtime.evaluate').at(-1)?.expression).toContain('#name');
  });

  it('waits for delayed scrolling and stable offsets before settling', async () => {
    vi.useFakeTimers();
    state.offsets = [
      { x: 0, y: 0 },
      { x: 0, y: 120 },
      { x: 0, y: 160 },
      { x: 0, y: 160 },
      { x: 0, y: 160 },
    ];
    const pending = driver.settleScrollPosition(42, { x: 0, y: 0 });
    const resolved = expect(pending).resolves.toEqual({ x: 0, y: 160 });
    await vi.runAllTimersAsync();
    await resolved;
    expect(calls('Runtime.evaluate')).toHaveLength(5);
  });

  it('drags with a bounded native press, held movement and release sequence', async () => {
    vi.useFakeTimers();
    const pending = driver.drag(42, { x: 10, y: 20 }, { x: 130, y: 80 });
    const resolved = expect(pending).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await resolved;
    const events = calls('Input.dispatchMouseEvent');
    expect(events).toHaveLength(15);
    expect(events[1]).toMatchObject({ type: 'mousePressed', x: 10, y: 20, buttons: 1 });
    expect(
      events.slice(2, -1).every((event) => event.type === 'mouseMoved' && event.buttons === 1),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'mouseReleased', x: 130, y: 80, buttons: 0 });
  });

  it('dispatches a bounded touch path ending at the requested finger position', async () => {
    await driver.swipe(42, { x: 300, y: 500 }, { x: 100, y: 200 });
    const events = calls('Input.dispatchTouchEvent');
    expect(events[0]).toEqual({ type: 'touchStart', touchPoints: [{ x: 300, y: 500, id: 0 }] });
    expect(events.slice(1, -1).every((event) => event.type === 'touchMove')).toBe(true);
    expect(events.at(-2)).toEqual({ type: 'touchMove', touchPoints: [{ x: 100, y: 200, id: 0 }] });
    expect(events.at(-1)).toEqual({ type: 'touchEnd', touchPoints: [] });
    expect(events).toHaveLength(14);
    expect(calls('Input.synthesizeScrollGesture')).toEqual([]);
  });

  it.each([NaN, Infinity, -1, 100001])(
    'rejects unsafe pointer coordinate %s before input',
    async (x) => {
      await expect(driver.hover(42, { x, y: 20 })).rejects.toThrow(/finite viewport/);
      expect(calls('Input.dispatchMouseEvent')).toEqual([]);
    },
  );

  it('stops issuing native key commands when the owning lease expires', async () => {
    let owned = true;
    driver.registerActiveTab(42, null, () => {
      if (!owned) throw new Error('lease expired');
    });
    state.sendCommand.mockImplementation((target, method, params, callback) => {
      if (method === 'Input.dispatchKeyEvent') owned = false;
      reply(target, method, params, callback);
    });
    await expect(driver.pressKey(42, 'Tab')).rejects.toThrow('lease expired');
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(1);
  });

  it('stops a drag immediately when Stop arrives after a native move', async () => {
    const abort = new AbortController();
    state.sendCommand.mockImplementation((target, method, params, callback) => {
      if (
        method === 'Input.dispatchMouseEvent' &&
        params.type === 'mouseMoved' &&
        params.buttons === 1
      )
        abort.abort(new Error('stopped'));
      reply(target, method, params, callback);
    });
    await expect(
      driver.drag(42, { x: 10, y: 20 }, { x: 100, y: 20 }, abort.signal),
    ).rejects.toThrow('stopped');
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(3);
  });

  it('offers all implemented input tools with native modifier schema', () => {
    for (const name of ['hover', 'press_key', 'drag', 'swipe'])
      expect(BROWSER_TOOL_DEFINITIONS.some((tool) => tool.function.name === name)).toBe(true);
    const key = BROWSER_TOOL_DEFINITIONS.find((tool) => tool.function.name === 'press_key');
    expect(key?.function.parameters.properties['modifiers']).toMatchObject({
      type: 'array',
      items: { type: 'string', enum: ['Alt', 'Control', 'Meta', 'Shift'] },
    });
  });
});

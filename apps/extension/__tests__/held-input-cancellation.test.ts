import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture(document.location.href);

const state = {
  hook: (_method: string, _params: Record<string, unknown>) => {},
  cleanupOwner: true,
  originalOwner: true,
};
const objects = new Map<string, unknown>();
const send = vi.fn(
  (
    target: { tabId: number },
    method: string,
    params: Record<string, unknown>,
    callback: (result: unknown) => void,
  ) => {
    if (inspection.reply(target, method, params, callback)) return;
    state.hook(method, params);
    if (method === 'Runtime.evaluate') {
      // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
      const value = new Function(`return ${String(params['expression'])};`)();
      if (params['returnByValue'] === false && value) {
        objects.set('original-focus', value);
        callback({ result: { type: 'object', objectId: 'original-focus' } });
      } else callback({ result: { type: typeof value, value } });
    } else if (method === 'Runtime.callFunctionOn') {
      // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
      const fn = new Function(`return (${String(params['functionDeclaration'])});`)();
      callback({
        result: { type: 'boolean', value: fn.call(objects.get(String(params['objectId']))) },
      });
    } else callback({});
  },
);

function calls(method: string): Array<Record<string, unknown>> {
  return send.mock.calls.filter((call) => call[1] === method).map((call) => call[2]);
}

function register(cleanup?: () => Promise<void> | void): void {
  driver.registerActiveTab(
    42,
    null,
    () => {
      if (!state.originalOwner) throw new Error('Stopped');
    },
    cleanup ??
      (() => {
        if (!state.cleanupOwner) throw new Error('Owner changed');
      }),
  );
}

beforeEach(() => {
  inspection.reset();
  document.body.innerHTML =
    '<input id="name" type="text" name="name" aria-label="Your name"><input id="other" type="text" name="name" aria-label="Your name">';
  document.getElementById('name')!.focus();
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => document.getElementById('name'),
  });
  state.hook = () => {};
  state.cleanupOwner = true;
  state.originalOwner = true;
  objects.clear();
  send.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    debugger: {
      attach: (_t: unknown, _v: unknown, cb: () => void) => cb(),
      detach: (_t: unknown, cb: () => void) => cb(),
      sendCommand: send,
      onDetach: { addListener: vi.fn() },
      onEvent: inspection.onEvent,
    },
  });
});
afterEach(() => {
  driver.unregisterActiveTab(42);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  delete (document as Partial<Document>).elementFromPoint;
});

describe('held browser input cancellation', () => {
  it('releases only the original owned focused key after Stop interrupts the keydown callback', async () => {
    const stop = new AbortController();
    register();
    state.hook = (method, params) => {
      if (method === 'Input.dispatchKeyEvent' && params['type'] === 'rawKeyDown') {
        state.originalOwner = false;
        stop.abort(new Error('Stopped'));
      }
    };
    await expect(driver.pressKey(42, 'ArrowDown', [], undefined, stop.signal)).rejects.toThrow(
      'Stopped',
    );
    expect(calls('Input.dispatchKeyEvent').map((event) => event['type'])).toEqual([
      'rawKeyDown',
      'keyUp',
    ]);
    expect(calls('Input.dispatchKeyEvent')[1]?.['modifiers']).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(['focus', 'owner', 'successor', 'activating-key'] as const)(
    'withholds release into an unsafe %s and reports unconfirmed cleanup',
    async (unsafe) => {
      const stop = new AbortController();
      register();
      state.hook = (method, params) => {
        if (
          method === 'Input.dispatchKeyEvent' &&
          ['keyDown', 'rawKeyDown'].includes(String(params['type']))
        ) {
          if (unsafe === 'focus') document.getElementById('other')!.focus();
          if (unsafe === 'owner') state.cleanupOwner = false;
          if (unsafe === 'successor') register();
          state.originalOwner = false;
          stop.abort(new Error('Stopped'));
        }
      };
      await expect(
        driver.pressKey(
          42,
          unsafe === 'activating-key' ? 'Space' : 'ArrowDown',
          [],
          undefined,
          stop.signal,
        ),
      ).rejects.toThrow('cleanup is unconfirmed');
      expect(calls('Input.dispatchKeyEvent')).toHaveLength(1);
      expect(console.warn).toHaveBeenCalled();
    },
  );

  it('cancels an interrupted drag without sending another movement or drop release', async () => {
    const stop = new AbortController();
    register();
    state.hook = (method, params) => {
      if (
        method === 'Input.dispatchMouseEvent' &&
        params['type'] === 'mouseMoved' &&
        params['buttons'] === 1
      ) {
        state.originalOwner = false;
        stop.abort(new Error('Stopped'));
      }
    };
    await expect(driver.drag(42, { x: 10, y: 20 }, { x: 100, y: 20 }, stop.signal)).rejects.toThrow(
      'Stopped',
    );
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(3);
    expect(
      calls('Input.dispatchMouseEvent').some((event) => event['type'] === 'mouseReleased'),
    ).toBe(false);
    expect(calls('Input.cancelDragging')).toEqual([{}]);
  });

  it('cancels an interrupted touch move without sending the remaining moves or a touch end', async () => {
    const stop = new AbortController();
    register();
    state.hook = (method, params) => {
      if (method === 'Input.dispatchTouchEvent' && params['type'] === 'touchMove') {
        state.originalOwner = false;
        stop.abort(new Error('Stopped'));
      }
    };
    await expect(driver.swipe(42, { x: 20, y: 80 }, { x: 20, y: 20 }, stop.signal)).rejects.toThrow(
      'Stopped',
    );
    expect(calls('Input.dispatchTouchEvent').map((event) => event['type'])).toEqual([
      'touchStart',
      'touchMove',
      'touchCancel',
    ]);
    expect(calls('Input.synthesizeScrollGesture')).toEqual([]);
  });

  it.each(['key', 'touch'] as const)(
    'neutralizes held %s input before an outstanding protocol callback arrives',
    async (kind) => {
      const normal = send.getMockImplementation()!;
      let withheld: ((result: unknown) => void) | undefined;
      send.mockImplementation((target, method, params, callback) => {
        if (
          (kind === 'key' &&
            method === 'Input.dispatchKeyEvent' &&
            params['type'] === 'rawKeyDown') ||
          (kind === 'touch' &&
            method === 'Input.dispatchTouchEvent' &&
            params['type'] === 'touchMove')
        ) {
          withheld = callback;
          return;
        }
        normal(target, method, params, callback);
      });
      const stop = new AbortController();
      register();
      const action =
        kind === 'key'
          ? driver.pressKey(42, 'ArrowLeft', [], undefined, stop.signal)
          : driver.swipe(42, { x: 20, y: 80 }, { x: 20, y: 20 }, stop.signal);
      const outcome = action.catch((error) => error as Error);
      await vi.waitFor(() => expect(withheld).toBeDefined());
      state.originalOwner = false;
      stop.abort(new Error('Stopped'));
      expect((await outcome).message).toContain('Stopped');
      const method = kind === 'key' ? 'Input.dispatchKeyEvent' : 'Input.dispatchTouchEvent';
      const expected =
        kind === 'key' ? ['rawKeyDown', 'keyUp'] : ['touchStart', 'touchMove', 'touchCancel'];
      expect(calls(method).map((event) => event['type'])).toEqual(expected);
      withheld!({});
      await Promise.resolve();
      expect(calls(method).map((event) => event['type'])).toEqual(expected);
      send.mockImplementation(normal);
    },
  );

  it('withholds an in-flight touch cancellation after the original owner changes', async () => {
    const normal = send.getMockImplementation()!;
    let withheld: ((result: unknown) => void) | undefined;
    send.mockImplementation((target, method, params, callback) => {
      if (method === 'Input.dispatchTouchEvent' && params['type'] === 'touchMove') {
        withheld = callback;
        return;
      }
      normal(target, method, params, callback);
    });
    const stop = new AbortController();
    register();
    const outcome = driver
      .swipe(42, { x: 20, y: 80 }, { x: 20, y: 20 }, stop.signal)
      .catch((error) => error as Error);
    await vi.waitFor(() => expect(withheld).toBeDefined());
    state.originalOwner = false;
    state.cleanupOwner = false;
    stop.abort(new Error('Stopped'));
    expect((await outcome).message).toContain('cleanup is unconfirmed');
    expect(calls('Input.dispatchTouchEvent').map((event) => event['type'])).toEqual([
      'touchStart',
      'touchMove',
    ]);
    withheld!({});
    await Promise.resolve();
    expect(calls('Input.dispatchTouchEvent')).toHaveLength(2);
    send.mockImplementation(normal);
  });

  it('bounds cleanup and never releases later when an expired authority lookup finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stop = new AbortController();
    let resolveAuthority!: () => void;
    register(
      () =>
        new Promise<void>((resolve) => {
          resolveAuthority = resolve;
        }),
    );
    state.hook = (method, params) => {
      if (method === 'Input.dispatchKeyEvent' && params['type'] === 'rawKeyDown') {
        state.originalOwner = false;
        stop.abort(new Error('Stopped'));
      }
    };
    const result = driver
      .pressKey(42, 'ArrowDown', [], undefined, stop.signal)
      .catch((error) => error as Error);
    await vi.waitFor(() => expect(resolveAuthority).toBeDefined());
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await result).message).toContain('cleanup is unconfirmed');
    resolveAuthority();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(1);
  });
});

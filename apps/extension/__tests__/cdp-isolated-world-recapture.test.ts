import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture('https://example.com/article');

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
      callback({
        result: {
          type: 'string',
          value: JSON.stringify({ summary: 'Article', indexMap: {} }),
        },
      });
      return;
    }
    callback({});
  },
);

beforeEach(() => {
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
});

afterEach(() => {
  driver.unregisterActiveTab(7);
  vi.unstubAllGlobals();
});

describe('browser inspection world', () => {
  it('reads the page when the document already has the world and the runtime is enabled', async () => {
    inspection.abandonCaptureInThisSession('agiworkforce-browser-tools');

    await expect(driver.getPageContent(7)).resolves.toBeTruthy();

    const methods = send.mock.calls.map((call) => call[1]);
    expect(methods).toContain('Runtime.disable');
  });
});

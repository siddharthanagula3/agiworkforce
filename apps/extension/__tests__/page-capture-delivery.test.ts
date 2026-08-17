import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  deliverPageCapture,
  PAGE_CAPTURE_UNDELIVERED_TITLE,
} from '../src/features/background/page-capture';

const here = dirname(fileURLToPath(import.meta.url));

function harness(send: () => Promise<{ success?: boolean; error?: string } | undefined>) {
  const store = { actionCount: 7 };
  const notify = vi.fn();
  return {
    store,
    notify,
    run: () =>
      deliverPageCapture({
        send,
        readActionCount: async () => store.actionCount,
        writeActionCount: async (count) => {
          store.actionCount = count;
        },
        notify,
      }),
  };
}

describe('capture_page only counts a capture the desktop actually received', () => {
  it('leaves the Actions stat untouched and warns when no native host is connected', async () => {
    const h = harness(async () => ({ success: false, error: 'Not connected to native host' }));

    await expect(h.run()).resolves.toBe(false);

    expect(h.store.actionCount).toBe(7);
    expect(h.notify).toHaveBeenCalledWith(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      expect.stringContaining('AGI Desktop is not connected'),
    );
  });

  it('leaves the stat untouched when the native send throws', async () => {
    const h = harness(async () => {
      throw new Error('port closed');
    });

    await expect(h.run()).resolves.toBe(false);

    expect(h.store.actionCount).toBe(7);
    expect(h.notify).toHaveBeenCalledWith(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      expect.stringContaining('port closed'),
    );
  });

  it('counts the capture and stays silent once the desktop confirms delivery', async () => {
    const h = harness(async () => ({ success: true }));

    await expect(h.run()).resolves.toBe(true);

    expect(h.store.actionCount).toBe(8);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('routes the capture_page command through the delivery gate, not fire-and-forget', () => {
    const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');
    const captureFn = background.slice(
      background.indexOf('async function captureCurrentPage('),
      background.indexOf('const MAX_PROBE_RESPONSE_BYTES'),
    );

    expect(captureFn).toContain('deliverPageCapture(');
    expect(captureFn).not.toContain('sendNativeMessage(');
    expect(captureFn).not.toMatch(/actionCount: actionCount \+ 1/);
  });
});

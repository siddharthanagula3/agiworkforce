import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { printConversation } from './print-conversation';

/**
 * Printing had no action and no stylesheet. The browser's own Ctrl+P printed
 * the app chrome plus a VIRTUALIZED transcript — only the rows in the DOM — so
 * a long conversation printed as a few pages with the middle silently missing.
 * A partial printout that looks complete is the failure worth guarding.
 */
describe('printConversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('print', vi.fn());
    // jsdom has no rAF scheduling by default in this config.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-print-scope');
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scopes the document so the print stylesheet applies', async () => {
    let scopeDuringPrint: string | null = null;
    vi.stubGlobal(
      'print',
      vi.fn(() => {
        scopeDuringPrint = document.documentElement.getAttribute('data-print-scope');
      }),
    );

    await printConversation();

    expect(scopeDuringPrint).toBe('transcript');
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('expands the virtual list before printing, not after', async () => {
    const order: string[] = [];
    const onExpand = vi.fn(() => order.push('expand'));
    vi.stubGlobal(
      'print',
      vi.fn(() => order.push('print')),
    );

    await printConversation({ onExpand });

    // Printing before expansion is the bug this exists to prevent.
    expect(order).toEqual(['expand', 'print']);
  });

  it('clears the scope on afterprint so the app is not left in print mode', async () => {
    await printConversation();
    window.dispatchEvent(new Event('afterprint'));

    expect(document.documentElement.getAttribute('data-print-scope')).toBeNull();
  });

  it('clears the scope even when afterprint never fires', async () => {
    // Not every browser fires afterprint, and some never do on cancel. Leaving
    // the attribute set would hide the sidebar on screen.
    await printConversation();
    expect(document.documentElement.getAttribute('data-print-scope')).toBe('transcript');

    vi.advanceTimersByTime(1000);
    expect(document.documentElement.getAttribute('data-print-scope')).toBeNull();
  });

  it('still clears the scope when print() throws', async () => {
    vi.stubGlobal(
      'print',
      vi.fn(() => {
        throw new Error('print unavailable');
      }),
    );

    await expect(printConversation()).rejects.toThrow('print unavailable');
    vi.advanceTimersByTime(1000);
    expect(document.documentElement.getAttribute('data-print-scope')).toBeNull();
  });
});

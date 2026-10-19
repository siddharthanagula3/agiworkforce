import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => ({}));

const { focusComposerWhenReady } = await import('../composerFocus');

function windowLike(destroyed = () => false): BrowserWindow {
  return { isDestroyed: destroyed } as unknown as BrowserWindow;
}

describe('focusing the composer of a page that is still hydrating', () => {
  it('keeps trying until the composer appears', async () => {
    const focus = vi
      .fn<(win: BrowserWindow) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(focusComposerWhenReady(windowLike(), 2000, focus)).resolves.toBe(true);
    expect(focus).toHaveBeenCalledTimes(3);
  });

  it('gives up once the time is spent', async () => {
    const focus = vi.fn<(win: BrowserWindow) => Promise<boolean>>().mockResolvedValue(false);

    await expect(focusComposerWhenReady(windowLike(), 200, focus)).resolves.toBe(false);
    expect(focus.mock.calls.length).toBeGreaterThan(1);
  });

  it('stops when the window closes', async () => {
    const focus = vi.fn<(win: BrowserWindow) => Promise<boolean>>().mockResolvedValue(false);

    await expect(focusComposerWhenReady(windowLike(() => true), 2000, focus)).resolves.toBe(
      false,
    );
    expect(focus).not.toHaveBeenCalled();
  });
});

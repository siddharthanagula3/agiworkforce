'use client';

import { useDesktopHost } from '../lib/host';

/**
 * The band a desktop shell reserves at the top of its window.
 *
 * Every page needs one: with the native title bar hidden, a window with no drag
 * region cannot be moved at all, and a not-found or sign-in screen carries no
 * header row of its own to put one on.
 *
 * It sits behind the page rather than over it. A draggable region is collected
 * from the element's style and handed to the window server, which is
 * independent of paint order, while a transparent strip painted on top would
 * win the renderer's hit test and swallow clicks on the controls beneath it.
 * Those controls are already `no-drag`, so the window server lets their clicks
 * through and the band drags everywhere else. Renders nothing in a browser.
 */
export function DesktopTitleStrip() {
  const host = useDesktopHost();
  if (!host) return null;

  return (
    <div
      data-app-header=""
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[var(--z-behind)] h-[var(--agi-window-title-strip)]"
    />
  );
}

'use client';

import { useEffect } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';

/**
 * Sends a click on a link out of the product to the user's browser.
 *
 * The shell's own `will-navigate` policy cannot see these. A Next.js `<Link>`
 * cancels the click and routes on the client, so the marketing site would open
 * inside the app window with its public navigation, which is how `/pricing`
 * came to render inside the desktop app. Capture phase is what puts this ahead
 * of the router's own handler.
 *
 * Only plain left clicks on same-origin links are taken. A modifier click, a
 * new-window target and a download are the user asking for something else, and
 * a cross-origin link already reaches the shell as a navigation it decides on.
 */
export function useDesktopExternalLinks(host: HostBridge | null): void {
  useEffect(() => {
    if (!host || typeof document === 'undefined') return undefined;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.target !== '' && anchor.target !== '_self') return;

      const href = anchor.getAttribute('href') ?? '';
      if (href === '' || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (isProductPath(url.pathname) || isAuthPath(url.pathname)) return;

      event.preventDefault();
      void host.openExternal(url.href);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [host]);
}

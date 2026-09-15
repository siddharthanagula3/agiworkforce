'use client';

import type { ReactNode } from 'react';
import { useDesktopHost } from '../lib/host';

/**
 * Picks which version of a route the visitor gets.
 *
 * The server has no way to know whether it is answering the shell, so it
 * renders the browser version and this swaps after hydration. Until then the
 * stylesheet hides anything marked `data-surface="web"` whenever the document
 * carries a desktop host, so the shell shows nothing rather than a frame of
 * the marketing site on its way to the page it will keep.
 */
export function DesktopRouteSurface({
  desktop,
  children,
}: {
  desktop: ReactNode;
  children: ReactNode;
}) {
  return useDesktopHost() ? <>{desktop}</> : <>{children}</>;
}

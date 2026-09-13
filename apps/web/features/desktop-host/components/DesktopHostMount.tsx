'use client';

import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';
import { useDesktopHost } from '../lib/host';

function DesktopDeepLinkRouter() {
  useDesktopDeepLinks();
  return null;
}

export function DesktopHostMount() {
  const host = useDesktopHost();
  return host ? <DesktopDeepLinkRouter /> : null;
}

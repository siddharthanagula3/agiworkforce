'use client';

import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';

/**
 * Mounted once at the root so an `agiworkforce-cloud://` open reaches the
 * router from any page, not only from chat. Renders nothing, and in a browser
 * subscribes to nothing.
 */
export function DesktopHostMount() {
  useDesktopDeepLinks();
  return null;
}

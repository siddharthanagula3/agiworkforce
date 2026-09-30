'use client';

import { toast } from 'sonner';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';

export const CONNECTOR_AUTHORIZATION_IN_BROWSER =
  'Finish connecting in your browser. This list updates when you come back.';

/**
 * Starts a connector's sign-in. In a browser the tab goes to the provider and
 * comes back. The desktop window cannot do that: its navigation policy sends an
 * API path or a provider's sign-in page to the system browser anyway, and
 * providers refuse sign-in inside an embedded window, so the flow is opened in
 * the browser on purpose, as the Claude and ChatGPT desktop apps do, and the
 * list is read again when the user returns to the app.
 */
export function openConnectorAuthorization(url: string, onReturn?: () => void): void {
  const host = getHostBridge();
  if (host?.shell !== 'electron') {
    window.location.href = url;
    return;
  }
  void host.openExternal(new URL(url, window.location.href).href);
  toast.info(CONNECTOR_AUTHORIZATION_IN_BROWSER);
  if (onReturn) window.addEventListener('focus', () => onReturn(), { once: true });
}

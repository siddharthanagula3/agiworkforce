'use client';

import { toast } from 'sonner';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';

import {
  askConnectorConsent,
  type ConnectorConsentTarget,
} from '../components/ConnectorConsentDialog';

export const CONNECTOR_AUTHORIZATION_IN_BROWSER =
  'Finish connecting in your browser. This list updates when you come back.';

declare const consentGranted: unique symbol;

export interface ConnectorConsentGrant {
  readonly connectorId: string;
  readonly [consentGranted]: true;
}

export async function requestConnectorConsent(
  connector: ConnectorConsentTarget,
): Promise<ConnectorConsentGrant | null> {
  if (!(await askConnectorConsent(connector))) return null;
  return { connectorId: connector.id } as ConnectorConsentGrant;
}

/**
 * Starts a connector's sign-in. In a browser the tab goes to the provider and
 * comes back. The desktop window cannot do that: its navigation policy sends an
 * API path or a provider's sign-in page to the system browser anyway, and
 * providers refuse sign-in inside an embedded window, so the flow is opened in
 * the browser on purpose, as the Claude and ChatGPT desktop apps do, and the
 * list is read again when the user returns to the app.
 */
export function openConnectorAuthorization(
  _grant: ConnectorConsentGrant,
  url: string,
  onReturn?: () => void,
): void {
  const host = getHostBridge();
  if (host?.shell !== 'electron') {
    window.location.href = url;
    return;
  }
  void host.openExternal(new URL(url, window.location.href).href);
  toast.info(CONNECTOR_AUTHORIZATION_IN_BROWSER);
  if (onReturn) window.addEventListener('focus', () => onReturn(), { once: true });
}

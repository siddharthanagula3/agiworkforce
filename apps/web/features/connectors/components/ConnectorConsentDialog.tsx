'use client';

import { createRoot } from 'react-dom/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';

import { ConnectorConsentSummary } from './ConnectorConsentSummary';
import { ConnectorScopeList } from './ConnectorScopeList';

export interface ConnectorConsentTarget {
  id: string;
  name: string;
}

export const CONNECTOR_CONSENT_ALLOW = 'Allow';
export const CONNECTOR_CONSENT_DENY = 'Deny';

export function connectorConsentTitle(name: string): string {
  return `Connect ${name}?`;
}

export function ConnectorConsentDialog({
  connector,
  onDecide,
}: {
  connector: ConnectorConsentTarget;
  onDecide: (allowed: boolean) => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onDecide(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{connectorConsentTitle(connector.name)}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <ConnectorScopeList connectorId={connector.id} />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ConnectorConsentSummary />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onDecide(false)}>
            {CONNECTOR_CONSENT_DENY}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onDecide(true)}>
            {CONNECTOR_CONSENT_ALLOW}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

let settlePending: ((allowed: boolean) => void) | null = null;

export function askConnectorConsent(connector: ConnectorConsentTarget): Promise<boolean> {
  settlePending?.(false);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      if (settlePending === settle) settlePending = null;
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
      resolve(allowed);
    };
    settlePending = settle;
    root.render(<ConnectorConsentDialog connector={connector} onDecide={settle} />);
  });
}

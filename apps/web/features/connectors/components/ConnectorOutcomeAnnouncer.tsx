'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useConnectors, connectorDisplayName } from '../hooks/use-connectors';
import { connectorOutcomeNotice } from '../lib/connector-outcome';

/**
 * Mounting useConnectors is what announces a finished authorization: the hook
 * owns the single broker-outcome subscription, so a second one here would
 * consume the redirect parameters before it refetched.
 */
export function ConnectorOutcomeAnnouncer(): null {
  const { needsReauthorizationIds, notRespondingIds, reconnect } = useConnectors();
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    // An expired or revoked grant is announced as its own reconnect state.
    // Without it the only evidence a user got was a tool that answered with
    // nothing, which reads as "there was nothing there".
    for (const connectorId of needsReauthorizationIds) {
      if (announced.current.has(connectorId)) continue;
      announced.current.add(connectorId);
      const notice = connectorOutcomeNotice({
        connectorId,
        connectorLabel: connectorDisplayName(connectorId),
        toolName: 'its last request',
        failure: 'authorization',
      });
      toast.error(notice.detail, {
        action: {
          label: notice.actionLabel ?? 'Reconnect',
          onClick: () => void reconnect(connectorId),
        },
      });
    }
    for (const connectorId of notRespondingIds) {
      if (announced.current.has(connectorId)) continue;
      announced.current.add(connectorId);
      const notice = connectorOutcomeNotice({
        connectorId,
        connectorLabel: connectorDisplayName(connectorId),
        toolName: 'its last request',
        failure: 'unavailable',
      });
      toast.error(notice.detail);
    }
  }, [needsReauthorizationIds, notRespondingIds, reconnect]);

  return null;
}

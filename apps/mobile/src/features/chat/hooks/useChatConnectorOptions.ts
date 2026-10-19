import { useEffect, useState } from 'react';
import { fetchConnectorDirectory } from '@/services/connectors';
import { formatConnectorName } from '@/src/features/settings/cloud-connectors/connectorStatus';

export interface ChatConnectorOption {
  connectorId: string;
  label: string;
}

export function useChatConnectorOptions(enabled: boolean): ChatConnectorOption[] {
  const [options, setOptions] = useState<ChatConnectorOption[]>([]);
  useEffect(() => {
    if (!enabled) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    void fetchConnectorDirectory()
      .then((directory) => {
        if (cancelled) return;
        setOptions(
          directory.connectors
            .filter((connection) => connection.needsReauthorization !== true)
            .map((connection) => ({
              connectorId: connection.toolConnectorId ?? connection.connectorId,
              label: connection.name ?? formatConnectorName(connection.connectorId),
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return options;
}

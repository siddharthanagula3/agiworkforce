import {
  CONNECTOR_HEALTH_PATH,
  ConnectorHealthResponseSchema,
  type ConnectorCallHealth,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export async function fetchConnectorHealth(
  connectorIds: readonly string[],
  signal?: AbortSignal,
): Promise<ConnectorCallHealth | null> {
  const body = ConnectorHealthResponseSchema.parse(
    await api.get<unknown>(CONNECTOR_HEALTH_PATH, { signal }),
  );
  const wanted = new Set(connectorIds);
  return body.connectors.find((entry) => wanted.has(entry.connectorId)) ?? null;
}

import 'server-only';

import { createError } from '@/lib/errors';
import { ConnectorUnreachableError } from '@/lib/connectors/oauth-access';
import {
  withUserConnectorMcpHandle,
  type UserConnectorMcpHandle,
} from '@/lib/user-connector-tools';

export function rethrowConnectorUnreachable(error: unknown): never {
  if (error instanceof ConnectorUnreachableError) {
    throw createError.serviceUnavailable(error.message).asUserSafe();
  }
  throw error;
}

/**
 * The connector handle for a request that answers the person directly, where a
 * refresh that failed for a moment has to read as "try again", not as a
 * connector that is not connected.
 */
export function withReachableMcpHandle<T>(
  userId: string,
  connectorRef: string,
  operation: (connection: UserConnectorMcpHandle) => Promise<T>,
): Promise<T | null> {
  return withUserConnectorMcpHandle(userId, connectorRef, operation, {
    reportUnreachable: true,
  }).catch(rethrowConnectorUnreachable);
}

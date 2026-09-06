import 'server-only';

import { isDeviceLocalConnector } from '@/lib/connectors/catalog';
import { describeConnectorSetup } from '@/lib/connectors/oauth-setup';
import { getConnectorOAuthRedirectUri } from '@/lib/connectors/oauth-registry';
import { isConnectorTokenStorageAvailable } from '@/lib/custom-connector-crypto';
import type { DirectoryAuthMode, DirectoryConnectableMode } from '@/lib/connectors/directory/types';

export function connectableForInternalId(id: string): DirectoryConnectableMode {
  if (isDeviceLocalConnector(id)) return 'desktop-and-cli';
  return describeConnectorSetup(id) === null ? 'connect' : 'needs-setup';
}

export function connectableFromAuthMode(
  authMode: DirectoryAuthMode,
  hasRemote: boolean,
): DirectoryConnectableMode {
  if (!hasRemote) return 'desktop-and-cli';
  if (authMode === 'none') return 'connect';
  if (!isConnectorTokenStorageAvailable()) return 'needs-setup';
  if (authMode === 'unknown') return 'connect';
  if (authMode === 'oauth') return getConnectorOAuthRedirectUri() ? 'connect' : 'needs-setup';
  return 'api-key-form';
}

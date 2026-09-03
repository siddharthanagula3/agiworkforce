import 'server-only';

import { getConnectorCapability, isDeviceLocalConnector } from '@/lib/connectors/catalog';
import { getMcpEndpoint, isSelfServiceConnector } from '@/lib/connectors/mcp-endpoints';
import { isConnectorOAuthConfigured } from '@/lib/connectors/oauth-registry';
import { isGitHubAppConfigured, isGitHubInstallationLinkingAvailable } from '@/lib/github-app';
import type { DirectoryAuthMode, DirectoryConnectableMode } from '@/lib/connectors/directory/types';

const GITHUB_CONNECTOR_ID = 'github';
const CREDENTIAL_FORM_SCHEMES = new Set(['api-key', 'connection-string', 'pat']);

export function connectableForInternalId(id: string): DirectoryConnectableMode {
  if (isDeviceLocalConnector(id)) return 'desktop-and-cli';

  if (id === GITHUB_CONNECTOR_ID) {
    return isGitHubAppConfigured() && isGitHubInstallationLinkingAvailable()
      ? 'connect'
      : 'needs-setup';
  }

  const endpoint = getMcpEndpoint(id);
  if (endpoint) {
    if (isSelfServiceConnector(id)) return 'connect';
    return isConnectorOAuthConfigured(id) ? 'connect' : 'needs-setup';
  }

  const capability = getConnectorCapability(id);
  if (capability && CREDENTIAL_FORM_SCHEMES.has(capability.authScheme)) return 'api-key-form';
  if (capability?.authScheme === 'oauth2') {
    return isConnectorOAuthConfigured(id) ? 'connect' : 'needs-setup';
  }

  return 'needs-setup';
}

export function connectableFromAuthMode(
  authMode: DirectoryAuthMode,
  hasRemote: boolean,
): DirectoryConnectableMode {
  if (!hasRemote) return 'desktop-and-cli';
  if (authMode === 'none' || authMode === 'oauth') return 'connect';
  if (authMode === 'api-key') return 'api-key-form';
  return 'needs-setup';
}

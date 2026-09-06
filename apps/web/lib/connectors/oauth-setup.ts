import 'server-only';

import { getConnectorCapability, isDeviceLocalConnector } from '@/lib/connectors/catalog';
import { getMcpEndpoint, isSelfServiceConnector } from '@/lib/connectors/mcp-endpoints';
import {
  CONNECTOR_OAUTH_PROVIDERS_ENV,
  CONNECTOR_OAUTH_REDIRECT_BASE_ENV,
  connectorOAuthCredentialEnvNames,
  getConnectorOAuthRedirectUri,
  hasConnectorOAuthDescriptor,
  isConnectorOAuthConfigured,
} from '@/lib/connectors/oauth-registry';
import {
  CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV,
  isConnectorTokenStorageAvailable,
} from '@/lib/custom-connector-crypto';
import { missingGitHubInstallationLinkingVars } from '@/lib/github-app';

export type ConnectorSetupKind =
  | 'github-app'
  | 'oauth-client-pair'
  | 'oauth-redirect-base'
  | 'token-storage'
  | 'no-remote';

export interface ConnectorSetupRequirement {
  readonly connectorId: string;
  readonly kind: ConnectorSetupKind;
  readonly missingEnv: readonly string[];
  readonly message: string;
}

const GITHUB_CONNECTOR_ID = 'github';
const OAUTH2_SCHEME = 'oauth2';
const LIST_SEPARATOR = ', ';
const LIST_LAST_SEPARATOR = ' and ';

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(LIST_SEPARATOR)}${LIST_LAST_SEPARATOR}${names[names.length - 1]}`;
}

function needsEnvMessage(displayName: string, missingEnv: readonly string[]): string {
  return `${displayName} needs ${joinNames(missingEnv)} on this deployment.`;
}

function requirement(
  connectorId: string,
  kind: ConnectorSetupKind,
  missingEnv: readonly string[],
  message: string,
): ConnectorSetupRequirement {
  return { connectorId, kind, missingEnv, message };
}

function tokenStorageRequirement(
  connectorId: string,
  displayName: string,
): ConnectorSetupRequirement | null {
  if (isConnectorTokenStorageAvailable()) return null;
  const missingEnv = [CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV];
  return requirement(
    connectorId,
    'token-storage',
    missingEnv,
    needsEnvMessage(displayName, missingEnv),
  );
}

function redirectBaseRequirement(
  connectorId: string,
  displayName: string,
): ConnectorSetupRequirement | null {
  if (getConnectorOAuthRedirectUri()) return null;
  return requirement(
    connectorId,
    'oauth-redirect-base',
    [CONNECTOR_OAUTH_REDIRECT_BASE_ENV],
    `${displayName} needs ${CONNECTOR_OAUTH_REDIRECT_BASE_ENV} set to a public HTTPS origin on this deployment.`,
  );
}

function selfServiceRequirement(
  connectorId: string,
  displayName: string,
): ConnectorSetupRequirement | null {
  return (
    tokenStorageRequirement(connectorId, displayName) ??
    redirectBaseRequirement(connectorId, displayName)
  );
}

function clientPairRequirement(
  connectorId: string,
  displayName: string,
): ConnectorSetupRequirement | null {
  if (isConnectorOAuthConfigured(connectorId)) return null;
  const storage = tokenStorageRequirement(connectorId, displayName);
  if (storage) return storage;
  const names = connectorOAuthCredentialEnvNames(connectorId);
  const missingEnv: string[] = [];
  if (!hasConnectorOAuthDescriptor(connectorId)) missingEnv.push(CONNECTOR_OAUTH_PROVIDERS_ENV);
  if (!process.env[names.clientId]?.trim()) missingEnv.push(names.clientId);
  if (!process.env[names.clientSecret]?.trim()) missingEnv.push(names.clientSecret);
  if (!getConnectorOAuthRedirectUri()) missingEnv.push(CONNECTOR_OAUTH_REDIRECT_BASE_ENV);
  if (missingEnv.length === 0) {
    return requirement(
      connectorId,
      'oauth-client-pair',
      [names.clientId, names.clientSecret],
      `${displayName} has ${names.clientId} and ${names.clientSecret} on this deployment but its ${CONNECTOR_OAUTH_PROVIDERS_ENV} entry is disabled or invalid.`,
    );
  }
  return requirement(
    connectorId,
    'oauth-client-pair',
    missingEnv,
    needsEnvMessage(displayName, missingEnv),
  );
}

function githubRequirement(displayName: string): ConnectorSetupRequirement | null {
  const missingEnv = missingGitHubInstallationLinkingVars();
  if (missingEnv.length === 0) return null;
  return requirement(
    GITHUB_CONNECTOR_ID,
    'github-app',
    missingEnv,
    needsEnvMessage(displayName, missingEnv),
  );
}

function noRemoteRequirement(connectorId: string, displayName: string): ConnectorSetupRequirement {
  return requirement(
    connectorId,
    'no-remote',
    [],
    `${displayName} has no remote MCP server this deployment can reach, so it cannot be connected from the browser.`,
  );
}

/**
 * A directory record authorizes through discovery, so the only deployment
 * inputs it can be missing are the secret store and a public callback origin.
 */
export function describeDiscoveredConnectorSetup(
  connectorId: string,
  displayName: string = connectorId,
): ConnectorSetupRequirement | null {
  return selfServiceRequirement(connectorId, displayName);
}

export function describeConnectorSetup(
  connectorId: string,
  displayName: string = connectorId,
): ConnectorSetupRequirement | null {
  if (isDeviceLocalConnector(connectorId)) return null;
  if (connectorId === GITHUB_CONNECTOR_ID) return githubRequirement(displayName);
  if (getMcpEndpoint(connectorId)) {
    return isSelfServiceConnector(connectorId)
      ? selfServiceRequirement(connectorId, displayName)
      : clientPairRequirement(connectorId, displayName);
  }
  if (getConnectorCapability(connectorId)?.authScheme === OAUTH2_SCHEME) {
    return clientPairRequirement(connectorId, displayName);
  }
  return noRemoteRequirement(connectorId, displayName);
}

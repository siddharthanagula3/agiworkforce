import { getProviderDisplayLabel } from '@agiworkforce/types';
import { MCP_OAUTH_PROVIDERS } from '../../api/mcp';
import type { McpStoredSecretReference } from '../../types/mcp';
import { CONNECTOR_DIRECTORY } from '../connectors/connectorDefinitions';

function signInName(provider: string): string {
  return (
    MCP_OAUTH_PROVIDERS.find((candidate) => candidate.id === provider)?.name ??
    CONNECTOR_DIRECTORY.find((candidate) => candidate.id === provider)?.name ??
    provider
  );
}

function describeSecret(reference: McpStoredSecretReference): string {
  return reference.kind === 'apiKey'
    ? `your ${getProviderDisplayLabel(reference.provider)} API key`
    : `your ${signInName(reference.provider)} sign-in token`;
}

export function receivedSecretsNotice(
  references: readonly McpStoredSecretReference[] | undefined,
  enabled: boolean,
): string | null {
  if (!references || references.length === 0) return null;
  const secrets = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
    references.map(describeSecret),
  );
  return enabled
    ? `This server is given ${secrets} each time it connects.`
    : `Turning this on gives this server ${secrets}.`;
}

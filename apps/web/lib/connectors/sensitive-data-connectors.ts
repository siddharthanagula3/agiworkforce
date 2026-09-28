import 'server-only';

import { resolveConnectorToolMetadata } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';

export interface SensitiveDataConnector {
  readonly regionRefusal: string;
  readonly authorizationTtlSeconds?: number;
}

export const HEALTHEX_CONNECTOR_ID = 'healthex';

const COUNTRY_HEADER = 'x-vercel-ip-country';
const UNITED_STATES = 'US';
const HEALTHEX_AUTHORIZATION_TTL_SECONDS = 30 * 60;

export const SENSITIVE_DATA_CONNECTORS: Readonly<Record<string, SensitiveDataConnector>> = {
  [HEALTHEX_CONNECTOR_ID]: {
    regionRefusal: 'HealthEx is available in the United States only.',
    authorizationTtlSeconds: HEALTHEX_AUTHORIZATION_TTL_SECONDS,
  },
  'bank-accounts': {
    regionRefusal: 'Connecting a bank account is available in the United States only.',
  },
};

export const SENSITIVE_DATA_CONNECTOR_IDS: readonly string[] =
  Object.keys(SENSITIVE_DATA_CONNECTORS);

export function sensitiveDataConnector(connectorId: string): SensitiveDataConnector | null {
  return SENSITIVE_DATA_CONNECTORS[connectorId] ?? null;
}

export function isSensitiveDataToolOffered(connectorId: string, toolName: string): boolean {
  if (!sensitiveDataConnector(connectorId)) return true;
  const metadata = resolveConnectorToolMetadata(connectorId, toolName);
  return metadata.declared && metadata.actionClass === 'read';
}

export function isSensitiveDataToolName(qualifiedName: string): boolean {
  const parsed = parseQualifiedToolName(qualifiedName);
  return parsed !== null && sensitiveDataConnector(parsed.serverId) !== null;
}

export function sensitiveDataRegionRefusal(
  connectorId: string,
  request: { headers: { get(name: string): string | null } },
): string | null {
  const connector = sensitiveDataConnector(connectorId);
  if (!connector) return null;
  const country = request.headers.get(COUNTRY_HEADER)?.trim().toUpperCase();
  if (!country && process.env['NODE_ENV'] !== 'production') return null;
  return country === UNITED_STATES ? null : connector.regionRefusal;
}

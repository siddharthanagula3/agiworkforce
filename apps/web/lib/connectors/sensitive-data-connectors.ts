import 'server-only';

import { resolveConnectorToolMetadata } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';

export type SensitiveDataKind = 'health' | 'finance';

export interface SensitiveDataConnector {
  readonly kind: SensitiveDataKind;
  readonly displayName: string;
  readonly authorizationTtlSeconds?: number;
}

const COUNTRY_HEADER = 'x-vercel-ip-country';
const UNITED_STATES = 'US';
const HEALTHEX_AUTHORIZATION_TTL_SECONDS = 30 * 60;

export const SENSITIVE_DATA_CONNECTORS: Readonly<Record<string, SensitiveDataConnector>> = {
  healthex: {
    kind: 'health',
    displayName: 'HealthEx',
    authorizationTtlSeconds: HEALTHEX_AUTHORIZATION_TTL_SECONDS,
  },
};

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
  return country === UNITED_STATES
    ? null
    : `${connector.displayName} is available in the United States only.`;
}

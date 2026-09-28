export interface AccountUrlConnector {
  readonly connectorId: string;
  readonly name: string;
  readonly urlFormat: string;
  readonly hostSuffixes: readonly string[];
  readonly pathPattern: RegExp;
  readonly documentationUrl: string;
}

export const ACCOUNT_URL_CONNECTORS: readonly AccountUrlConnector[] = [
  {
    connectorId: 'snowflake',
    name: 'Snowflake',
    urlFormat:
      'https://<account>.snowflakecomputing.com/api/v2/databases/<database>/schemas/<schema>/mcp-servers/<server>',
    hostSuffixes: ['.snowflakecomputing.com'],
    pathPattern: /^\/api\/v2\/databases\/[^/]+\/schemas\/[^/]+\/mcp-servers\/[^/]+\/?$/,
    documentationUrl: 'https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp',
  },
  {
    connectorId: 'databricks',
    name: 'Databricks',
    urlFormat: 'https://<workspace-hostname>/api/2.0/mcp/sql',
    hostSuffixes: ['.cloud.databricks.com', '.gcp.databricks.com', '.azuredatabricks.net'],
    pathPattern: /^\/(?:api\/2\.0\/mcp|ai-gateway\/mcp-services)\/[^?#]+$/,
    documentationUrl: 'https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp',
  },
];

export function accountUrlConnector(connectorId: string): AccountUrlConnector | null {
  return ACCOUNT_URL_CONNECTORS.find((entry) => entry.connectorId === connectorId) ?? null;
}

export function accountUrlConnectorForHost(hostname: string): AccountUrlConnector | null {
  const host = hostname.toLowerCase();
  return (
    ACCOUNT_URL_CONNECTORS.find((entry) =>
      entry.hostSuffixes.some((suffix) => host.endsWith(suffix) && host.length > suffix.length),
    ) ?? null
  );
}

export function accountUrlProblem(url: URL): string | null {
  const connector = accountUrlConnectorForHost(url.hostname);
  if (!connector || connector.pathPattern.test(url.pathname)) return null;
  return `That is not a ${connector.name} MCP server URL. Use the form ${connector.urlFormat}.`;
}

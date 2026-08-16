
export type McpClientRegistrationMode = 'cimd' | 'dynamic' | 'preregistered';

export interface McpEndpointRecord {
  readonly connectorId: string;
  readonly url: string;
  readonly transport: 'streamable-http' | 'sse';
  readonly clientRegistration: McpClientRegistrationMode;
}

export const MCP_ENDPOINTS: Readonly<Record<string, McpEndpointRecord>> = {
  airtable: {
    connectorId: 'airtable',
    url: 'https://mcp.airtable.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  canva: {
    connectorId: 'canva',
    url: 'https://mcp.canva.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  huggingface: {
    connectorId: 'huggingface',
    url: 'https://huggingface.co/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  linear: {
    connectorId: 'linear',
    url: 'https://mcp.linear.app/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  notion: {
    connectorId: 'notion',
    url: 'https://mcp.notion.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  posthog: {
    connectorId: 'posthog',
    url: 'https://mcp.posthog.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  sentry: {
    connectorId: 'sentry',
    url: 'https://mcp.sentry.dev/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  todoist: {
    connectorId: 'todoist',
    url: 'https://ai.todoist.net/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },

  clickup: {
    connectorId: 'clickup',
    url: 'https://mcp.clickup.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  cloudflare: {
    connectorId: 'cloudflare',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  datadog: {
    connectorId: 'datadog',
    url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  monday: {
    connectorId: 'monday',
    url: 'https://mcp.monday.com/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  paypal: {
    connectorId: 'paypal',
    url: 'https://mcp.paypal.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  plaid: {
    connectorId: 'plaid',
    url: 'https://api.dashboard.plaid.com/mcp/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  stripe: {
    connectorId: 'stripe',
    url: 'https://mcp.stripe.com',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },

  asana: {
    connectorId: 'asana',
    url: 'https://mcp.asana.com/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  box: {
    connectorId: 'box',
    url: 'https://mcp.box.com/',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  confluence: {
    connectorId: 'confluence',
    url: 'https://mcp.atlassian.com/v1/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  dropbox: {
    connectorId: 'dropbox',
    url: 'https://mcp.dropbox.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  figma: {
    connectorId: 'figma',
    url: 'https://mcp.figma.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  hubspot: {
    connectorId: 'hubspot',
    url: 'https://mcp.hubspot.com/anthropic',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  intercom: {
    connectorId: 'intercom',
    url: 'https://mcp.intercom.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  jira: {
    connectorId: 'jira',
    url: 'https://mcp.atlassian.com/v1/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  pagerduty: {
    connectorId: 'pagerduty',
    url: 'https://mcp.pagerduty.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  slack: {
    connectorId: 'slack',
    url: 'https://mcp.slack.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  square: {
    connectorId: 'square',
    url: 'https://mcp.squareup.com/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  vercel: {
    connectorId: 'vercel',
    url: 'https://mcp.vercel.com',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
};

export function getMcpEndpoint(connectorId: string): McpEndpointRecord | null {
  return MCP_ENDPOINTS[connectorId] ?? null;
}

export function isSelfServiceConnector(connectorId: string): boolean {
  const record = MCP_ENDPOINTS[connectorId];
  return record !== undefined && record.clientRegistration !== 'preregistered';
}

export function connectorIdsWithMcpEndpoint(): string[] {
  return Object.keys(MCP_ENDPOINTS);
}

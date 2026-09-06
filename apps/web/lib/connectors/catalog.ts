export type ConnectorImplementation = 'first-party' | 'operator-configurable' | 'device-local';

export type ConnectorAuthScheme =
  | 'github-app'
  | 'oauth2'
  | 'api-key'
  | 'connection-string'
  | 'pat'
  | 'device-local';

export type ConnectorScopeSource =
  | 'first-party'
  /**
   * Supplied by the deployment operator at runtime, the provider descriptor in
   * `CONNECTOR_OAUTH_PROVIDERS_JSON`, or the GitHub App's own permission set on
   * github.com. This repository does not know them, so `scopes` stays empty and
   * the scopes a user actually granted are reported per-grant by
   * `GET /api/connectors` instead of guessed here.
   */
  | 'operator-defined'
  /** No scope concept (device-local). */
  | 'not-applicable';

export type ConnectorSurface = 'cloud-web' | 'desktop-local';

export type ConnectorRiskClass = 'read-only' | 'read-write' | 'high-impact';

export type ConnectorReleaseState = 'generally-available' | 'operator-enabled' | 'desktop-only';

/**
 * Where the answer to "what can this connector do?" comes from. This is the
 * distinction the catalog got wrong before: an empty action list was recorded
 * for connectors whose actions were never knowable here, and it read as "this
 * connector does nothing" rather than "nobody has asked the server yet".
 */
export type ConnectorActionSource =
  /**
   * Tools implemented in this repository (`lib/user-connector-tools.ts`, with
   * approval metadata in the chat route's `tool-metadata.ts`). The list on the
   * record is the complete list, and it is true before anyone connects.
   */
  | 'declared'
  /**
   * A generic remote-MCP client. The provider's own server decides what tools
   * exist; `lib/connectors/mcp-discovery.ts` asks it at connect time. No static
   * table here can mirror that, so the type below forbids trying.
   */
  | 'runtime-discovered'
  /**
   * The Desktop Local runtime owns the tool surface on the user's machine. The
   * cloud app neither enumerates nor runs these.
   */
  | 'device-local';

interface ConnectorCapabilityBase {
  readonly id: string;
  readonly implementation: ConnectorImplementation;
  readonly authScheme: ConnectorAuthScheme;
  readonly scopeSource: ConnectorScopeSource;
  readonly scopes: readonly string[];
  readonly surfaces: readonly ConnectorSurface[];
  readonly riskClass: ConnectorRiskClass;
  readonly releaseState: ConnectorReleaseState;
}

export interface DeclaredActionsConnector extends ConnectorCapabilityBase {
  readonly implementation: 'first-party';
  readonly actionSource: 'declared';
  readonly supportedActions: readonly [string, ...string[]];
}

/**
 * The empty-tuple `supportedActions` is the guard: naming an action on one of
 * these is a compile error, which is what stops the next catalog edit from
 * inventing capabilities the provider's server was never asked about.
 */
export interface DiscoveredActionsConnector extends ConnectorCapabilityBase {
  readonly implementation: 'operator-configurable' | 'device-local';
  readonly actionSource: 'runtime-discovered' | 'device-local';
  readonly supportedActions: readonly [];
}

export type ConnectorCapabilityRecord = DeclaredActionsConnector | DiscoveredActionsConnector;

const NO_SCOPES: readonly string[] = Object.freeze([]);
const NO_DECLARED_ACTIONS = Object.freeze([] as const);
const CLOUD_WEB_SURFACES: readonly ConnectorSurface[] = Object.freeze(['cloud-web']);
const DESKTOP_LOCAL_SURFACES: readonly ConnectorSurface[] = Object.freeze(['desktop-local']);

type McpAuthScheme = Exclude<ConnectorAuthScheme, 'github-app' | 'device-local'>;

function mcpConnector(
  id: string,
  authScheme: McpAuthScheme,
  riskClass: ConnectorRiskClass,
): DiscoveredActionsConnector {
  return {
    id,
    implementation: 'operator-configurable',
    authScheme,
    scopeSource: 'operator-defined',
    scopes: NO_SCOPES,
    actionSource: 'runtime-discovered',
    supportedActions: NO_DECLARED_ACTIONS,
    surfaces: CLOUD_WEB_SURFACES,
    riskClass,
    releaseState: 'operator-enabled',
  };
}

function deviceLocalConnector(id: string): DiscoveredActionsConnector {
  return {
    id,
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: NO_SCOPES,
    actionSource: 'device-local',
    supportedActions: NO_DECLARED_ACTIONS,
    surfaces: DESKTOP_LOCAL_SURFACES,
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  };
}

function firstPartyConnector(
  id: string,
  authScheme: ConnectorAuthScheme,
  riskClass: ConnectorRiskClass,
  supportedActions: readonly [string, ...string[]],
): DeclaredActionsConnector {
  return {
    id,
    implementation: 'first-party',
    authScheme,
    scopeSource: 'operator-defined',
    scopes: NO_SCOPES,
    actionSource: 'declared',
    supportedActions,
    surfaces: CLOUD_WEB_SURFACES,
    riskClass,
    releaseState: 'operator-enabled',
  };
}

export const CONNECTOR_CAPABILITIES: Readonly<Record<string, ConnectorCapabilityRecord>> = {
  gmail: mcpConnector('gmail', 'oauth2', 'read-write'),
  'google-calendar': mcpConnector('google-calendar', 'oauth2', 'read-write'),
  'google-drive': mcpConnector('google-drive', 'oauth2', 'read-write'),
  notion: mcpConnector('notion', 'oauth2', 'read-write'),
  slack: mcpConnector('slack', 'oauth2', 'read-write'),
  github: firstPartyConnector('github', 'github-app', 'read-write', [
    'get_pull_request_diff',
    'post_issue_comment',
    'post_pull_request_review',
  ]),
  'google-sheets': mcpConnector('google-sheets', 'oauth2', 'read-write'),
  outlook: mcpConnector('outlook', 'oauth2', 'read-write'),
  onedrive: mcpConnector('onedrive', 'oauth2', 'read-write'),
  linear: mcpConnector('linear', 'oauth2', 'read-write'),
  jira: mcpConnector('jira', 'oauth2', 'read-write'),
  teams: mcpConnector('teams', 'oauth2', 'read-write'),
  confluence: mcpConnector('confluence', 'oauth2', 'read-write'),
  asana: mcpConnector('asana', 'oauth2', 'read-write'),
  zoom: mcpConnector('zoom', 'oauth2', 'read-write'),
  hubspot: mcpConnector('hubspot', 'oauth2', 'read-write'),
  salesforce: mcpConnector('salesforce', 'oauth2', 'read-write'),
  calendly: mcpConnector('calendly', 'oauth2', 'read-write'),
  intercom: mcpConnector('intercom', 'oauth2', 'read-write'),
  'google-analytics': mcpConnector('google-analytics', 'oauth2', 'read-write'),
  mailchimp: mcpConnector('mailchimp', 'oauth2', 'high-impact'),
  stripe: mcpConnector('stripe', 'oauth2', 'high-impact'),
  shopify: mcpConnector('shopify', 'oauth2', 'high-impact'),
  linkedin: mcpConnector('linkedin', 'oauth2', 'read-write'),
  twitter: mcpConnector('twitter', 'oauth2', 'read-write'),
  discord: mcpConnector('discord', 'oauth2', 'read-write'),
  openai: mcpConnector('openai', 'api-key', 'read-write'),
  elevenlabs: mcpConnector('elevenlabs', 'api-key', 'read-write'),
  'local-filesystem': deviceLocalConnector('local-filesystem'),
  terminal: deviceLocalConnector('terminal'),
  'browser-automation': deviceLocalConnector('browser-automation'),
  'screen-vision': deviceLocalConnector('screen-vision'),
  ollama: deviceLocalConnector('ollama'),
  airtable: mcpConnector('airtable', 'oauth2', 'read-write'),
  monday: mcpConnector('monday', 'oauth2', 'read-write'),
  clickup: mcpConnector('clickup', 'oauth2', 'read-write'),
  trello: mcpConnector('trello', 'api-key', 'read-write'),
  todoist: mcpConnector('todoist', 'oauth2', 'read-write'),
  basecamp: mcpConnector('basecamp', 'oauth2', 'read-write'),
  evernote: mcpConnector('evernote', 'oauth2', 'read-write'),
  vercel: mcpConnector('vercel', 'oauth2', 'high-impact'),
  sentry: mcpConnector('sentry', 'oauth2', 'read-write'),
  datadog: mcpConnector('datadog', 'oauth2', 'read-write'),
  pagerduty: mcpConnector('pagerduty', 'oauth2', 'read-write'),
  circleci: mcpConnector('circleci', 'api-key', 'read-write'),
  gitlab: mcpConnector('gitlab', 'oauth2', 'read-write'),
  bitbucket: mcpConnector('bitbucket', 'oauth2', 'read-write'),
  telegram: mcpConnector('telegram', 'api-key', 'read-write'),
  whatsapp: mcpConnector('whatsapp', 'api-key', 'high-impact'),
  twilio: mcpConnector('twilio', 'api-key', 'high-impact'),
  sendgrid: mcpConnector('sendgrid', 'api-key', 'high-impact'),
  aws: mcpConnector('aws', 'api-key', 'high-impact'),
  gcp: mcpConnector('gcp', 'oauth2', 'high-impact'),
  azure: mcpConnector('azure', 'oauth2', 'high-impact'),
  cloudflare: mcpConnector('cloudflare', 'oauth2', 'high-impact'),
  digitalocean: mcpConnector('digitalocean', 'api-key', 'high-impact'),
  snowflake: mcpConnector('snowflake', 'connection-string', 'high-impact'),
  bigquery: mcpConnector('bigquery', 'oauth2', 'high-impact'),
  databricks: mcpConnector('databricks', 'api-key', 'high-impact'),
  postgresql: mcpConnector('postgresql', 'connection-string', 'high-impact'),
  mongodb: mcpConnector('mongodb', 'connection-string', 'high-impact'),
  redis: mcpConnector('redis', 'connection-string', 'high-impact'),
  elasticsearch: mcpConnector('elasticsearch', 'api-key', 'high-impact'),
  pipedrive: mcpConnector('pipedrive', 'oauth2', 'read-write'),
  zendesk: mcpConnector('zendesk', 'api-key', 'read-write'),
  freshdesk: mcpConnector('freshdesk', 'api-key', 'read-write'),
  figma: mcpConnector('figma', 'oauth2', 'read-write'),
  canva: mcpConnector('canva', 'oauth2', 'read-write'),
  adobe: mcpConnector('adobe', 'oauth2', 'read-write'),
  quickbooks: mcpConnector('quickbooks', 'oauth2', 'high-impact'),
  xero: mcpConnector('xero', 'oauth2', 'high-impact'),
  paypal: mcpConnector('paypal', 'oauth2', 'high-impact'),
  square: mcpConnector('square', 'oauth2', 'high-impact'),
  plaid: mcpConnector('plaid', 'oauth2', 'high-impact'),
  dropbox: mcpConnector('dropbox', 'oauth2', 'read-write'),
  box: mcpConnector('box', 'oauth2', 'read-write'),
  sharepoint: mcpConnector('sharepoint', 'oauth2', 'read-write'),
  instagram: mcpConnector('instagram', 'oauth2', 'read-write'),
  facebook: mcpConnector('facebook', 'oauth2', 'read-write'),
  youtube: mcpConnector('youtube', 'oauth2', 'read-write'),
  posthog: mcpConnector('posthog', 'oauth2', 'read-write'),
  segment: mcpConnector('segment', 'api-key', 'read-write'),
  mixpanel: mcpConnector('mixpanel', 'api-key', 'read-write'),
  huggingface: mcpConnector('huggingface', 'oauth2', 'read-write'),
  wandb: mcpConnector('wandb', 'api-key', 'read-write'),
  'anthropic-api': mcpConnector('anthropic-api', 'api-key', 'read-write'),
  replicate: mcpConnector('replicate', 'api-key', 'read-write'),
  'epic-fhir': mcpConnector('epic-fhir', 'oauth2', 'high-impact'),
  cerner: mcpConnector('cerner', 'oauth2', 'high-impact'),
};

export function getConnectorCapability(connectorId: string): ConnectorCapabilityRecord | null {
  return CONNECTOR_CAPABILITIES[connectorId] ?? null;
}

export function isKnownConnectorId(connectorId: string): boolean {
  return connectorId in CONNECTOR_CAPABILITIES;
}

export function isDeviceLocalConnector(connectorId: string): boolean {
  return getConnectorCapability(connectorId)?.implementation === 'device-local';
}

export function allowsPresentTenseCopy(connectorId: string): boolean {
  return getConnectorCapability(connectorId)?.implementation === 'first-party';
}

/**
 * Fails closed for an id nobody registered: an unknown connector has no actions
 * declared here, so it is never treated as one whose list can be shown up front.
 */
export function getConnectorActionSource(connectorId: string): ConnectorActionSource {
  return getConnectorCapability(connectorId)?.actionSource ?? 'runtime-discovered';
}

/** Empty for every remote-MCP and device-local connector, ask the server. */
export function getDeclaredConnectorActions(connectorId: string): readonly string[] {
  return getConnectorCapability(connectorId)?.supportedActions ?? NO_DECLARED_ACTIONS;
}

export type ConnectorHealth =
  | 'connected'
  | 'connectable'
  | 'needs-reauthorization'
  | 'not-configured'
  | 'unsupported-here';

export function resolveConnectorHealth(input: {
  connectorId: string;
  available?: boolean;
  connected?: boolean;
  needsReauthorization?: boolean;
}): ConnectorHealth {
  const record = getConnectorCapability(input.connectorId);
  if (record && !record.surfaces.includes('cloud-web')) return 'unsupported-here';
  if (input.needsReauthorization) return 'needs-reauthorization';
  if (input.connected) return 'connected';
  return input.available === true ? 'connectable' : 'not-configured';
}

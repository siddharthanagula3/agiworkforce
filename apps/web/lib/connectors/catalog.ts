import {
  CONNECTOR_RISK_CLASSES,
  type CatalogConnectorId,
  type ConnectorPersonalSource,
  type ConnectorRiskClass,
} from '@agiworkforce/cloud-contracts';
import {
  resolveConnectorHealth as resolveSharedConnectorHealth,
  type ConnectorHealth,
} from '@agiworkforce/client-runtime';

export type ConnectorImplementation = 'first-party' | 'operator-configurable' | 'device-local';

export type ConnectorAuthScheme =
  | 'github-app'
  | 'oauth2'
  | 'api-key'
  | 'connection-string'
  | 'pat'
  | 'service-account'
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

export type { ConnectorRiskClass };

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
   * The device runtime owns the tool surface on the user's machine. The
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
  readonly personalSources?: readonly ConnectorPersonalSource[];
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
  id: CatalogConnectorId,
  authScheme: McpAuthScheme,
  personalSources?: readonly ConnectorPersonalSource[],
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
    riskClass: CONNECTOR_RISK_CLASSES[id],
    releaseState: 'operator-enabled',
    ...(personalSources ? { personalSources } : {}),
  };
}

function deviceLocalConnector(id: CatalogConnectorId): DiscoveredActionsConnector {
  return {
    id,
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: NO_SCOPES,
    actionSource: 'device-local',
    supportedActions: NO_DECLARED_ACTIONS,
    surfaces: DESKTOP_LOCAL_SURFACES,
    riskClass: CONNECTOR_RISK_CLASSES[id],
    releaseState: 'desktop-only',
  };
}

function firstPartyConnector(
  id: CatalogConnectorId,
  authScheme: ConnectorAuthScheme,
  supportedActions: readonly [string, ...string[]],
  personalSources?: readonly ConnectorPersonalSource[],
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
    riskClass: CONNECTOR_RISK_CLASSES[id],
    releaseState: 'operator-enabled',
    ...(personalSources ? { personalSources } : {}),
  };
}

export const CONNECTOR_CAPABILITIES: Readonly<Record<string, ConnectorCapabilityRecord>> = {
  gmail: mcpConnector('gmail', 'oauth2', ['email']),
  'google-calendar': mcpConnector('google-calendar', 'oauth2', ['calendar']),
  'google-drive': mcpConnector('google-drive', 'oauth2'),
  'google-contacts': mcpConnector('google-contacts', 'oauth2'),
  notion: mcpConnector('notion', 'oauth2'),
  slack: mcpConnector('slack', 'oauth2'),
  github: firstPartyConnector('github', 'github-app', [
    'get_pull_request_diff',
    'post_issue_comment',
    'post_pull_request_review',
  ]),
  'github-mcp': mcpConnector('github-mcp', 'oauth2'),
  'google-sheets': mcpConnector('google-sheets', 'oauth2'),
  outlook: firstPartyConnector(
    'outlook',
    'oauth2',
    ['search_mail', 'read_mail', 'list_events', 'send_mail', 'create_event'],
    ['email', 'calendar'],
  ),
  'microsoft-365': mcpConnector('microsoft-365', 'oauth2'),
  onedrive: firstPartyConnector('onedrive', 'oauth2', ['search_files', 'read_file']),
  linear: mcpConnector('linear', 'oauth2'),
  jira: mcpConnector('jira', 'oauth2'),
  teams: firstPartyConnector('teams', 'oauth2', [
    'list_chats',
    'read_chat_messages',
    'list_teams',
    'list_channels',
  ]),
  confluence: mcpConnector('confluence', 'oauth2'),
  asana: mcpConnector('asana', 'oauth2'),
  zoom: mcpConnector('zoom', 'oauth2'),
  hubspot: mcpConnector('hubspot', 'oauth2'),
  salesforce: mcpConnector('salesforce', 'oauth2'),
  calendly: mcpConnector('calendly', 'oauth2'),
  intercom: mcpConnector('intercom', 'oauth2'),
  'google-analytics': mcpConnector('google-analytics', 'oauth2'),
  mailchimp: mcpConnector('mailchimp', 'oauth2'),
  stripe: mcpConnector('stripe', 'oauth2'),
  shopify: mcpConnector('shopify', 'oauth2'),
  linkedin: mcpConnector('linkedin', 'oauth2'),
  twitter: mcpConnector('twitter', 'oauth2'),
  discord: mcpConnector('discord', 'oauth2'),
  openai: mcpConnector('openai', 'api-key'),
  elevenlabs: mcpConnector('elevenlabs', 'api-key'),
  'local-filesystem': deviceLocalConnector('local-filesystem'),
  terminal: deviceLocalConnector('terminal'),
  'browser-automation': deviceLocalConnector('browser-automation'),
  'screen-vision': deviceLocalConnector('screen-vision'),
  ollama: deviceLocalConnector('ollama'),
  airtable: mcpConnector('airtable', 'oauth2'),
  monday: mcpConnector('monday', 'oauth2'),
  clickup: mcpConnector('clickup', 'oauth2'),
  trello: mcpConnector('trello', 'api-key'),
  todoist: mcpConnector('todoist', 'oauth2'),
  basecamp: mcpConnector('basecamp', 'oauth2'),
  evernote: mcpConnector('evernote', 'oauth2'),
  vercel: mcpConnector('vercel', 'oauth2'),
  sentry: mcpConnector('sentry', 'oauth2'),
  datadog: mcpConnector('datadog', 'oauth2'),
  pagerduty: mcpConnector('pagerduty', 'oauth2'),
  circleci: mcpConnector('circleci', 'api-key'),
  gitlab: mcpConnector('gitlab', 'oauth2'),
  bitbucket: mcpConnector('bitbucket', 'oauth2'),
  telegram: mcpConnector('telegram', 'api-key'),
  whatsapp: mcpConnector('whatsapp', 'api-key'),
  twilio: mcpConnector('twilio', 'api-key'),
  sendgrid: mcpConnector('sendgrid', 'api-key'),
  aws: mcpConnector('aws', 'api-key'),
  gcp: mcpConnector('gcp', 'oauth2'),
  azure: mcpConnector('azure', 'oauth2'),
  cloudflare: mcpConnector('cloudflare', 'oauth2'),
  digitalocean: mcpConnector('digitalocean', 'api-key'),
  snowflake: mcpConnector('snowflake', 'connection-string'),
  bigquery: mcpConnector('bigquery', 'oauth2'),
  databricks: mcpConnector('databricks', 'api-key'),
  elasticsearch: mcpConnector('elasticsearch', 'api-key'),
  pipedrive: mcpConnector('pipedrive', 'oauth2'),
  zendesk: mcpConnector('zendesk', 'api-key'),
  freshdesk: mcpConnector('freshdesk', 'api-key'),
  figma: mcpConnector('figma', 'oauth2'),
  canva: mcpConnector('canva', 'oauth2'),
  adobe: mcpConnector('adobe', 'oauth2'),
  quickbooks: mcpConnector('quickbooks', 'oauth2'),
  xero: mcpConnector('xero', 'oauth2'),
  paypal: mcpConnector('paypal', 'oauth2'),
  square: mcpConnector('square', 'oauth2'),
  plaid: mcpConnector('plaid', 'oauth2'),
  'bank-accounts': firstPartyConnector('bank-accounts', 'oauth2', [
    'get_account_balances',
    'get_transactions',
  ]),
  dropbox: mcpConnector('dropbox', 'oauth2'),
  box: mcpConnector('box', 'oauth2'),
  docusign: mcpConnector('docusign', 'oauth2'),
  sharepoint: firstPartyConnector('sharepoint', 'oauth2', [
    'search_sites',
    'search_files',
    'read_file',
  ]),
  instagram: mcpConnector('instagram', 'oauth2'),
  facebook: mcpConnector('facebook', 'oauth2'),
  youtube: mcpConnector('youtube', 'oauth2'),
  posthog: mcpConnector('posthog', 'oauth2'),
  segment: mcpConnector('segment', 'api-key'),
  mixpanel: mcpConnector('mixpanel', 'api-key'),
  huggingface: mcpConnector('huggingface', 'oauth2'),
  wandb: mcpConnector('wandb', 'api-key'),
  'anthropic-api': mcpConnector('anthropic-api', 'api-key'),
  replicate: mcpConnector('replicate', 'api-key'),
  'epic-fhir': mcpConnector('epic-fhir', 'oauth2'),
  cerner: mcpConnector('cerner', 'oauth2'),
  healthex: mcpConnector('healthex', 'oauth2'),
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
 * How a connector reaches the thing it acts on. The ordering is the product
 * rule: a structured API beats driving a browser, and driving a browser beats
 * moving the pointer over whatever happens to be on screen.
 */
export const CONNECTOR_EXECUTION_CHANNELS = ['connector', 'browser', 'automation'] as const;
export type ConnectorExecutionChannel = (typeof CONNECTOR_EXECUTION_CHANNELS)[number];

// Only the connectors that drive a user interface rank below `connector`. A
// local filesystem, shell or model runtime is a structured API like any other.
const CHANNEL_BY_CONNECTOR: Readonly<Record<string, ConnectorExecutionChannel>> = Object.freeze({
  'browser-automation': 'browser',
  'screen-vision': 'automation',
});

export function getConnectorExecutionChannel(connectorId: string): ConnectorExecutionChannel {
  return CHANNEL_BY_CONNECTOR[connectorId] ?? 'connector';
}

export function isChannelPreferredOver(
  channel: ConnectorExecutionChannel,
  other: ConnectorExecutionChannel,
): boolean {
  return (
    CONNECTOR_EXECUTION_CHANNELS.indexOf(channel) < CONNECTOR_EXECUTION_CHANNELS.indexOf(other)
  );
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

export type { ConnectorHealth };

/**
 * Ranking lives in the shared client runtime; the catalog only answers whether
 * this connector runs on cloud web at all.
 */
export function resolveConnectorHealth(input: {
  connectorId: string;
  available?: boolean;
  connected?: boolean;
  needsReauthorization?: boolean;
  notResponding?: boolean;
}): ConnectorHealth {
  const record = getConnectorCapability(input.connectorId);
  return resolveSharedConnectorHealth({
    supportedHere: record ? record.surfaces.includes('cloud-web') : true,
    ...(input.available === undefined ? {} : { available: input.available }),
    ...(input.connected === undefined ? {} : { connected: input.connected }),
    ...(input.needsReauthorization === undefined
      ? {}
      : { needsReauthorization: input.needsReauthorization }),
    ...(input.notResponding === undefined ? {} : { notResponding: input.notResponding }),
  });
}

/**
 * @file Canonical connector capability registry.
 *
 * ONE OWNER for the question "what is this connector, really?". Every other
 * connector surface — the directory catalog copy
 * (`features/connectors/data/connectors.ts`), the availability the API reports
 * (`app/api/connectors/route.ts`), the ids that route accepts, and the tests —
 * derives from this file instead of keeping its own list.
 *
 * WHY THIS EXISTS (audit CRIT-001). The catalog advertised 89 branded
 * connectors in present tense ("Search, read, send, and draft email across your
 * Gmail inbox") while exactly ONE of them — github — has an adapter in this
 * repository. Every other id was reachable only if a deployment operator
 * happened to register an OAuth application (`CONNECTOR_OAUTH_PROVIDERS_JSON`)
 * or map a remote MCP endpoint (`CONNECTOR_MCP_SERVERS_JSON`), and otherwise
 * produced a `501` from `POST /api/connectors` after a Connect button that
 * looked live. Three separate lists decided which ids were "real": the catalog
 * array, a hand-maintained `VALID_CONNECTOR_IDS` set of 34 ids inside the API
 * route, and the runtime configuration sources. They disagreed.
 *
 * This module is deliberately plain data with no `server-only` marker: the
 * facts here (implementation state, auth scheme, risk class, release state) are
 * not secrets, and the client directory needs exactly the same answers the
 * server gives. Secrets stay in `oauth-registry.ts`, which IS server-only.
 *
 * STATIC vs RUNTIME. This registry answers "what did we build?" — it never
 * answers "can I click Connect right now?". That second question is per
 * deployment and is answered by `getAvailableConnectorIds()` in the API route
 * from real configuration. `resolveConnectorHealth()` below combines the two,
 * and is the only sanctioned way to turn both facts into one user-facing state.
 */

/**
 * What actually exists in this repository for a connector.
 *
 * - `first-party`            — a shipped adapter with named actions in this repo.
 * - `operator-configurable`  — no adapter; the id becomes usable only when this
 *                              deployment's operator registers an OAuth app or
 *                              maps a remote MCP endpoint for it.
 * - `device-local`           — owned by the Desktop Local trust boundary. The
 *                              managed cloud cannot reach the user's machine, so
 *                              this id is never connectable from the web API.
 */
export type ConnectorImplementation = 'first-party' | 'operator-configurable' | 'device-local';

/** How a credential is obtained. `device-local` never leaves the user's machine. */
export type ConnectorAuthScheme =
  | 'github-app'
  | 'oauth2'
  | 'api-key'
  | 'connection-string'
  | 'pat'
  | 'device-local';

/** Where the scope list for a connection comes from. */
export type ConnectorScopeSource =
  /** Declared by a first-party adapter in this repo (`scopes` is populated). */
  | 'first-party'
  /**
   * Supplied by the deployment operator at runtime — the provider descriptor in
   * `CONNECTOR_OAUTH_PROVIDERS_JSON`, or the GitHub App's own permission set on
   * github.com. This repository does not know them, so `scopes` stays empty and
   * the scopes a user actually granted are reported per-grant by
   * `GET /api/connectors` instead of guessed here.
   */
  | 'operator-defined'
  /** No scope concept (device-local). */
  | 'not-applicable';

export type ConnectorSurface = 'cloud-web' | 'desktop-local';

/**
 * The CEILING of what a working credential for this provider could do — not
 * what the (mostly unbuilt) adapter happens to do today. An unclassified
 * connector resolves to the higher class, never the lower one.
 */
export type ConnectorRiskClass = 'read-only' | 'read-write' | 'high-impact';

/**
 * What we are allowed to tell a user about this connector.
 *
 * - `generally-available` — works in every deployment with no operator setup.
 * - `operator-enabled`    — can only work where an operator configured it.
 * - `desktop-only`        — not part of the managed cloud product at all.
 */
export type ConnectorReleaseState = 'generally-available' | 'operator-enabled' | 'desktop-only';

export interface ConnectorCapabilityRecord {
  readonly id: string;
  readonly implementation: ConnectorImplementation;
  readonly authScheme: ConnectorAuthScheme;
  readonly scopeSource: ConnectorScopeSource;
  /** Non-empty ONLY when `scopeSource === 'first-party'`. */
  readonly scopes: readonly string[];
  /** Named actions a shipped adapter exposes. Empty for everything unbuilt. */
  readonly supportedActions: readonly string[];
  readonly surfaces: readonly ConnectorSurface[];
  readonly riskClass: ConnectorRiskClass;
  readonly releaseState: ConnectorReleaseState;
}

export const CONNECTOR_CAPABILITIES: Readonly<Record<string, ConnectorCapabilityRecord>> = {
  'gmail': {
    id: 'gmail',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'google-calendar': {
    id: 'google-calendar',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'google-drive': {
    id: 'google-drive',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'notion': {
    id: 'notion',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'slack': {
    id: 'slack',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'github': {
    id: 'github',
    implementation: 'first-party',
    authScheme: 'github-app',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: ['get_pull_request_diff', 'post_issue_comment', 'post_pull_request_review'],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'google-sheets': {
    id: 'google-sheets',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'outlook': {
    id: 'outlook',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'onedrive': {
    id: 'onedrive',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'linear': {
    id: 'linear',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'jira': {
    id: 'jira',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'teams': {
    id: 'teams',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'confluence': {
    id: 'confluence',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'asana': {
    id: 'asana',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'zoom': {
    id: 'zoom',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'hubspot': {
    id: 'hubspot',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'salesforce': {
    id: 'salesforce',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'calendly': {
    id: 'calendly',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'intercom': {
    id: 'intercom',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'google-analytics': {
    id: 'google-analytics',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'mailchimp': {
    id: 'mailchimp',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'stripe': {
    id: 'stripe',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'shopify': {
    id: 'shopify',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'linkedin': {
    id: 'linkedin',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'twitter': {
    id: 'twitter',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'discord': {
    id: 'discord',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'openai': {
    id: 'openai',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'elevenlabs': {
    id: 'elevenlabs',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'local-filesystem': {
    id: 'local-filesystem',
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: [],
    supportedActions: [],
    surfaces: ['desktop-local'],
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  },
  'terminal': {
    id: 'terminal',
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: [],
    supportedActions: [],
    surfaces: ['desktop-local'],
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  },
  'browser-automation': {
    id: 'browser-automation',
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: [],
    supportedActions: [],
    surfaces: ['desktop-local'],
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  },
  'screen-vision': {
    id: 'screen-vision',
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: [],
    supportedActions: [],
    surfaces: ['desktop-local'],
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  },
  'ollama': {
    id: 'ollama',
    implementation: 'device-local',
    authScheme: 'device-local',
    scopeSource: 'not-applicable',
    scopes: [],
    supportedActions: [],
    surfaces: ['desktop-local'],
    riskClass: 'high-impact',
    releaseState: 'desktop-only',
  },
  'airtable': {
    id: 'airtable',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'monday': {
    id: 'monday',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'clickup': {
    id: 'clickup',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'trello': {
    id: 'trello',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'todoist': {
    id: 'todoist',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'basecamp': {
    id: 'basecamp',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'evernote': {
    id: 'evernote',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'vercel': {
    id: 'vercel',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'sentry': {
    id: 'sentry',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'datadog': {
    id: 'datadog',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'pagerduty': {
    id: 'pagerduty',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'circleci': {
    id: 'circleci',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'gitlab': {
    id: 'gitlab',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'bitbucket': {
    id: 'bitbucket',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'telegram': {
    id: 'telegram',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'whatsapp': {
    id: 'whatsapp',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'twilio': {
    id: 'twilio',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'sendgrid': {
    id: 'sendgrid',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'aws': {
    id: 'aws',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'gcp': {
    id: 'gcp',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'azure': {
    id: 'azure',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'cloudflare': {
    id: 'cloudflare',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'digitalocean': {
    id: 'digitalocean',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'snowflake': {
    id: 'snowflake',
    implementation: 'operator-configurable',
    authScheme: 'connection-string',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'bigquery': {
    id: 'bigquery',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'databricks': {
    id: 'databricks',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'postgresql': {
    id: 'postgresql',
    implementation: 'operator-configurable',
    authScheme: 'connection-string',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'mongodb': {
    id: 'mongodb',
    implementation: 'operator-configurable',
    authScheme: 'connection-string',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'redis': {
    id: 'redis',
    implementation: 'operator-configurable',
    authScheme: 'connection-string',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'elasticsearch': {
    id: 'elasticsearch',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'pipedrive': {
    id: 'pipedrive',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'zendesk': {
    id: 'zendesk',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'freshdesk': {
    id: 'freshdesk',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'figma': {
    id: 'figma',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'canva': {
    id: 'canva',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'adobe': {
    id: 'adobe',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'quickbooks': {
    id: 'quickbooks',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'xero': {
    id: 'xero',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'paypal': {
    id: 'paypal',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'square': {
    id: 'square',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'plaid': {
    id: 'plaid',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'dropbox': {
    id: 'dropbox',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'box': {
    id: 'box',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'sharepoint': {
    id: 'sharepoint',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'instagram': {
    id: 'instagram',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'facebook': {
    id: 'facebook',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'youtube': {
    id: 'youtube',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'posthog': {
    id: 'posthog',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'segment': {
    id: 'segment',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'mixpanel': {
    id: 'mixpanel',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'huggingface': {
    id: 'huggingface',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'wandb': {
    id: 'wandb',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'anthropic-api': {
    id: 'anthropic-api',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'replicate': {
    id: 'replicate',
    implementation: 'operator-configurable',
    authScheme: 'api-key',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'read-write',
    releaseState: 'operator-enabled',
  },
  'epic-fhir': {
    id: 'epic-fhir',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },
  'cerner': {
    id: 'cerner',
    implementation: 'operator-configurable',
    authScheme: 'oauth2',
    scopeSource: 'operator-defined',
    scopes: [],
    supportedActions: [],
    surfaces: ['cloud-web'],
    riskClass: 'high-impact',
    releaseState: 'operator-enabled',
  },};

export function getConnectorCapability(connectorId: string): ConnectorCapabilityRecord | null {
  return CONNECTOR_CAPABILITIES[connectorId] ?? null;
}

/**
 * Ids the managed-cloud connector API may act on at all.
 *
 * Replaces the hand-maintained `VALID_CONNECTOR_IDS` set that used to live in
 * `app/api/connectors/route.ts` and covered 34 of the 89 catalog entries, so an
 * operator who configured any of the other 55 got an id the API advertised as
 * available and then rejected as invalid.
 *
 * Device-local ids are deliberately INCLUDED: the route still has to recognise
 * them in order to answer "connect this from Desktop instead" rather than
 * "unknown connector". `isDeviceLocalConnector()` is what gates persistence.
 */
export function isKnownConnectorId(connectorId: string): boolean {
  return connectorId in CONNECTOR_CAPABILITIES;
}

export function isDeviceLocalConnector(connectorId: string): boolean {
  return getConnectorCapability(connectorId)?.implementation === 'device-local';
}

/**
 * True when present-tense capability copy is permitted for this connector.
 *
 * Only a shipped first-party adapter earns it. Everything else must be
 * described with the non-claiming copy the catalog generates, which is what the
 * repository guard in
 * `features/connectors/data/__tests__/connector-capability-copy.test.ts`
 * enforces.
 */
export function allowsPresentTenseCopy(connectorId: string): boolean {
  return getConnectorCapability(connectorId)?.implementation === 'first-party';
}

/**
 * One user-facing state per connector, combining the static registry with this
 * deployment's real runtime configuration.
 *
 * - `unsupported-here`       — the cloud product cannot ever connect it (device-local).
 * - `needs-reauthorization`  — connected, but the stored grant can no longer be renewed.
 * - `connected`              — a real credential/enablement exists right now.
 * - `connectable`            — not connected, but Connect would genuinely start something.
 * - `not-configured`         — nothing in this deployment can connect it.
 *
 * FAIL-CLOSED RULE: absence of evidence, not absence of a catalog entry. A
 * connector with no runtime evidence resolves to `not-configured`, and a
 * device-local record is `unsupported-here` no matter what the caller passes.
 * But an id this registry has never heard of — an operator-registered OAuth
 * provider outside the 89-entry directory, for instance — still reports the
 * state the SERVER proved: refusing to call a live grant `connected` because
 * marketing never listed it would be a lie in the other direction. `available`
 * and `connected` are computed server-side and are never client input.
 */
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

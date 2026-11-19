import type { ConnectorCallHealth } from './connectors';

export interface ConnectorConsentPoint {
  title: string;
  body: string;
}

export const CONNECTOR_CONSENT_POINTS: readonly ConnectorConsentPoint[] = [
  {
    title: 'Tools AGI does not recognise ask before they act',
    body: 'A connector tool AGI does not recognise waits for your approval on every call until you set it to Allow. A tool AGI knows only reads data, such as a pull-request diff, follows your Tool approvals default, which runs it without asking unless you change it.',
  },
  {
    title: 'A Block is absolute',
    body: 'Blocking a tool is enforced on the server before it runs. A modified client or a direct API call cannot get past it.',
  },
  {
    title: 'Connecting is not the same as granting scopes',
    body: 'Where a provider sign-in is involved, the provider’s own consent screen is what states the permissions being granted. Read it there.',
  },
  {
    title: 'Its tools see the context you send them',
    body: 'A connector receives the conversation content passed to its tools. Only connect services you would hand that content to.',
  },
  {
    title: 'What it fetches stays with the chat',
    body: 'Anything a connector returns is kept as part of the chat it was used in and follows that chat’s retention, so deleting the chat deletes it. Disconnecting stops new fetches but does not remove what past chats already hold.',
  },
  {
    title: 'You can disconnect at any time',
    body: 'Disconnecting removes the connection and deletes every saved per-tool permission for it, so a past “Always allow” does not survive.',
  },
];

export const CONNECTOR_CONSENT_HEADING = 'Before you connect';

export const CONNECTOR_CONSENT_ALLOW = 'Allow';

export const CONNECTOR_CONSENT_DENY = 'Deny';

export function connectorConsentTitle(name: string): string {
  return `Connect ${name}?`;
}

export type ConnectorRiskClass = 'read-only' | 'read-write' | 'high-impact';

export const CONNECTOR_ACCESS_SENTENCES: Readonly<Record<ConnectorRiskClass, string>> = {
  'read-only':
    'This connector is set up to read data in the account you connect, not to change anything there.',
  'read-write':
    'This connector can read data in the account you connect and can also change it, for example by creating, editing or sending items.',
  'high-impact':
    'This connector can read and change sensitive data in the account you connect, such as payment, health or production records.',
};

export const DISCOVERED_CONNECTOR_ACCESS_SENTENCE =
  'This server lists its own tools when you connect. Each tool it marks as read-only, and each that can change data, is shown in Tool permissions, where you can block the ones that change data.';

export const CONNECTOR_ACCESS_PENDING_NOTE =
  'Its exact permissions are named on the provider’s own consent screen.';

export function connectorAccessSentence(riskClass: ConnectorRiskClass | null | undefined): string {
  return riskClass ? CONNECTOR_ACCESS_SENTENCES[riskClass] : DISCOVERED_CONNECTOR_ACCESS_SENTENCE;
}

export const CONNECTOR_RISK_CLASSES = {
  gmail: 'read-write',
  'google-calendar': 'read-write',
  'google-drive': 'read-write',
  'google-contacts': 'read-only',
  notion: 'read-write',
  slack: 'read-write',
  github: 'read-write',
  'github-mcp': 'read-write',
  'google-sheets': 'read-write',
  outlook: 'read-write',
  'microsoft-365': 'read-only',
  onedrive: 'read-only',
  linear: 'read-write',
  jira: 'read-write',
  teams: 'read-only',
  confluence: 'read-write',
  asana: 'read-write',
  zoom: 'read-write',
  hubspot: 'read-write',
  salesforce: 'read-write',
  calendly: 'read-write',
  intercom: 'read-write',
  'google-analytics': 'read-write',
  mailchimp: 'high-impact',
  stripe: 'high-impact',
  shopify: 'high-impact',
  linkedin: 'read-write',
  twitter: 'read-write',
  discord: 'read-write',
  openai: 'read-write',
  elevenlabs: 'read-write',
  'local-filesystem': 'high-impact',
  terminal: 'high-impact',
  'browser-automation': 'high-impact',
  'screen-vision': 'high-impact',
  ollama: 'high-impact',
  airtable: 'read-write',
  monday: 'read-write',
  clickup: 'read-write',
  trello: 'read-write',
  todoist: 'read-write',
  basecamp: 'read-write',
  evernote: 'read-write',
  vercel: 'high-impact',
  sentry: 'read-write',
  datadog: 'read-write',
  pagerduty: 'read-write',
  circleci: 'read-write',
  gitlab: 'read-write',
  bitbucket: 'read-write',
  telegram: 'read-write',
  whatsapp: 'high-impact',
  twilio: 'high-impact',
  sendgrid: 'high-impact',
  aws: 'high-impact',
  gcp: 'high-impact',
  azure: 'high-impact',
  cloudflare: 'high-impact',
  digitalocean: 'high-impact',
  snowflake: 'high-impact',
  bigquery: 'high-impact',
  databricks: 'high-impact',
  elasticsearch: 'high-impact',
  pipedrive: 'read-write',
  zendesk: 'read-write',
  freshdesk: 'read-write',
  figma: 'read-write',
  canva: 'read-write',
  adobe: 'read-write',
  quickbooks: 'high-impact',
  xero: 'high-impact',
  paypal: 'high-impact',
  square: 'high-impact',
  plaid: 'high-impact',
  'bank-accounts': 'high-impact',
  dropbox: 'read-write',
  box: 'read-write',
  docusign: 'high-impact',
  sharepoint: 'read-only',
  instagram: 'read-write',
  facebook: 'read-write',
  youtube: 'read-write',
  posthog: 'read-write',
  segment: 'read-write',
  mixpanel: 'read-write',
  huggingface: 'read-write',
  wandb: 'read-write',
  'anthropic-api': 'read-write',
  replicate: 'read-write',
  'epic-fhir': 'high-impact',
  cerner: 'high-impact',
  healthex: 'high-impact',
} as const satisfies Readonly<Record<string, ConnectorRiskClass>>;

export type CatalogConnectorId = keyof typeof CONNECTOR_RISK_CLASSES;

export function connectorRiskClass(connectorId: string): ConnectorRiskClass | null {
  return Object.prototype.hasOwnProperty.call(CONNECTOR_RISK_CLASSES, connectorId)
    ? CONNECTOR_RISK_CLASSES[connectorId as CatalogConnectorId]
    : null;
}

export const CONNECTOR_DISPLAY_NAMES: Readonly<Record<CatalogConnectorId, string>> = {
  gmail: 'Gmail',
  'google-calendar': 'Google Calendar',
  'google-drive': 'Google Drive',
  'google-contacts': 'Google Contacts',
  notion: 'Notion',
  slack: 'Slack',
  github: 'GitHub',
  'github-mcp': 'GitHub MCP',
  'google-sheets': 'Google Sheets',
  outlook: 'Outlook',
  'microsoft-365': 'Microsoft 365',
  onedrive: 'OneDrive',
  linear: 'Linear',
  jira: 'Jira',
  teams: 'Microsoft Teams',
  confluence: 'Confluence',
  asana: 'Asana',
  zoom: 'Zoom',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  calendly: 'Calendly',
  intercom: 'Intercom',
  'google-analytics': 'Google Analytics',
  mailchimp: 'Mailchimp',
  stripe: 'Stripe',
  shopify: 'Shopify',
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  discord: 'Discord',
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  'local-filesystem': 'Local Filesystem',
  terminal: 'Terminal / Shell',
  'browser-automation': 'Browser Automation',
  'screen-vision': 'Screen Vision',
  ollama: 'Local LLMs (Ollama)',
  airtable: 'Airtable',
  monday: 'Monday.com',
  clickup: 'ClickUp',
  trello: 'Trello',
  todoist: 'Todoist',
  basecamp: 'Basecamp',
  evernote: 'Evernote',
  vercel: 'Vercel',
  sentry: 'Sentry',
  datadog: 'Datadog',
  pagerduty: 'PagerDuty',
  circleci: 'CircleCI',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp Business',
  twilio: 'Twilio',
  sendgrid: 'SendGrid',
  aws: 'Amazon Web Services',
  gcp: 'Google Cloud',
  azure: 'Microsoft Azure',
  cloudflare: 'Cloudflare',
  digitalocean: 'DigitalOcean',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery',
  databricks: 'Databricks',
  elasticsearch: 'Elasticsearch',
  pipedrive: 'Pipedrive',
  zendesk: 'Zendesk',
  freshdesk: 'Freshdesk',
  figma: 'Figma',
  canva: 'Canva',
  adobe: 'Adobe Creative Cloud',
  quickbooks: 'QuickBooks',
  xero: 'Xero',
  paypal: 'PayPal',
  square: 'Square',
  plaid: 'Plaid Dashboard',
  'bank-accounts': 'Bank accounts',
  dropbox: 'Dropbox',
  box: 'Box',
  docusign: 'Docusign',
  sharepoint: 'SharePoint',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  posthog: 'PostHog',
  segment: 'Segment',
  mixpanel: 'Mixpanel',
  huggingface: 'Hugging Face',
  wandb: 'Weights and Biases',
  'anthropic-api': 'Anthropic',
  replicate: 'Replicate',
  'epic-fhir': 'Epic FHIR',
  cerner: 'Cerner',
  healthex: 'HealthEx',
};

export function catalogConnectorName(connectorId: string): string | null {
  return Object.prototype.hasOwnProperty.call(CONNECTOR_DISPLAY_NAMES, connectorId)
    ? CONNECTOR_DISPLAY_NAMES[connectorId as CatalogConnectorId]
    : null;
}

export const CONNECTOR_HEALTH_EXPLANATION =
  'Measured from this account’s own recent calls: how many ran, how many failed, and how long the provider took. A connector whose last calls all failed is paused with a backoff before it is called again.';

export const CONNECTOR_HEALTH_STATE_LABELS: Readonly<Record<ConnectorCallHealth['state'], string>> =
  {
    responding: 'Responding',
    degraded: 'Degraded',
    'not-responding': 'Not responding',
    unknown: 'Not called yet',
  };

const MS_PER_SECOND = 1000;

export function formatConnectorLatency(ms: number | null): string {
  if (ms === null) return 'no timing';
  return ms < MS_PER_SECOND ? `${Math.round(ms)} ms` : `${(ms / MS_PER_SECOND).toFixed(1)} s`;
}

export function connectorHealthCircuitSentence(entry: ConnectorCallHealth): string | null {
  if (entry.circuit === 'open') {
    const wait = Math.max(1, Math.ceil(entry.retryAfterMs / MS_PER_SECOND));
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is allowed in ${wait}s.`;
  }
  if (entry.circuit === 'half-open') {
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is a trial: one success closes the pause.`;
  }
  return null;
}

export function connectorHealthSummary(entry: ConnectorCallHealth): string {
  if (entry.calls === 0) return 'No calls in the last hour.';
  return `${entry.calls} ${entry.calls === 1 ? 'call' : 'calls'}, ${entry.failures} failed, typically ${formatConnectorLatency(entry.p50LatencyMs)}`;
}

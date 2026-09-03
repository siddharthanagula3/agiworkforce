const CONNECTOR_BRAND_SLUGS: Readonly<Record<string, string>> = {
  gmail: 'gmail',
  'google-calendar': 'googlecalendar',
  'google-drive': 'googledrive',
  'google-sheets': 'googlesheets',
  'google-analytics': 'googleanalytics',
  bigquery: 'googlebigquery',
  gcp: 'googlecloud',
  notion: 'notion',
  airtable: 'airtable',
  clickup: 'clickup',
  trello: 'trello',
  todoist: 'todoist',
  basecamp: 'basecamp',
  evernote: 'evernote',
  asana: 'asana',
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket',
  linear: 'linear',
  sentry: 'sentry',
  datadog: 'datadog',
  pagerduty: 'pagerduty',
  circleci: 'circleci',
  vercel: 'vercel',
  n8n: 'n8n',
  confluence: 'confluence',
  atlassian: 'atlassian',
  jira: 'jira',
  zoom: 'zoom',
  discord: 'discord',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  hubspot: 'hubspot',
  calendly: 'calendly',
  intercom: 'intercom',
  zendesk: 'zendesk',
  mailchimp: 'mailchimp',
  mixpanel: 'mixpanel',
  posthog: 'posthog',
  twitter: 'x',
  instagram: 'instagram',
  facebook: 'facebook',
  youtube: 'youtube',
  stripe: 'stripe',
  shopify: 'shopify',
  quickbooks: 'quickbooks',
  xero: 'xero',
  paypal: 'paypal',
  square: 'square',
  figma: 'figma',
  'anthropic-api': 'anthropic',
  huggingface: 'huggingface',
  wandb: 'weightsandbiases',
  replicate: 'replicate',
  ollama: 'ollama',
  elevenlabs: 'elevenlabs',
  modelcontextprotocol: 'modelcontextprotocol',
  context7: 'modelcontextprotocol',
  cloudflare: 'cloudflare',
  digitalocean: 'digitalocean',
  snowflake: 'snowflake',
  databricks: 'databricks',
  postgresql: 'postgresql',
  mongodb: 'mongodb',
  redis: 'redis',
  elasticsearch: 'elasticsearch',
  dropbox: 'dropbox',
  box: 'box',
};

const VERIFIED_BRAND_SLUGS: ReadonlySet<string> = new Set(Object.values(CONNECTOR_BRAND_SLUGS));

export function brandSlugForConnectorId(connectorId: string): string | null {
  return CONNECTOR_BRAND_SLUGS[connectorId] ?? null;
}

function normalizeForBrandMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export function brandSlugForPublisher(publisher: string): string | null {
  const normalized = normalizeForBrandMatch(publisher);
  return VERIFIED_BRAND_SLUGS.has(normalized) ? normalized : null;
}

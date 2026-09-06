export const SCOPE_REVIEW_PENDING = 'needs-vendor-specific-review';

export type ConnectorScopeCeiling = readonly string[] | typeof SCOPE_REVIEW_PENDING;

const GOOGLE_SCOPE_PREFIX = 'https://www.googleapis.com/auth/';
const MS_GRAPH_SCOPE_PREFIX = 'https://graph.microsoft.com/';
const PAYPAL_SCOPE_PREFIX = 'https://uri.paypal.com/services/';
const AZURE_ARM_SCOPE_PREFIX = 'https://management.azure.com/';

const OIDC_SCOPES: readonly string[] = ['openid', 'profile', 'email'];
const OFFLINE_ACCESS_SCOPE = 'offline_access';
const NO_SCOPE_PARAMETER: readonly string[] = Object.freeze([]);

function google(...names: readonly string[]): string[] {
  return names.map((name) => `${GOOGLE_SCOPE_PREFIX}${name}`);
}

function graph(...names: readonly string[]): string[] {
  return names.flatMap((name) => [name, `${MS_GRAPH_SCOPE_PREFIX}${name}`]);
}

const GOOGLE_IDENTITY_SCOPES: readonly string[] = [
  ...OIDC_SCOPES,
  ...google('userinfo.email', 'userinfo.profile'),
];

const SMART_ON_FHIR_PATIENT_SCOPES: readonly string[] = [
  'openid',
  'fhirUser',
  'launch/patient',
  OFFLINE_ACCESS_SCOPE,
  'patient/Patient.read',
  'patient/Observation.read',
  'patient/Condition.read',
  'patient/MedicationRequest.read',
  'patient/AllergyIntolerance.read',
  'patient/DocumentReference.read',
];

export const CONNECTOR_OAUTH_SCOPE_CEILINGS: Readonly<Record<string, ConnectorScopeCeiling>> = {
  gmail: [...GOOGLE_IDENTITY_SCOPES, ...google('gmail.readonly', 'gmail.send')],
  'google-calendar': [...GOOGLE_IDENTITY_SCOPES, ...google('calendar.readonly', 'calendar.events')],
  'google-drive': [...GOOGLE_IDENTITY_SCOPES, ...google('drive.file', 'drive.metadata.readonly')],
  'google-sheets': [
    ...GOOGLE_IDENTITY_SCOPES,
    ...google('spreadsheets.readonly', 'spreadsheets', 'drive.file'),
  ],
  'google-analytics': [...GOOGLE_IDENTITY_SCOPES, ...google('analytics.readonly')],
  youtube: [...GOOGLE_IDENTITY_SCOPES, ...google('youtube.readonly', 'yt-analytics.readonly')],
  bigquery: [...GOOGLE_IDENTITY_SCOPES, ...google('bigquery.readonly', 'devstorage.read_only')],
  gcp: [...GOOGLE_IDENTITY_SCOPES, ...google('cloud-platform.read-only')],

  outlook: [...OIDC_SCOPES, OFFLINE_ACCESS_SCOPE, ...graph('User.Read', 'Mail.Read', 'Mail.Send')],
  onedrive: [
    ...OIDC_SCOPES,
    OFFLINE_ACCESS_SCOPE,
    ...graph('User.Read', 'Files.Read', 'Files.ReadWrite.AppFolder'),
  ],
  teams: [
    ...OIDC_SCOPES,
    OFFLINE_ACCESS_SCOPE,
    ...graph(
      'User.Read',
      'Team.ReadBasic.All',
      'Channel.ReadBasic.All',
      'Chat.Read',
      'ChatMessage.Send',
    ),
  ],
  sharepoint: [...OIDC_SCOPES, OFFLINE_ACCESS_SCOPE, ...graph('User.Read', 'Sites.Read.All')],
  azure: [...OIDC_SCOPES, OFFLINE_ACCESS_SCOPE, `${AZURE_ARM_SCOPE_PREFIX}user_impersonation`],

  slack: [
    'channels:read',
    'channels:history',
    'groups:read',
    'chat:write',
    'users:read',
    'users:read.email',
    'team:read',
    'files:read',
  ],
  notion: NO_SCOPE_PARAMETER,
  intercom: NO_SCOPE_PARAMETER,
  mailchimp: NO_SCOPE_PARAMETER,
  basecamp: NO_SCOPE_PARAMETER,
  evernote: NO_SCOPE_PARAMETER,

  airtable: SCOPE_REVIEW_PENDING,
  clickup: SCOPE_REVIEW_PENDING,
  cloudflare: SCOPE_REVIEW_PENDING,
  datadog: SCOPE_REVIEW_PENDING,
  huggingface: SCOPE_REVIEW_PENDING,
  monday: SCOPE_REVIEW_PENDING,
  pagerduty: SCOPE_REVIEW_PENDING,
  plaid: SCOPE_REVIEW_PENDING,
  posthog: SCOPE_REVIEW_PENDING,
  sentry: SCOPE_REVIEW_PENDING,
  square: SCOPE_REVIEW_PENDING,
  stripe: SCOPE_REVIEW_PENDING,
  todoist: SCOPE_REVIEW_PENDING,
  vercel: SCOPE_REVIEW_PENDING,

  linear: [
    'read',
    'write',
    'issues:create',
    'comments:create',
    'app:assignable',
    'app:mentionable',
  ],
  jira: [OFFLINE_ACCESS_SCOPE, 'read:me', 'read:jira-user', 'read:jira-work', 'write:jira-work'],
  confluence: [
    OFFLINE_ACCESS_SCOPE,
    'read:me',
    'read:confluence-space.summary',
    'read:confluence-content.all',
    'write:confluence-content',
  ],
  asana: [
    ...OIDC_SCOPES,
    'tasks:read',
    'tasks:write',
    'projects:read',
    'sections:read',
    'stories:read',
    'stories:write',
    'teams:read',
    'users:read',
    'workspaces:read',
  ],
  zoom: [
    'user:read:user',
    'meeting:read:meeting',
    'meeting:read:list_meetings',
    'meeting:write:meeting',
    'cloud_recording:read:list_user_recordings',
  ],
  hubspot: [
    'oauth',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.objects.companies.read',
    'crm.objects.deals.read',
    'crm.objects.deals.write',
  ],
  salesforce: [...OIDC_SCOPES, 'id', 'api', 'refresh_token'],
  calendly: SCOPE_REVIEW_PENDING,
  adobe: SCOPE_REVIEW_PENDING,
  shopify: ['read_products', 'read_orders', 'read_customers', 'read_inventory', 'write_products'],
  linkedin: [...OIDC_SCOPES, 'w_member_social'],
  twitter: ['tweet.read', 'tweet.write', 'users.read', OFFLINE_ACCESS_SCOPE],
  discord: ['identify', 'guilds', 'guilds.members.read'],
  gitlab: [...OIDC_SCOPES, 'read_user', 'read_api', 'read_repository'],
  bitbucket: ['account', 'repository', 'pullrequest', 'issue'],
  pipedrive: ['base', 'deals:read', 'contacts:read', 'activities:read', 'users:read', 'search'],
  figma: [
    'current_user:read',
    'files:read',
    'projects:read',
    'file_comments:write',
    'file_dev_resources:read',
  ],
  canva: [
    'profile:read',
    'design:meta:read',
    'design:content:read',
    'design:content:write',
    'asset:read',
    'asset:write',
    'folder:read',
  ],
  quickbooks: [...OIDC_SCOPES, 'com.intuit.quickbooks.accounting'],
  xero: [
    ...OIDC_SCOPES,
    OFFLINE_ACCESS_SCOPE,
    'accounting.settings.read',
    'accounting.contacts.read',
    'accounting.transactions.read',
    'accounting.reports.read',
  ],
  paypal: ['openid', 'email', `${PAYPAL_SCOPE_PREFIX}reporting/search/read`],
  dropbox: [
    'account_info.read',
    'files.metadata.read',
    'files.content.read',
    'files.content.write',
  ],
  box: ['root_readonly', 'item_preview', 'item_download', 'item_upload'],
  instagram: [
    'instagram_basic',
    'instagram_manage_insights',
    'instagram_content_publish',
    'pages_show_list',
  ],
  facebook: [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ],
  'epic-fhir': SMART_ON_FHIR_PATIENT_SCOPES,
  cerner: SMART_ON_FHIR_PATIENT_SCOPES,
};

/**
 * Scopes no enforced ceiling may ever admit, regardless of provider. One
 * place for what "broader than declared" means, read by both the ceiling
 * table test and `scripts/check-connector-scopes.mjs`.
 */
export const FORBIDDEN_CONNECTOR_OAUTH_SCOPES: readonly string[] = [
  'admin',
  'full',
  'default',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/cloud-platform',
  'Files.ReadWrite.All',
  'Sites.FullControl.All',
  'Mail.ReadWrite',
];

/**
 * Strips the Google and Microsoft Graph URL prefixes so the same scope
 * described once (`gmail.readonly`, `User.Read`) matches both the bare and
 * fully-qualified forms `graph()` emits for every Graph scope.
 */
export function canonicalConnectorScope(scope: string): string {
  if (scope.startsWith(GOOGLE_SCOPE_PREFIX)) return scope.slice(GOOGLE_SCOPE_PREFIX.length);
  if (scope.startsWith(MS_GRAPH_SCOPE_PREFIX)) return scope.slice(MS_GRAPH_SCOPE_PREFIX.length);
  return scope;
}

export function getConnectorScopeCeiling(connectorId: string): ConnectorScopeCeiling | null {
  return CONNECTOR_OAUTH_SCOPE_CEILINGS[connectorId] ?? null;
}

export function isConnectorScopeCeilingEnforced(connectorId: string): boolean {
  const ceiling = getConnectorScopeCeiling(connectorId);
  return ceiling !== null && ceiling !== SCOPE_REVIEW_PENDING;
}

export interface FilteredConnectorScopes {
  readonly scopes: string[];
  readonly dropped: string[];
}

export function filterConnectorScopes(
  connectorId: string,
  requested: readonly string[],
): FilteredConnectorScopes {
  const ceiling = getConnectorScopeCeiling(connectorId);
  if (ceiling === null || ceiling === SCOPE_REVIEW_PENDING) {
    return { scopes: [...requested], dropped: [] };
  }
  const permitted = new Set(ceiling);
  const scopes: string[] = [];
  const dropped: string[] = [];
  for (const scope of requested) {
    if (permitted.has(scope)) scopes.push(scope);
    else dropped.push(scope);
  }
  return { scopes, dropped };
}

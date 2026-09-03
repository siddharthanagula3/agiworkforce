import {
  canonicalConnectorScope,
  getConnectorScopeCeiling,
  SCOPE_REVIEW_PENDING,
} from './oauth-scope-allowlist';

export type ScopeAccessClass = 'read' | 'write';

export interface ScopeDescription {
  readonly sentence: string;
  readonly access: ScopeAccessClass;
}

export interface ScopeDescriptionEntry extends ScopeDescription {
  readonly scope: string;
}

export type ConnectorScopeDescriptions =
  | { readonly status: 'known'; readonly entries: readonly ScopeDescriptionEntry[] }
  | { readonly status: 'pending' }
  | { readonly status: 'none' };

const READ: ScopeAccessClass = 'read';
const WRITE: ScopeAccessClass = 'write';

const SCOPE_DESCRIPTIONS: Readonly<Record<string, ScopeDescription>> = {
  openid: { sentence: 'Confirms your identity when you sign in.', access: READ },
  profile: { sentence: 'Reads your name and public profile info.', access: READ },
  email: { sentence: 'Reads your email address.', access: READ },
  'userinfo.email': { sentence: 'Reads your email address.', access: READ },
  'userinfo.profile': { sentence: 'Reads your name and public profile info.', access: READ },
  offline_access: {
    sentence: 'Keeps you signed in so this connection does not require logging in again.',
    access: READ,
  },

  'gmail.readonly': { sentence: 'Reads your Gmail messages and attachments.', access: READ },
  'gmail.send': { sentence: 'Sends email from your Gmail account.', access: WRITE },

  'calendar.readonly': { sentence: 'Reads your calendar events.', access: READ },
  'calendar.events': { sentence: 'Creates and edits your calendar events.', access: WRITE },

  'drive.file': {
    sentence: 'Reads and writes files this app created or you opened with it.',
    access: WRITE,
  },
  'drive.metadata.readonly': {
    sentence: 'Reads file names and metadata across your Drive.',
    access: READ,
  },

  'spreadsheets.readonly': { sentence: 'Reads the contents of your spreadsheets.', access: READ },
  spreadsheets: { sentence: 'Reads and edits your spreadsheets.', access: WRITE },

  'analytics.readonly': { sentence: 'Reads your Analytics reports.', access: READ },

  'youtube.readonly': { sentence: 'Reads your channel and video data.', access: READ },
  'yt-analytics.readonly': { sentence: 'Reads your YouTube Analytics reports.', access: READ },

  'bigquery.readonly': {
    sentence: 'Runs read-only queries and lists your BigQuery datasets.',
    access: READ,
  },
  'devstorage.read_only': {
    sentence: 'Reads objects in your Cloud Storage buckets.',
    access: READ,
  },

  'cloud-platform.read-only': {
    sentence: 'Reads your Google Cloud project resources.',
    access: READ,
  },

  'User.Read': { sentence: 'Reads your basic Microsoft profile.', access: READ },
  'Mail.Read': { sentence: 'Reads your Outlook mail.', access: READ },
  'Mail.Send': { sentence: 'Sends mail from your Outlook account.', access: WRITE },
  'Files.Read': { sentence: 'Reads your OneDrive files.', access: READ },
  'Files.ReadWrite.AppFolder': {
    sentence: "Reads and writes files inside this app's own OneDrive folder.",
    access: WRITE,
  },
  'Team.ReadBasic.All': { sentence: 'Lists the Microsoft Teams you belong to.', access: READ },
  'Channel.ReadBasic.All': { sentence: 'Lists the channels in your Teams.', access: READ },
  'Chat.Read': { sentence: 'Reads your Teams chat messages.', access: READ },
  'ChatMessage.Send': { sentence: 'Sends a message in a Teams chat.', access: WRITE },
  'Sites.Read.All': { sentence: 'Reads SharePoint site content you can access.', access: READ },

  'https://management.azure.com/user_impersonation': {
    sentence: "Manages Azure resources on your behalf, using your account's role permissions.",
    access: WRITE,
  },

  'channels:read': { sentence: 'Lists the public channels in your workspace.', access: READ },
  'channels:history': { sentence: 'Reads messages in public channels.', access: READ },
  'groups:read': { sentence: 'Lists the private channels you belong to.', access: READ },
  'chat:write': { sentence: 'Posts messages as you.', access: WRITE },
  'users:read': { sentence: 'Lists the members of your workspace.', access: READ },
  'users:read.email': { sentence: "Reads workspace members' email addresses.", access: READ },
  'team:read': { sentence: 'Reads basic information about your workspace.', access: READ },
  'files:read': { sentence: 'Reads files you have access to.', access: READ },

  read: { sentence: 'Reads issues, projects, and comments in your workspace.', access: READ },
  write: { sentence: 'Creates and edits issues and projects in your workspace.', access: WRITE },
  'issues:create': { sentence: 'Creates new issues.', access: WRITE },
  'comments:create': { sentence: 'Posts comments on issues.', access: WRITE },
  'app:assignable': { sentence: 'Lets issues be assigned to this app.', access: WRITE },
  'app:mentionable': { sentence: 'Lets this app be @mentioned in comments.', access: WRITE },

  'read:me': { sentence: 'Reads your account profile.', access: READ },
  'read:jira-user': { sentence: "Reads other Jira users' basic profiles.", access: READ },
  'read:jira-work': { sentence: 'Reads issues, projects, and boards.', access: READ },
  'write:jira-work': { sentence: 'Creates and edits issues.', access: WRITE },

  'read:confluence-space.summary': { sentence: 'Lists the spaces you can access.', access: READ },
  'read:confluence-content.all': { sentence: 'Reads pages and their content.', access: READ },
  'write:confluence-content': { sentence: 'Creates and edits pages.', access: WRITE },

  'tasks:read': { sentence: 'Reads tasks in your workspace.', access: READ },
  'tasks:write': { sentence: 'Creates and edits tasks.', access: WRITE },
  'projects:read': { sentence: 'Reads projects and their details.', access: READ },
  'sections:read': { sentence: 'Reads the sections within a project.', access: READ },
  'stories:read': { sentence: 'Reads comments and activity on tasks.', access: READ },
  'stories:write': { sentence: 'Posts comments on tasks.', access: WRITE },
  'teams:read': { sentence: 'Reads the teams in your workspace.', access: READ },
  'workspaces:read': { sentence: 'Reads the workspaces you belong to.', access: READ },

  'user:read:user': { sentence: 'Reads your Zoom profile.', access: READ },
  'meeting:read:meeting': { sentence: 'Reads details of your meetings.', access: READ },
  'meeting:read:list_meetings': { sentence: 'Lists your scheduled meetings.', access: READ },
  'meeting:write:meeting': { sentence: 'Creates and edits meetings.', access: WRITE },
  'cloud_recording:read:list_user_recordings': {
    sentence: 'Lists your cloud recordings.',
    access: READ,
  },

  oauth: {
    sentence: 'Establishes the connection your account authorized.',
    access: READ,
  },
  'crm.objects.contacts.read': { sentence: 'Reads CRM contact records.', access: READ },
  'crm.objects.contacts.write': {
    sentence: 'Creates and edits CRM contact records.',
    access: WRITE,
  },
  'crm.objects.companies.read': { sentence: 'Reads CRM company records.', access: READ },
  'crm.objects.deals.read': { sentence: 'Reads CRM deal records.', access: READ },
  'crm.objects.deals.write': { sentence: 'Creates and edits CRM deal records.', access: WRITE },

  id: { sentence: 'Reads your identity URL.', access: READ },
  api: { sentence: 'Reads and edits records through the REST API.', access: WRITE },
  refresh_token: {
    sentence: 'Keeps the connection active without repeating the login.',
    access: READ,
  },

  read_products: { sentence: 'Reads your product catalog.', access: READ },
  read_orders: { sentence: 'Reads your orders.', access: READ },
  read_customers: { sentence: 'Reads your customer records.', access: READ },
  read_inventory: { sentence: 'Reads your inventory levels.', access: READ },
  write_products: { sentence: 'Creates and edits products.', access: WRITE },

  w_member_social: { sentence: 'Posts on your behalf.', access: WRITE },

  'tweet.read': { sentence: 'Reads posts.', access: READ },
  'tweet.write': { sentence: 'Creates and deletes posts as you.', access: WRITE },
  'users.read': { sentence: 'Reads public profile information.', access: READ },

  identify: { sentence: 'Reads your username and avatar.', access: READ },
  guilds: { sentence: 'Lists the servers you belong to.', access: READ },
  'guilds.members.read': { sentence: 'Reads member lists in your servers.', access: READ },

  read_user: { sentence: 'Reads your profile.', access: READ },
  read_api: {
    sentence: 'Reads project, issue, and merge request data through the API.',
    access: READ,
  },
  read_repository: { sentence: 'Reads repository contents.', access: READ },

  account: { sentence: 'Reads your account profile.', access: READ },
  repository: { sentence: 'Reads repositories you can access.', access: READ },
  pullrequest: { sentence: 'Reads pull requests.', access: READ },
  issue: { sentence: 'Reads issues.', access: READ },

  base: { sentence: 'Reads your account and user info.', access: READ },
  'deals:read': { sentence: 'Reads deals in your pipeline.', access: READ },
  'contacts:read': { sentence: 'Reads your contacts.', access: READ },
  'activities:read': { sentence: 'Reads scheduled activities.', access: READ },
  search: { sentence: 'Searches across your data.', access: READ },

  'current_user:read': { sentence: 'Reads your profile.', access: READ },
  'file_comments:write': { sentence: 'Posts comments on files.', access: WRITE },
  'file_dev_resources:read': {
    sentence: 'Reads developer resources attached to files.',
    access: READ,
  },

  'profile:read': { sentence: 'Reads your profile.', access: READ },
  'design:meta:read': { sentence: 'Reads design titles and metadata.', access: READ },
  'design:content:read': { sentence: 'Reads the content of your designs.', access: READ },
  'design:content:write': { sentence: 'Creates and edits designs.', access: WRITE },
  'asset:read': { sentence: 'Reads assets in your account.', access: READ },
  'asset:write': { sentence: 'Uploads and edits assets.', access: WRITE },
  'folder:read': { sentence: 'Reads the folders in your account.', access: READ },

  'com.intuit.quickbooks.accounting': {
    sentence: 'Reads and edits your accounting data, including invoices and transactions.',
    access: WRITE,
  },

  'accounting.settings.read': { sentence: 'Reads your organization settings.', access: READ },
  'accounting.contacts.read': { sentence: 'Reads your contacts.', access: READ },
  'accounting.transactions.read': { sentence: 'Reads your transactions.', access: READ },
  'accounting.reports.read': { sentence: 'Reads your financial reports.', access: READ },

  'https://uri.paypal.com/services/reporting/search/read': {
    sentence: 'Searches your transaction history.',
    access: READ,
  },

  'account_info.read': { sentence: 'Reads your account info.', access: READ },
  'files.metadata.read': { sentence: 'Reads file and folder names and metadata.', access: READ },
  'files.content.read': { sentence: 'Reads the content of your files.', access: READ },
  'files.content.write': { sentence: 'Creates and edits file content.', access: WRITE },

  root_readonly: { sentence: 'Reads files and folders you can access.', access: READ },
  item_preview: { sentence: 'Generates previews of your files.', access: READ },
  item_download: { sentence: 'Downloads your files.', access: READ },
  item_upload: { sentence: 'Uploads new files.', access: WRITE },

  instagram_basic: { sentence: 'Reads your profile and media.', access: READ },
  instagram_manage_insights: {
    sentence: 'Reads engagement and audience insights.',
    access: READ,
  },
  instagram_content_publish: { sentence: 'Publishes content to your account.', access: WRITE },

  public_profile: { sentence: 'Reads your public profile info.', access: READ },
  pages_show_list: { sentence: 'Lists the Pages you manage.', access: READ },
  pages_read_engagement: { sentence: 'Reads engagement data on your Pages.', access: READ },
  pages_manage_posts: { sentence: 'Creates and edits posts on your Pages.', access: WRITE },

  fhirUser: { sentence: 'Identifies you as the authenticated clinical user.', access: READ },
  'launch/patient': {
    sentence: 'Establishes which patient record the session applies to.',
    access: READ,
  },
  'patient/Patient.read': { sentence: "Reads the patient's demographic record.", access: READ },
  'patient/Observation.read': {
    sentence: "Reads the patient's clinical observations, such as vitals and labs.",
    access: READ,
  },
  'patient/Condition.read': { sentence: "Reads the patient's diagnosed conditions.", access: READ },
  'patient/MedicationRequest.read': {
    sentence: "Reads the patient's prescribed medications.",
    access: READ,
  },
  'patient/AllergyIntolerance.read': {
    sentence: "Reads the patient's recorded allergies.",
    access: READ,
  },
  'patient/DocumentReference.read': {
    sentence: "Reads references to the patient's clinical documents.",
    access: READ,
  },
};

export function describeConnectorScope(scope: string): ScopeDescription | null {
  return SCOPE_DESCRIPTIONS[canonicalConnectorScope(scope)] ?? null;
}

const UNDESCRIBED_SCOPE_FALLBACK: ScopeDescription = {
  sentence: 'This permission has not been described yet.',
  access: WRITE,
};

export function getConnectorScopeDescriptions(connectorId: string): ConnectorScopeDescriptions {
  const ceiling = getConnectorScopeCeiling(connectorId);
  if (ceiling === null) return { status: 'none' };
  if (ceiling === SCOPE_REVIEW_PENDING) return { status: 'pending' };
  const entries = ceiling.map((scope) => {
    const description = describeConnectorScope(scope) ?? UNDESCRIBED_SCOPE_FALLBACK;
    return { scope, ...description };
  });
  return { status: 'known', entries };
}

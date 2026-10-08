import { translateUiPlural } from '@agiworkforce/ui';
import {
  PLUGINS_API_PATH,
  PLUGIN_INSTALLATIONS_API_PATH,
  PLUGIN_MARKETPLACES_API_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH,
} from '@/features/plugins/routes';
import { payloadCeilingBytes } from '@/lib/payload-ceiling';

export const DIRECTORY_SOURCE_AGI = 'agi';
export const DIRECTORY_SOURCE_YOURS = 'yours';
export const DIRECTORY_SOURCE_PARTNERS = 'partners';

export const DIRECTORY_SOURCE_LABEL_AGI = 'Made by AGI';
export const DIRECTORY_SOURCE_LABEL_YOURS = 'Yours';
export const DIRECTORY_SOURCE_LABEL_PARTNERS = 'Partners';

export const SKILL_PUBLISHER_AGI = 'Made by AGI';
export const SKILL_PUBLISHER_YOU = 'Yours';
export const SKILL_PUBLISHER_MANAGED = 'Managed';
export const SKILL_PUBLISHER_PLUGIN = 'From a plugin';
export const SKILL_LICENSE_PREFIX = 'Complete terms in';

export const SKILL_ORIGIN_PERSONAL = 'Created by you';
export const SKILL_ORIGIN_BUNDLED = 'Included with AGI Workforce';
export const SKILL_ORIGIN_MANAGED = 'Managed for this workspace';
export const SKILL_ORIGIN_UNKNOWN_PLUGIN = 'Part of a plugin';

export const SKILL_GROUP_CREATED = 'created';
export const SKILL_GROUP_WORKSPACE = 'workspace';
export const SKILL_GROUP_PLUGINS = 'plugins';
export const SKILL_GROUP_AGI = 'agi';
export const SKILL_MANAGE_GROUPS = [
  { id: SKILL_GROUP_CREATED, heading: 'Created by you' },
  { id: SKILL_GROUP_WORKSPACE, heading: 'From your workspace' },
  { id: SKILL_GROUP_PLUGINS, heading: 'From plugins' },
  { id: SKILL_GROUP_AGI, heading: 'From AGI Workforce' },
] as const;

export function skillWorkspacePluginOrigin(pluginName: string): string {
  return `Provided by your workspace through the ${pluginName} plugin`;
}

export function skillPluginPublisher(pluginName: string): string {
  return `From ${pluginName}`;
}

export function skillCatalogPluginOrigin(pluginName: string): string {
  return `Part of the ${pluginName} plugin, included with AGI Workforce`;
}

export function skillRepositoryPluginOrigin(pluginName: string, marketplace?: string): string {
  return marketplace
    ? `Part of the ${pluginName} plugin from the ${marketplace} marketplace`
    : `Part of the ${pluginName} plugin`;
}

export function skillUploadedPluginOrigin(pluginName: string): string {
  return `Part of ${pluginName}, a plugin you uploaded`;
}

export function skillAuthoredPluginOrigin(pluginName: string): string {
  return `Part of ${pluginName}, a plugin you created`;
}

export const SKILL_STATUS_GROUP_ID = 'status';
export const SKILL_STATUS_GROUP_LABEL = 'Status';
export const SKILL_STATUS_INSTALLED = 'installed';
export const SKILL_STATUS_NOT_INSTALLED = 'not-installed';
export const SKILL_STATUS_INSTALLED_LABEL = 'Installed';
export const SKILL_STATUS_NOT_INSTALLED_LABEL = 'Not installed';

export const SKILL_LIFECYCLE_GROUP_ID = 'lifecycle';
export const SKILL_LIFECYCLE_GROUP_LABEL = 'Status';
export const SKILL_LIFECYCLE_INCLUDED_LABEL = 'Included';
export const SKILL_LIFECYCLE_DRAFT_LABEL = 'Coming later';

export const CONNECTOR_AVAILABILITY_GROUP_ID = 'availability';
export const CONNECTOR_AVAILABILITY_GROUP_LABEL = 'Availability';
export const CONNECTOR_CATEGORY_GROUP_ID = 'category';
export const CONNECTOR_CATEGORY_GROUP_LABEL = 'Category';

export const CONNECTOR_AVAILABILITY_LABELS: Record<string, string> = {
  connect: 'Connect',
  'api-key-form': 'API key',
  'desktop-and-cli': 'Desktop and CLI',
  'needs-setup': 'Needs setup',
};

export const PLUGIN_PUBLISHED_STATUS = 'published';
export const PLUGIN_STATE_INSTALLED = 'Installed';
export const PLUGIN_STATE_INSTALL = 'Install';
export const PLUGIN_STATE_DESKTOP_AND_CLI = 'Desktop and CLI';
export const PLUGIN_UNPUBLISHED_LABEL = 'Coming later';

export const PLUGIN_SOURCE_BUILTIN = 'builtin';
export const PLUGIN_SOURCE_PARTNER = 'partner';
export const PLUGIN_SOURCE_MARKETPLACE = 'marketplace';
export const PLUGIN_SOURCE_FACETS: readonly string[] = [
  PLUGIN_SOURCE_BUILTIN,
  PLUGIN_SOURCE_PARTNER,
  PLUGIN_SOURCE_MARKETPLACE,
];
export const PLUGIN_SOURCE_TAB_LABELS: Readonly<Record<string, string>> = {
  [PLUGIN_SOURCE_BUILTIN]: 'Built in',
  [PLUGIN_SOURCE_PARTNER]: 'Partners',
  [PLUGIN_SOURCE_MARKETPLACE]: 'Marketplace',
};
export const PLUGIN_GROUP_HEADINGS: Readonly<Record<string, string>> = {
  [PLUGIN_SOURCE_BUILTIN]: 'Built-in packs',
  [PLUGIN_SOURCE_PARTNER]: 'Partner plugins',
  [PLUGIN_SOURCE_MARKETPLACE]: 'Marketplace plugins',
};
export const PLUGIN_WORKSPACE_GROUP_ID = 'workspace-plugins';
export const PLUGIN_WORKSPACE_GROUP_HEADING = 'From your workspace';
export const PLUGIN_WORKSPACE_PUBLISHER = 'Your workspace';
export const PLUGIN_STATE_REQUIRED = 'Required';
export const PLUGIN_STATE_TURNED_OFF = 'Turned off';
export const PLUGIN_WORKSPACE_REQUIRED_NOTE =
  'Your workspace requires this plugin, so it stays on with all its skills.';
export const PLUGIN_WORKSPACE_DEFAULT_NOTE =
  'Your workspace installs this plugin for everyone. You can turn it off.';
export const PLUGIN_WORKSPACE_AVAILABLE_NOTE = 'Your workspace offers this plugin to its members.';

export function workspaceGroupHeading(workspaceName: string | null): string {
  return workspaceName ? `From ${workspaceName}` : PLUGIN_WORKSPACE_GROUP_HEADING;
}

export const PLUGIN_COMMUNITY_GROUP_ID = 'community-plugins';
export const PLUGIN_COMMUNITY_GROUP_HEADING = 'Community';
export const PLUGIN_COMMUNITY_INSTALL_NOTICE =
  'Its developer published this plugin to the directory. It was reviewed before it was listed, and it runs with the access you give it.';
export const PLUGIN_SUBMISSION_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Submitted for review',
  approved: 'Listed in the directory',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
  suspended: 'Taken out of the directory',
};
export const PLUGIN_SUBMITTED_NOTICE =
  'Submitted for review. You get a notification when it has been reviewed.';
export const PLUGIN_SUBMISSION_WITHDRAWN_NOTICE = 'Withdrawn from the directory.';
export const PLUGIN_SUBMIT_FAILED_COPY = 'This plugin could not be submitted. Try again.';
export const PLUGIN_WITHDRAW_FAILED_COPY = 'The submission could not be withdrawn. Try again.';

export const PLUGIN_USER_GROUP_ID = 'user-marketplaces';
export const PLUGIN_USER_GROUP_HEADING = 'Your marketplaces';

export const PLUGIN_WORKS_WITH_GROUP_ID = 'works-with';
export const PLUGIN_WORKS_WITH_GROUP_LABEL = 'Works with';
export const PLUGIN_WORKS_WITH_WEB = 'web';
export const PLUGIN_WORKS_WITH_CLI = 'claude-code';
export const PLUGIN_WORKS_WITH_COWORK = 'cowork';
export const PLUGIN_WORKS_WITH_ORDER: readonly string[] = [
  PLUGIN_WORKS_WITH_WEB,
  PLUGIN_WORKS_WITH_CLI,
  PLUGIN_WORKS_WITH_COWORK,
];
export const PLUGIN_WORKS_WITH_LABELS: Readonly<Record<string, string>> = {
  [PLUGIN_WORKS_WITH_WEB]: 'Web',
  [PLUGIN_WORKS_WITH_CLI]: 'CLI',
  [PLUGIN_WORKS_WITH_COWORK]: 'Cowork',
};

export const PLUGIN_COUNT_SUFFIX = 'plugins';
export const PLUGIN_CATEGORY_GROUP_LABEL = 'Category';
export const PLUGIN_PUBLISHER_GROUP_LABEL = 'Publisher';
export const PLUGIN_PUBLISHER_MORE_HEADING_PREFIX = 'Plugins by';
export const PLUGIN_PERMISSIONS_NOTICE_PREFIX = 'It says it needs these permissions:';
export const PLUGIN_PERMISSIONS_NOTICE_SUFFIX =
  'Installing it accepts them, and you can remove it at any time.';
export const PLUGIN_PUBLISHER_KIND_LABELS: Readonly<Record<string, string>> = {
  'first-party': 'First-party',
  partner: 'Partner',
  'third-party': 'Community',
};
export const PLUGIN_UPDATES_PATH = `${PLUGINS_API_PATH}/updates`;
export const PLUGIN_SCAN_LEAF = 'scan';
export const PLUGIN_VERSIONS_LEAF = 'versions';
export const PLUGIN_UPDATE_FAILED_COPY = 'Could not change the plugin version. Try again.';
export const PLUGIN_REPAIR_RELOAD_ID = 'reload-skills';
export const PLUGIN_REPAIR_MISSING_SKILLS_COPY = 'These skills did not load:';
export const PLUGIN_REPAIR_RELOAD_LABEL = 'Reinstall';
export const PLUGIN_REPAIR_CONNECTOR_ID_PREFIX = 'connector:';
export const PLUGIN_REPAIR_CONNECTOR_COPY = 'Its skills need the connector';
export const PLUGIN_REPAIR_CONNECT_LABEL = 'Connect';
export const PLUGIN_INSTALLS_DISABLED_CODE = 'PLUGIN_INSTALLS_DISABLED';
export const PLUGIN_NOT_INSTALLABLE_CODE = 'PLUGIN_NOT_INSTALLABLE';
export const PLUGIN_INSTALLS_DISABLED_STATUS = 503;
export const PLUGIN_CONFLICT_STATUS = 409;
export const PLUGIN_MESSAGE_STATUSES: readonly number[] = [403, 404, 409, 502, 503];

export const DIRECTORY_PAGE_SIZE = 100;
export const DIRECTORY_SORT_POPULAR = 'popular';
export const DIRECTORY_SORT_NAME = 'name';
export const DIRECTORY_DEFAULT_SORT = DIRECTORY_SORT_POPULAR;

export const CONNECTOR_TAB_OFFICIAL_LABEL = 'Official';
export const CONNECTOR_TAB_COMMUNITY_LABEL = 'Community';
export const CONNECTOR_TAB_OFFICIAL_BADGE = 'official';
export const CONNECTOR_TAB_COMMUNITY_BADGE = 'community';
export const CONNECTOR_TAB_HEADINGS: Readonly<Record<string, string>> = {
  [CONNECTOR_TAB_OFFICIAL_BADGE]: 'Official connectors',
  [CONNECTOR_TAB_COMMUNITY_BADGE]: 'Community connectors',
};

export const CONNECTOR_INCLUDE_LOCAL_TOGGLE_ID = 'include-local';
export const CONNECTOR_INCLUDE_LOCAL_TOGGLE_LABEL = 'Include desktop and CLI connectors';

export const CURATED_CATEGORY_TO_DIRECTORY: Readonly<Record<string, string>> = {
  AI: 'Code',
  Cloud: 'Code',
  Developer: 'Code',
  Communication: 'Communication',
  CRM: 'Sales and marketing',
  Marketing: 'Sales and marketing',
  Social: 'Sales and marketing',
  Data: 'Data',
  Design: 'Design',
  Finance: 'Financial services',
  Healthcare: 'Health',
  Productivity: 'Productivity',
  Storage: 'Productivity',
};

export const CONNECTOR_STATE_NEEDS_SETUP = 'Needs setup';
export const CONNECTOR_STATE_DESKTOP_AND_CLI = 'Desktop and CLI';
export const CONNECTOR_STATE_UNAVAILABLE = 'Not available yet';

export const CONNECTOR_COUNT_SUFFIX = 'connectors';
export const CONNECTOR_COUNT_INDEXING_SUFFIX = 'connectors indexed so far';
export const CONNECTOR_INDEXING_NOTICE =
  'The connector directory is still being indexed, so a search can miss a server that has not been crawled yet.';
export const CONNECTOR_SETUP_NOTICE_REGISTRY =
  'This connector does not say how it authenticates, so it cannot be connected from the browser yet.';
export const CONNECTOR_SETUP_NOTICE_CURATED_PREFIX = 'Connecting';
export const CONNECTOR_SETUP_NOTICE_CURATED_SUFFIX =
  'needs credentials this deployment has not been given yet.';
export const CONNECTOR_SETUP_KIND_NO_REMOTE = 'no-remote';
export const CONNECTOR_SETUP_KIND_DEVICE_LOCAL = 'device-local';
export const CONNECTOR_SETUP_KIND_REGION = 'region';
export const DESKTOP_DOWNLOAD_PATH = '/download';
export const CONNECTOR_TERMS_PATH = '/terms';
export const RELATED_CONNECTOR_LIMIT = 6;
export const RELATED_CONNECTOR_FETCH_LIMIT = 25;
export const CURATED_SIGN_IN_AUTH_TYPES: readonly string[] = ['oauth', 'api_key'];
export const REGISTRY_SIGN_IN_AUTH_MODES: readonly string[] = ['oauth', 'api-key'];
export const REGISTRY_OPEN_AUTH_MODE = 'none';
export const NEW_ENTRY_WINDOW_DAYS = 30;
export const MS_PER_DAY = 86_400_000;

export const SKILLS_FAILED_COPY = 'Skills are unavailable right now.';
export const CONNECTORS_FAILED_COPY = 'The connector directory is unavailable right now.';
export const PLUGINS_FAILED_COPY = 'The plugin catalog is unavailable right now.';
export const MARKETPLACE_FAILED_COPY = 'That marketplace could not be synced.';
export const CONNECT_FAILED_COPY = 'Could not start this connection. Try again later.';
export const SKILL_INSTALL_FAILED_COPY = 'Could not install this skill. Try again.';
export const SKILL_UNINSTALL_FAILED_COPY = 'Could not remove this skill. Try again.';
export const SKILL_DELETE_FAILED_COPY = 'Could not delete this skill. Try again.';
export const PLUGIN_INSTALL_FAILED_COPY = 'Could not install this plugin. Try again.';
export const PLUGIN_UNINSTALL_FAILED_COPY = 'Could not uninstall this plugin. Try again.';
export const PLUGIN_REMOVE_TOGETHER_TITLE = 'Remove these plugins together?';
export const PLUGIN_REMOVE_TOGETHER_LABEL = 'Remove together';
export const PLUGIN_TURN_OFF_TOGETHER_TITLE = 'Turn these plugins off together?';
export const PLUGIN_TURN_OFF_TOGETHER_LABEL = 'Turn off together';
export const PLUGIN_ENABLE_FAILED_COPY = 'Could not change this plugin. Try again.';
export const MARKETPLACE_REFRESH_FAILED_COPY = 'Could not refresh this marketplace. Try again.';
export const MARKETPLACE_REMOVE_UNSENT_COPY =
  'The remove request could not be sent. Check your connection and try again.';
export const RATE_LIMITED_COPY = 'Too many requests. Wait a minute and try again.';
export const RATE_LIMITED_STATUS = 429;
export const CONNECTOR_REAUTHORIZATION_COPY = 'Needs to be reconnected.';
// Says what was observed, not why. The account's recent calls to this connector
// all failed; whether the provider is down, rate limiting, or refusing this
// workspace is something this side of the connection cannot tell.
export const CONNECTOR_NOT_RESPONDING_COPY = 'Not responding to recent requests.';

export const CSRF_HEADER = 'x-csrf-token';
export const JSON_CONTENT_TYPE = 'application/json';

export const DIRECTORY_QUERY_SEARCH = 'search';
export const DIRECTORY_QUERY_CATEGORY = 'category';
export const DIRECTORY_QUERY_BADGE = 'badge';
export const DIRECTORY_QUERY_CONNECTABLE_ONLY = 'connectableOnly';
export const DIRECTORY_QUERY_TRUE = 'true';
export const DIRECTORY_QUERY_SORT = 'sort';
export const DIRECTORY_QUERY_SOURCE = 'source';
export const DIRECTORY_QUERY_WORKS_WITH = 'worksWith';
export const DIRECTORY_QUERY_PUBLISHER = 'publisher';
export const DIRECTORY_QUERY_LIMIT = 'limit';
export const DIRECTORY_QUERY_CURSOR = 'cursor';
export const SKILLS_PATH = '/api/skills';
export const SKILL_INSTALLS_PATH = '/api/skills/installs';
export const SKILL_CATALOG_PARAM = 'catalog=all';
export const PLUGINS_PATH = PLUGINS_API_PATH;
export const PLUGIN_INSTALLATIONS_PATH = PLUGIN_INSTALLATIONS_API_PATH;
export const PLUGIN_MARKETPLACES_PATH = PLUGIN_MARKETPLACES_API_PATH;
export const PLUGIN_SOURCE_KIND_REPOSITORY = 'repository';
export const PLUGIN_SOURCE_KIND_AUTHORED = 'authored';
export const PLUGIN_UPLOADS_PATH = `${PLUGINS_API_PATH}/uploads`;
export const PLUGIN_AUTHORED_PATH = '/api/plugins/authored';
export const PLUGIN_EDIT_LOAD_FAILED_COPY = 'That plugin could not be opened for editing.';
export const PLUGIN_EDIT_FAILED_COPY = 'That plugin could not be saved.';
export const PLUGIN_CUSTOMIZE_FAILED_COPY = 'A copy of that plugin could not be made.';
export const EDIT_PLUGIN_DONE_TITLE = 'Plugin saved';
export const UPLOAD_FILE_FIELD = 'file';
export const PLUGIN_UPLOAD_FAILED_COPY = 'That plugin could not be uploaded.';
export const PLUGIN_CREATE_FAILED_COPY = 'That plugin could not be created.';
export const SKILL_UPLOAD_FAILED_COPY = 'That skill could not be uploaded.';
export const SKILL_UPLOAD_PAYLOAD_LIMIT_BYTES = payloadCeilingBytes(SKILLS_PATH);
const BYTES_PER_MEGABYTE = 1024 * 1024;
export function skillUploadTooLargeCopy(): string {
  return `This file is larger than ${Math.floor(SKILL_UPLOAD_PAYLOAD_LIMIT_BYTES / BYTES_PER_MEGABYTE)} MB.`;
}
export const SKILL_CREATOR_SKILL_NAME = 'skill-creator';
export const UPLOAD_PLUGIN_DONE_TITLE = 'Plugin installed';
export const UPLOAD_SKILL_DONE_TITLE = 'Skill added';
export const CREATE_PLUGIN_DONE_TITLE = 'Plugin created';

const OMITTED_FILES_SHOWN = 3;

export function uploadOmittedFilesLine(paths: readonly string[]): string {
  const shown = paths.slice(0, OMITTED_FILES_SHOWN).join(', ');
  const more =
    paths.length > OMITTED_FILES_SHOWN
      ? ` ${translateUiPlural('common', 'counts.andMore', paths.length - OMITTED_FILES_SHOWN, {
          one: 'and {{count}} more',
          other: 'and {{count}} more',
        })}`
      : '';
  return translateUiPlural(
    'common',
    'counts.omittedFiles',
    paths.length,
    {
      one: 'Left out a file that is not text: {{files}}. Skills can bundle text files such as references and scripts.',
      other:
        'Left out {{count}} files that are not text: {{files}}. Skills can bundle text files such as references and scripts.',
    },
    { files: `${shown}${more}` },
  );
}

export function uploadSkillCountLine(count: number): string {
  return translateUiPlural('common', 'counts.skillsAvailable', count, {
    one: '{{count}} skill is now available in chat.',
    other: '{{count}} skills are now available in chat.',
  });
}

const DEPENDENCY_NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export function uploadDependenciesInstalledLine(dependencyNames: readonly string[]): string {
  return translateUiPlural(
    'common',
    'counts.dependenciesInstalled',
    dependencyNames.length,
    {
      one: 'Also installed the plugin it depends on: {{names}}.',
      other: 'Also installed the plugins it depends on: {{names}}.',
    },
    { names: DEPENDENCY_NAMES.format(dependencyNames) },
  );
}

export function pluginConnectorsLines(
  connectors: {
    added: ReadonlyArray<{ name: string; signInRequired: boolean }>;
    failed: ReadonlyArray<{ name: string; reason: string }>;
  } | null,
): string[] {
  if (!connectors) return [];
  const lines: string[] = [];
  if (connectors.added.length > 0) {
    const names = connectors.added.map((connector) => connector.name);
    lines.push(
      `Added its ${names.length === 1 ? 'MCP server' : 'MCP servers'} as ${names.length === 1 ? 'a connector' : 'connectors'}: ${DEPENDENCY_NAMES.format(names)}.`,
    );
    if (connectors.added.some((connector) => connector.signInRequired)) {
      lines.push('Sign in to them under Connectors before they can be used.');
    }
  }
  for (const failure of connectors.failed) {
    lines.push(`${failure.name} was not added as a connector: ${failure.reason}`);
  }
  return lines;
}

export function pluginDependenciesInstalledLine(
  pluginName: string,
  dependencyNames: readonly string[],
): string {
  return translateUiPlural(
    'common',
    'counts.pluginDependenciesInstalled',
    dependencyNames.length,
    {
      one: 'Installed {{plugin}} and the plugin it depends on: {{names}}.',
      other: 'Installed {{plugin}} and the plugins it depends on: {{names}}.',
    },
    { plugin: pluginName, names: DEPENDENCY_NAMES.format(dependencyNames) },
  );
}
export const PLUGIN_MARKETPLACE_ENTRIES_PATH = `${PLUGIN_MARKETPLACES_API_PATH}/entries`;
export const PLUGIN_MARKETPLACE_INSTALLATIONS_PATH = PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH;

export const ADD_MARKETPLACE_TRIGGER_LABEL = 'Add marketplace';
export const MARKETPLACE_TRIGGER_CLASS =
  'inline-flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

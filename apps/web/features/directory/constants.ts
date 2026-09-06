export const DIRECTORY_SOURCE_AGI = 'agi';
export const DIRECTORY_SOURCE_YOURS = 'yours';
export const DIRECTORY_SOURCE_PARTNERS = 'partners';

export const DIRECTORY_SOURCE_LABEL_AGI = 'Made by AGI';
export const DIRECTORY_SOURCE_LABEL_YOURS = 'Yours';
export const DIRECTORY_SOURCE_LABEL_PARTNERS = 'Partners';

export const SKILL_PUBLISHER_AGI = 'Made by AGI';
export const SKILL_PUBLISHER_YOU = 'Yours';
export const SKILL_PUBLISHER_MANAGED = 'Managed';
export const SKILL_LICENSE_PREFIX = 'Complete terms in';

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

export const PLUGIN_SORT_INSTALLS = 'installs';
export const PLUGIN_COUNT_SUFFIX = 'plugins';
export const PLUGIN_INSTALLS_DISABLED_CODE = 'PLUGIN_INSTALLS_DISABLED';
export const PLUGIN_NOT_INSTALLABLE_CODE = 'PLUGIN_NOT_INSTALLABLE';
export const PLUGIN_INSTALLS_DISABLED_STATUS = 503;
export const PLUGIN_CONFLICT_STATUS = 409;
export const PLUGIN_MESSAGE_STATUSES: readonly number[] = [404, 409, 502, 503];

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

export const CONNECTOR_COUNT_SUFFIX = 'connectors';
export const CONNECTOR_SETUP_NOTICE_REGISTRY =
  'This connector does not say how it authenticates, so it cannot be connected from the browser yet.';
export const CONNECTOR_SETUP_NOTICE_CURATED_PREFIX = 'Connecting';
export const CONNECTOR_SETUP_NOTICE_CURATED_SUFFIX =
  'needs credentials this deployment has not been given yet.';
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
export const PLUGIN_INSTALL_FAILED_COPY = 'Could not install this plugin. Try again.';
export const PLUGIN_UNINSTALL_FAILED_COPY = 'Could not uninstall this plugin. Try again.';
export const RATE_LIMITED_COPY = 'Too many requests. Wait a minute and try again.';
export const RATE_LIMITED_STATUS = 429;
export const CONNECTOR_REAUTHORIZATION_COPY = 'Needs to be reconnected.';

export const CSRF_HEADER = 'x-csrf-token';
export const JSON_CONTENT_TYPE = 'application/json';

export const CONNECTOR_ICON_PATH = '/api/connectors/directory/icon';
export const CONNECTOR_DIRECTORY_PATH = '/api/connectors/directory';
export const CONNECTORS_PATH = '/api/connectors';
export const DIRECTORY_QUERY_SEARCH = 'search';
export const DIRECTORY_QUERY_CATEGORY = 'category';
export const DIRECTORY_QUERY_BADGE = 'badge';
export const DIRECTORY_QUERY_CONNECTABLE_ONLY = 'connectableOnly';
export const DIRECTORY_QUERY_TRUE = 'true';
export const DIRECTORY_QUERY_SORT = 'sort';
export const DIRECTORY_QUERY_SOURCE = 'source';
export const DIRECTORY_QUERY_WORKS_WITH = 'worksWith';
export const DIRECTORY_QUERY_LIMIT = 'limit';
export const DIRECTORY_QUERY_CURSOR = 'cursor';
export const SKILLS_PATH = '/api/skills';
export const SKILL_INSTALLS_PATH = '/api/skills/installs';
export const SKILL_CATALOG_PARAM = 'catalog=all';
export const PLUGINS_PATH = '/api/plugins';
export const PLUGIN_INSTALLATIONS_PATH = '/api/plugins/installations';
export const PLUGIN_MARKETPLACES_PATH = '/api/plugins/marketplaces';
export const PLUGIN_MARKETPLACE_ENTRIES_PATH = '/api/plugins/marketplaces/entries';
export const PLUGIN_MARKETPLACE_INSTALLATIONS_PATH = '/api/plugins/marketplace-installations';

export const ADD_MARKETPLACE_TRIGGER_LABEL = 'Add marketplace';
export const MARKETPLACE_TRIGGER_CLASS =
  'inline-flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

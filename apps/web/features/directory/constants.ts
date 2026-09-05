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

export const PLUGIN_STATUS_GROUP_ID = 'status';
export const PLUGIN_STATUS_GROUP_LABEL = 'Status';
export const PLUGIN_STATUS_INSTALLED = 'installed';
export const PLUGIN_STATUS_NOT_INSTALLED = 'not-installed';
export const PLUGIN_STATUS_INSTALLED_LABEL = 'Installed';
export const PLUGIN_STATUS_NOT_INSTALLED_LABEL = 'Not installed';

export const DIRECTORY_PAGE_SIZE = 100;
export const NEW_ENTRY_WINDOW_DAYS = 30;
export const MS_PER_DAY = 86_400_000;

export const SKILLS_FAILED_COPY = 'Skills are unavailable right now.';
export const CONNECTORS_FAILED_COPY = 'The connector directory is unavailable right now.';
export const PLUGINS_FAILED_COPY = 'The plugin catalog is unavailable right now.';
export const MARKETPLACE_FAILED_COPY = 'That marketplace could not be synced.';
export const CONNECT_FAILED_COPY = 'Could not start this connection. Try again later.';
export const CONNECTOR_REAUTHORIZATION_COPY = 'Needs to be reconnected.';

export const CSRF_HEADER = 'x-csrf-token';
export const JSON_CONTENT_TYPE = 'application/json';

export const CONNECTOR_ICON_PATH = '/api/connectors/directory/icon';
export const CONNECTOR_DIRECTORY_PATH = '/api/connectors/directory';
export const CONNECTORS_PATH = '/api/connectors';
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

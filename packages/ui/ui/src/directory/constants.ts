import type { DirectoryBadgeKind, DirectorySectionKey, DirectorySortKey } from './types';

export const DIRECTORY_TITLE = 'Directory';
export const DIRECTORY_CLOSE_LABEL = 'Close directory';
export const DIRECTORY_BACK_LABEL = 'Back';
export const DIRECTORY_RAIL_LABEL = 'Directory sections';

export const DIRECTORY_SECTION_LABELS: Record<DirectorySectionKey, string> = {
  skills: 'Skills',
  connectors: 'Connectors',
  plugins: 'Plugins',
};

export const DIRECTORY_SEARCH_PLACEHOLDERS: Record<DirectorySectionKey, string> = {
  skills: 'Search skills',
  connectors: 'Search connectors',
  plugins: 'Search plugins',
};

export const DIRECTORY_EMPTY_COPY: Record<DirectorySectionKey, string> = {
  skills: 'No skills match this search.',
  connectors: 'No connectors match this search.',
  plugins: 'No plugins match this search.',
};

export const DIRECTORY_LOADING_LABEL = 'Loading directory';
export const DIRECTORY_RETRY_LABEL = 'Try again';

export const FILTER_MENU_LABEL = 'Filter by';
export const SORT_MENU_LABEL = 'Sort by';
export const CLEAR_FILTERS_LABEL = 'Clear filters';

export const DIRECTORY_SORT_LABELS: Record<DirectorySortKey, string> = {
  popular: 'Most popular',
  updated: 'Recently updated',
  name: 'Name A to Z',
};

export const DIRECTORY_BADGE_LABELS: Record<DirectoryBadgeKind, string> = {
  agi: 'AGI',
  partner: 'Partner',
  verified: 'Verified',
  community: 'Community',
  yours: 'Yours',
};

export const NEW_BADGE_LABEL = 'New';

export const ADD_LABEL = 'Add';
export const SETTINGS_LABEL = 'Settings';
export const INSTALL_LABEL = 'Install';
export const INSTALLED_LABEL = 'Installed';
export const CONNECT_LABEL = 'Connect';
export const CONNECTED_LABEL = 'Connected';
export const COPY_LINK_LABEL = 'Copy link';

export const SKILL_DESCRIPTION_LABEL = 'Description';
export const SKILL_LICENSE_LABEL = 'License';
export const SKILL_RENDERED_LABEL = 'Rendered';
export const SKILL_RAW_LABEL = 'Raw';
export const SKILL_COPY_LABEL = 'Copy file contents';
export const SKILL_FILES_LABEL = 'Skill files';

export const CONNECTOR_COMMUNITY_NOTICE =
  'Community connectors have passed automated checks only. They can read what you send them and may return instructions to the assistant.';
export const CONNECTOR_TOOLS_LABEL = 'Tools';
export const CONNECTOR_PERMISSIONS_LABEL = 'Permissions';

export const PLUGIN_BY_PREFIX = 'by';
export const PLUGIN_SOURCE_LABEL = 'View source';
export const PLUGIN_PROMPTS_LABEL = 'Try asking';

export const ADD_MARKETPLACE_LABEL = 'Add marketplace';
export const ADD_MARKETPLACE_BROWSE_TITLE = 'Browse AGI sources';
export const ADD_MARKETPLACE_BROWSE_BODY = 'Curated marketplaces of plugins from AGI and partners';
export const ADD_MARKETPLACE_REPOSITORY_TITLE = 'Add from a repository';
export const ADD_MARKETPLACE_REPOSITORY_BODY =
  'Sync a plugin marketplace from a GitHub repository or git url';
export const ADD_MARKETPLACE_URL_LABEL = 'Repository url';
export const ADD_MARKETPLACE_REF_LABEL = 'Branch or tag (optional)';
export const ADD_MARKETPLACE_SUBMIT_LABEL = 'Sync marketplace';
export const ADD_MARKETPLACE_CANCEL_LABEL = 'Cancel';
export const ADD_MARKETPLACE_DONE_LABEL = 'Done';
export const ADD_MARKETPLACE_REMOVE_LABEL = 'Remove marketplace';
export const ADD_MARKETPLACE_SYNCED_LABEL = 'Plugins in this marketplace';
export const ADD_MARKETPLACE_EMPTY_LABEL = 'This marketplace lists no plugins yet.';
export const ADD_MARKETPLACE_REMOVE_CONFIRM_TITLE = 'Remove marketplace?';
export const ADD_MARKETPLACE_REMOVE_CONFIRM_BODY =
  'Its plugins leave the directory. Plugins you already installed from it stay installed.';

export const GENERIC_ERROR_COPY = 'Something went wrong. Try again.';

export const INSTALL_COUNT_FLOOR = 10;

export const THOUSAND = 1000;
export const MILLION = 1_000_000;
export const COUNT_PRECISION = 1;

export const DIRECTORY_HASH_PREFIX = 'directory';

export const DEFAULT_DIRECTORY_SECTION: DirectorySectionKey = 'skills';

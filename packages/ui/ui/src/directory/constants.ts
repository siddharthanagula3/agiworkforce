import type { DirectoryBadgeKind, DirectorySectionKey, DirectorySortKey } from './types';

export const DIRECTORY_BACK_LABEL = 'Back';

export const DIRECTORY_SECTION_LABELS: Record<DirectorySectionKey, string> = {
  skills: 'Skills',
  connectors: 'Connectors',
  plugins: 'Plugins',
};

export const DIRECTORY_INSTALLED_HEADINGS: Record<DirectorySectionKey, string> = {
  skills: 'Installed',
  connectors: 'Connected',
  plugins: 'Installed',
};

export const DIRECTORY_CATALOG_HEADINGS: Record<DirectorySectionKey, string> = {
  skills: 'All skills',
  connectors: 'All connectors',
  plugins: 'All plugins',
};

export const CONNECTOR_POPULAR_HEADING = 'Popular';

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

export const DIRECTORY_SOURCE_ALL_ID = 'all';
export const DIRECTORY_SOURCE_ALL_LABEL = 'All';

export const FILTER_MENU_LABEL = 'Filter by';
export const SORT_MENU_LABEL = 'Sort by';
export const CLEAR_FILTERS_LABEL = 'Clear filters';

export const DIRECTORY_SORT_LABELS: Record<DirectorySortKey, string> = {
  popular: 'Most popular',
  updated: 'Recently updated',
  name: 'Name A to Z',
};

export const DIRECTORY_BADGE_LABELS: Record<DirectoryBadgeKind, string> = {
  agi: 'Made by AGI',
  partner: 'Partner',
  verified: 'Verified',
  community: 'Community',
  yours: 'Yours',
};

export const SKILL_SOURCE_AGI_LABEL = 'Made by AGI';
export const SKILL_SOURCE_YOURS_LABEL = 'Yours';

export const NEW_BADGE_LABEL = 'New';

export const ADD_LABEL = 'Add';
export const SETTINGS_LABEL = 'Settings';
export const REMOVE_LABEL = 'Remove';
export const INSTALL_LABEL = 'Install';
export const UNINSTALL_LABEL = 'Uninstall';
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
export const ADD_MARKETPLACE_INTRO = 'Choose where these plugins come from.';
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
export const MARKETPLACE_SYNC_FAILED_COPY = 'That marketplace could not be synced.';

export const INSTALL_COUNT_FLOOR = 10;

export const THOUSAND = 1000;
export const MILLION = 1_000_000;
export const COUNT_PRECISION = 1;

export const SKILL_NO_PREVIEW_COPY = 'No preview. This file type cannot be previewed.';
export const SKILL_DOWNLOAD_FILE_LABEL = 'Download file';

export const CONNECTOR_COMMUNITY_NOTICE_SHORT =
  'Community connectors have passed automated checks only. They may not meet the quality of verified connectors.';
export const CONNECTOR_DEVELOPED_BY_PREFIX = 'Developed by';
export const CONNECTOR_TRUST_COPY =
  'Only use connectors from developers you trust. AGI does not control which tools a developer offers and cannot verify that they work as intended or will not change.';
export const CONNECTOR_CATEGORIES_LABEL = 'Categories';
export const CONNECTOR_DETAILS_LABEL = 'Details';
export const CONNECTOR_AUTHOR_LABEL = 'Author';
export const CONNECTOR_URL_LABEL = 'Connector URL';
export const CONNECTOR_MORE_INFO_LABEL = 'More info';
export const CONNECTOR_DOCUMENTATION_LABEL = 'Documentation';
export const CONNECTOR_WEBSITE_LABEL = 'Website';
export const CONNECTOR_SUPPORT_LABEL = 'Support';
export const CONNECTOR_PRIVACY_LABEL = 'Privacy Policy';
export const CONNECTOR_DISCONNECT_LABEL = 'Disconnect';
export const COPY_VALUE_LABEL = 'Copy';
export const SHOW_MORE_PREFIX = '+';
export const SHOW_MORE_SUFFIX = 'more';
export const SHOW_LESS_LABEL = 'Show less';
export const CHIP_PREVIEW_COUNT = 8;

export const MARKETPLACE_UNAVAILABLE_COPY = 'Plugin marketplaces are not available yet.';

export const INSTALL_CONFIRM_TITLE_PREFIX = 'Install';
export const INSTALL_CONFIRM_CANCEL_LABEL = 'Cancel';

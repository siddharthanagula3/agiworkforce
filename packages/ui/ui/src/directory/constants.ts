import type {
  DirectoryBadgeKind,
  DirectoryConnectableMode,
  DirectorySectionKey,
  DirectorySortKey,
} from './types';

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

export const CONNECTOR_POPULAR_HEADING = 'Top connectors';

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
  installs: 'Most installed',
  updated: 'Recently updated',
  name: 'Name A to Z',
};

export const DIRECTORY_BADGE_LABELS: Record<DirectoryBadgeKind, string> = {
  'first-party': 'First-party',
  official: 'Official',
  verified: 'Verified',
  community: 'Community',
  custom: 'Custom',
};

export const VERIFIED_GLYPH_BADGE: DirectoryBadgeKind = 'verified';
export const CUSTOM_BADGE: DirectoryBadgeKind = 'custom';
export const CONNECTED_GLYPH_LABEL = 'Connected';
export const DIRECTORY_CUSTOM_HEADING = 'Your custom connectors';

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

export const CONNECTOR_TOOLS_LABEL = 'Tools';

export const CARD_INSTALL_LABELS: Record<DirectorySectionKey, string> = {
  skills: ADD_LABEL,
  connectors: ADD_LABEL,
  plugins: INSTALL_LABEL,
};
export const CARD_REMOVE_LABELS: Record<DirectorySectionKey, string> = {
  skills: REMOVE_LABEL,
  connectors: REMOVE_LABEL,
  plugins: UNINSTALL_LABEL,
};
export const DIRECTORY_COUNT_SUFFIXES: Partial<Record<DirectorySectionKey, string>> = {
  plugins: 'installs',
};

export const PLUGIN_PROMPTS_LABEL = 'Try asking';
export const PLUGIN_COMPONENTS_HEADING = 'Includes';
export const PLUGIN_SKILLS_LABEL = 'Skills';
export const PLUGIN_COMMANDS_LABEL = 'Commands';
export const PLUGIN_AGENTS_LABEL = 'Agents';
export const PLUGIN_MCP_SERVERS_LABEL = 'MCP servers';
export const PLUGIN_HOOKS_LABEL = 'Hooks';
export const PLUGIN_HOOKS_VALUE = 'Included';
export const PLUGIN_LSP_SERVERS_LABEL = 'Language servers';
export const PLUGIN_MCP_TRANSPORT_SEPARATOR = ' via ';
export const PLUGIN_DESKTOP_ONLY_LABEL = 'Desktop and CLI';
export const PLUGIN_INSTALL_COMMAND_LABEL = 'Install from the CLI';
export const PLUGIN_INSTALL_COMMAND_COPY_LABEL = 'Copy install command';
export const PLUGIN_COMMAND_COPIED_LABEL = 'Copied';
export const PLUGIN_COMMAND_COPIED_RESET_MS = 2000;
export const PLUGIN_MORE_INFO_LABEL = 'More info';
export const PLUGIN_HOMEPAGE_LABEL = 'Homepage';
export const PLUGIN_REPOSITORY_LABEL = 'Repository';
export const PLUGIN_MARKETPLACE_LABEL = 'Marketplace';
export const PLUGIN_WORKS_WITH_LABEL = 'Works with';
export const PLUGIN_VERSION_LABEL = 'Version';
export const PLUGIN_INSTALLS_SUFFIX = 'installs';

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
export const CONNECTOR_TRUST_COPY =
  'Only use connectors from developers you trust. AGI does not control which tools a developer offers and cannot verify that they work as intended or will not change.';
export const CONNECTOR_CATEGORIES_LABEL = 'Categories';
export const CONNECTOR_MADE_BY_LABEL = 'Made by';
export const CONNECTOR_AUTHOR_LABEL = 'Author';
export const CONNECTOR_SIGN_IN_LABEL = 'Sign-in';
export const CONNECTOR_SIGN_IN_REQUIRED = 'Required';
export const CONNECTOR_SIGN_IN_NONE = 'None';
export const CONNECTOR_URL_LABEL = 'Connector URL';
export const CONNECTOR_ADDED_LABEL = 'Added';
export const CONNECTOR_RELATED_HEADING = 'Related connectors';
export const CONNECTOR_TERMS_PREFIX = 'Use of connectors is governed by the';
export const CONNECTOR_TERMS_LINK_LABEL = 'Terms of Service';
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
export const CHIP_PREVIEW_COUNT = 12;

export const MARKETPLACE_UNAVAILABLE_COPY = 'Plugin marketplaces are not available yet.';

export const INSTALL_CONFIRM_TITLE_PREFIX = 'Install';
export const INSTALL_CONFIRM_CANCEL_LABEL = 'Cancel';

export const CONNECTOR_ADD_API_KEY_LABEL = 'Add API key';
export const CONNECTOR_CARD_ACTION_LABELS: Record<DirectoryConnectableMode, string> = {
  connect: 'Connect',
  'api-key-form': 'Add API key',
  'desktop-and-cli': 'Available on desktop and CLI',
  'needs-setup': 'Needs setup',
};
export const CONNECTOR_DESKTOP_ONLY_LABEL = 'Available on desktop and CLI';
export const CONNECTOR_DESKTOP_ONLY_COPY =
  'This connector runs on your own computer, so it connects from the desktop app or the CLI rather than from the browser.';
export const CONNECTOR_DESKTOP_DOWNLOAD_LABEL = 'Get the desktop app';
export const CONNECTOR_NEEDS_SETUP_LABEL = 'Needs setup';
export const CONNECTOR_REPOSITORY_LABEL = 'Repository';

export const DIRECTORY_LOAD_MORE_LABEL = 'Load more';
export const DIRECTORY_LOADING_MORE_LABEL = 'Loading more';
export const DIRECTORY_SHOWING_PREFIX = 'Showing';
export const DIRECTORY_SHOWING_OF = 'of';
export const DIRECTORY_SEARCH_DEBOUNCE_MS = 250;

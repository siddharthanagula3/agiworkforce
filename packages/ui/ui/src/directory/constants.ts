import type {
  DirectoryBadgeKind,
  DirectoryConnectableMode,
  DirectoryManageColumn,
  DirectoryPluginScanVerdict,
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
export const DIRECTORY_PUBLISHER_FILTER_ID = 'publisher';
export const DIRECTORY_CATEGORY_FILTER_ID = 'category';

export const FILTER_MENU_LABEL = 'Filter by';
export const SORT_MENU_LABEL = 'Sort by';
export const CLEAR_FILTERS_LABEL = 'Clear filters';

export const DIRECTORY_SORT_LABELS: Record<DirectorySortKey, string> = {
  popular: 'Most popular',
  updated: 'Recently updated',
  name: 'Name A to Z',
};

export const DIRECTORY_BADGE_LABELS: Record<DirectoryBadgeKind, string> = {
  'first-party': 'First-party',
  official: 'Official',
  verified: 'Verified',
  community: 'Community',
  custom: 'Custom',
  update: 'Update available',
};

export const VERIFIED_GLYPH_BADGE: DirectoryBadgeKind = 'verified';
export const CUSTOM_BADGE: DirectoryBadgeKind = 'custom';
export const COMMUNITY_BADGE: DirectoryBadgeKind = 'community';
export const UPDATE_BADGE: DirectoryBadgeKind = 'update';
export const CONNECTED_GLYPH_LABEL = 'Connected';
export const DIRECTORY_CUSTOM_HEADING = 'Your custom connectors';

export const NEW_BADGE_LABEL = 'New';

export const ADD_LABEL = 'Add';
export const SETTINGS_LABEL = 'Settings';
export const MANAGE_LABEL = 'Manage';
export const REMOVE_LABEL = 'Remove';
export const INSTALL_LABEL = 'Install';
export const UNINSTALL_LABEL = 'Uninstall';
export const INSTALLED_LABEL = 'Installed';
export const CONNECT_LABEL = 'Connect';
export const CONNECTED_LABEL = 'Connected';
export const RECONNECT_LABEL = 'Reconnect';
export const COPY_LINK_LABEL = 'Copy link';

export const SKILL_DESCRIPTION_LABEL = 'Description';
export const SKILL_LICENSE_LABEL = 'License';
export const SKILL_ACCESS_HEADING = 'Source and access';
export const SKILL_SOURCE_LABEL = 'Source';
export const SKILL_ADDED_LABEL = 'Added';
export const SKILL_VERSION_LABEL = 'Version';
export const SKILL_REQUIRED_TOOLS_LABEL = 'Needs tools';
export const SKILL_REQUIRED_CONNECTORS_LABEL = 'Needs connectors';
export const SKILL_ACCESS_LABEL = 'Access';
export const SKILL_ACCESS_VALUE =
  'Runs with the tools and connectors already on in your chat. It gets no access of its own.';
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

export const PLUGIN_PROMPTS_LABEL = 'Try asking';
export const PLUGIN_COMPONENTS_HEADING = 'Includes';
export const PLUGIN_SKILLS_LABEL = 'Skills';
export const PLUGIN_COMMANDS_LABEL = 'Commands';
export const PLUGIN_AGENTS_LABEL = 'Agents';
export const PLUGIN_MCP_SERVERS_LABEL = 'MCP servers';
export const PLUGIN_HOOKS_LABEL = 'Hooks';
export const PLUGIN_HOOKS_VALUE = 'Included. Hooks run in the agi CLI, not in chat.';
export const PLUGIN_AGENTS_NOTE = 'Agents run in the agi CLI, not in chat.';
export const PLUGIN_LSP_SERVERS_LABEL = 'Language servers';
export const PLUGIN_MCP_TRANSPORT_SEPARATOR = ' via ';
export const PLUGIN_DESKTOP_ONLY_LABEL = 'Desktop and CLI';
export const PLUGIN_INSTALL_COMMAND_LABEL = 'Install from the CLI';
export const PLUGIN_INSTALL_COMMAND_COPY_LABEL = 'Copy install command';
export const PLUGIN_COMMAND_COPIED_LABEL = 'Copied';
export const PLUGIN_COMMAND_COPIED_RESET_MS = 2000;
export const PLUGIN_SOURCE_LABEL = 'Source';
export const PLUGIN_LAST_UPDATED_LABEL = 'Last updated';
export const PLUGIN_TABS_LABEL = 'Plugin contents';
export const PLUGIN_SKILLS_TAB_LABEL = 'Skills';
export const PLUGIN_CONNECTORS_TAB_LABEL = 'Connectors';
export const PLUGIN_SKILLS_TAB_COPY =
  'Invoke by typing / in chat, or let AGI use them automatically for relevant tasks.';
export const PLUGIN_CONNECTORS_TAB_COPY =
  'Tools and data sources this plugin connects to. Connect each one so AGI can use it.';
export const PLUGIN_SKILLS_TAB_EMPTY = 'This plugin ships no skills the web app can load.';
export const PLUGIN_CONNECTORS_TAB_EMPTY = 'This plugin needs no connectors.';
export const PLUGIN_SKILL_SLASH_PREFIX = '/';
export const PLUGIN_MORE_INFO_LABEL = 'More info';
export const PLUGIN_HOMEPAGE_LABEL = 'Homepage';
export const PLUGIN_REPOSITORY_LABEL = 'Repository';
export const PLUGIN_MARKETPLACE_LABEL = 'Marketplace';
export const PLUGIN_WORKS_WITH_LABEL = 'Works with';
export const PLUGIN_VERSION_LABEL = 'Version';
export const PLUGIN_CATEGORY_LABEL = 'Category';
export const PLUGIN_PUBLISHER_LABEL = 'Publisher';
export const PLUGIN_PUBLISHER_MORE_PREFIX = 'More from';
export const PLUGIN_PUBLISHER_WEBSITE_LABEL = 'Website';
export const PLUGIN_COMMUNITY_NOTE =
  'Built by its publisher, not by AGI Workforce. Check what it includes before you install it.';
export const PLUGIN_PERMISSIONS_HEADING = 'Permissions';
export const PLUGIN_PERMISSIONS_COPY =
  'What this plugin says it needs. Installing it agrees to these; you can remove it at any time.';
export const PLUGIN_SCAN_HEADING = 'Security scan';
export const PLUGIN_SCAN_VERDICT_LABELS: Record<DirectoryPluginScanVerdict, string> = {
  pass: 'Passed. No unsafe patterns were found.',
  review: 'Needs your review. It may carry risk depending on where it came from.',
  block: 'Blocked. It cannot be installed.',
};
export const PLUGIN_SCAN_DATE_PREFIX = 'Scanned';
export const PLUGIN_SCAN_NONE_COPY =
  'Not scanned. Scans run on plugins you upload or create and on registry versions.';
export const PLUGIN_VERSION_INSTALLED_LABEL = 'Installed version';
export const PLUGIN_VERSION_UPDATE_PREFIX = 'Update to';
export const PLUGIN_VERSION_CHOOSE_LABEL = 'Choose a version';
export const PLUGIN_VERSION_SWITCH_LABEL = 'Switch version';
export const PLUGIN_VERSION_CURRENT_SUFFIX = '(installed)';
export const PLUGIN_VERSION_CONFIRM_TITLE_PREFIX = 'Switch to version';
export const PLUGIN_VERSION_CONFIRM_BODY =
  'The plugin moves to this version for your account and stays on it until you choose another.';
export const PLUGIN_VERSION_NEW_PERMISSIONS_PREFIX = 'It also asks for:';
export const PLUGIN_VERSION_ADDED_SKILLS_PREFIX = 'It adds these skills:';
export const PLUGIN_VERSION_REMOVED_SKILLS_PREFIX = 'It removes these skills:';
export const PLUGIN_VERSION_CHANGELOG_LABEL = 'What changed';
export const PLUGIN_REPAIRS_HEADING = 'Needs attention';

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
export const MARKETPLACE_REMOVE_FAILED_COPY =
  'That marketplace could not be removed. It is still listed.';

export const SKILL_NO_PREVIEW_COPY = 'No preview. This file type cannot be previewed.';
export const SKILL_DOWNLOAD_FILE_LABEL = 'Download file';

export const CONNECTOR_COMMUNITY_NOTICE_SHORT =
  'Community connectors have passed automated checks only. They may not meet the quality of verified connectors.';
export function connectorNotConnectedCopy(name: string): string {
  return `You're not connected to ${name} yet.`;
}

export function connectorAuthorizationPendingCopy(name: string): string {
  return `You started connecting to ${name} but didn't finish.`;
}

export function connectorReconnectCopy(name: string): string {
  return `${name} needs to be reconnected. Its sign-in expired or was revoked, so its tools stop working until you reconnect. Reconnecting signs in again and keeps its settings and tool permissions.`;
}

export const CONNECTOR_REQUIRED_BY_PLUGINS_COPY =
  'This connector is required by the following plugins:';

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

export const DIRECTORY_BROWSE_LABEL = 'Browse';
export const ADD_MARKETPLACE_ACTION_ID = 'add-marketplace';
export const DIRECTORY_ADD_MENU_LABEL = 'Add';
export const DIRECTORY_MANAGE_SLASH_PREFIX = '/';

export const DIRECTORY_MANAGE_COLUMNS: Record<
  DirectorySectionKey,
  readonly DirectoryManageColumn[]
> = {
  skills: ['name', 'author'],
  connectors: ['name', 'updated'],
  plugins: ['name', 'author', 'skills', 'updated'],
};

export const DIRECTORY_MANAGE_NAME_HEADINGS: Record<DirectorySectionKey, string> = {
  skills: 'Skill',
  connectors: 'Connector',
  plugins: 'Plugin',
};

export const DIRECTORY_MANAGE_COLUMN_HEADINGS: Record<
  Exclude<DirectoryManageColumn, 'name'>,
  string
> = {
  author: 'Author',
  skills: 'Skills',
  updated: 'Last updated',
};

export const DIRECTORY_MANAGE_EMPTY_TITLES: Record<DirectorySectionKey, string> = {
  skills: 'No skills of your own yet.',
  connectors: 'No connectors yet',
  plugins: 'No plugins yet',
};

export const DIRECTORY_MANAGE_EMPTY_BODIES: Record<DirectorySectionKey, string> = {
  skills: 'Browse the catalogue to add one, or write your own.',
  connectors: 'Connect the tools and data sources you want AGI to reach.',
  plugins: 'Install a plugin to give AGI a bundle of skills and connectors at once.',
};

export const DIRECTORY_MANAGE_EMPTY_ACTION_LABELS: Record<DirectorySectionKey, string> = {
  skills: 'Browse',
  connectors: 'Add connector',
  plugins: 'Install',
};

export const DIRECTORY_MANAGE_NO_MATCH_COPY = 'Nothing here matches this search.';
export const DIRECTORY_MANAGE_META_SEPARATOR = '\u00b7';
export const DIRECTORY_MANAGE_SKILL_COUNT_LABELS = { one: 'skill', other: 'skills' };
export const DIRECTORY_MANAGE_SINGULAR_COUNT = 1;
export const DIRECTORY_MANAGE_UNKNOWN_VALUE = '';
export const DIRECTORY_MANAGE_ROW_ACTION_PREFIX = 'Manage';

export const INSTALL_CONFIRM_TITLE_PREFIX = 'Install';
export const INSTALL_CONFIRM_CANCEL_LABEL = 'Cancel';

export const SKILL_ENABLED_LABEL = 'Enable skill';
export const SKILL_ENABLED_HINT = 'Turn this off to keep it in the catalogue without offering it.';
export const SKILL_TRY_IN_CHAT_LABEL = 'Try in chat';

export const DELETE_SKILL_CONFIRM_TITLE = 'Delete skill?';
export const DELETE_SKILL_CONFIRM_DESCRIPTION =
  'This removes it from your account. Chats that already used it are not affected.';
export const DELETE_SKILL_CONFIRM_LABEL = 'Delete';

export const CONNECTOR_ADD_API_KEY_LABEL = 'Add API key';
export const CONNECTOR_CARD_ACTION_LABELS: Record<DirectoryConnectableMode, string> = {
  connect: 'Connect',
  'api-key-form': 'Add API key',
  'desktop-and-cli': 'Available on desktop and CLI',
  'needs-setup': 'Needs setup',
  unavailable: 'Not available yet',
};
export const CONNECTOR_DESKTOP_ONLY_LABEL = 'Available on desktop and CLI';
export const CONNECTOR_DESKTOP_ONLY_COPY =
  'This connector runs on your own computer, so it connects from the desktop app or the CLI rather than from the browser.';
export const CONNECTOR_DESKTOP_DOWNLOAD_LABEL = 'Get the desktop app';
export const CONNECTOR_NEEDS_SETUP_LABEL = 'Needs setup';
export const CONNECTOR_UNAVAILABLE_LABEL = 'Not available yet';
export const CONNECTOR_REPOSITORY_LABEL = 'Repository';

export const DIRECTORY_LOAD_MORE_LABEL = 'Load more';
export const DIRECTORY_LOADING_MORE_LABEL = 'Loading more';
export const DIRECTORY_SHOWING_PREFIX = 'Showing';
export const DIRECTORY_SHOWING_OF = 'of';
export const DIRECTORY_SEARCH_DEBOUNCE_MS = 250;

export const PLUGIN_ENABLED_LABEL = 'Enabled';
export const PLUGIN_ENABLED_HINT = 'Turn this off to keep the plugin installed without using it.';
export const PLUGIN_UNAVAILABLE_LABEL = 'Not available on this surface';
export const PLUGIN_UNAVAILABLE_HINT =
  'This plugin is still installed on your account, but the server no longer runs it here, so it does nothing in a turn.';
export const PLUGIN_CONNECTOR_CONNECTED_LABEL = 'Connected';
export const PLUGIN_CONNECTOR_MISSING_LABEL = 'Not connected';
export const PLUGIN_SETTINGS_LOADING_LABEL = 'Loading plugin settings';
export const PLUGIN_SKILL_TOGGLE_PREFIX = 'Use';
export const MARKETPLACE_REFRESH_LABEL = 'Refresh';
export const MARKETPLACE_REFRESHING_LABEL = 'Refreshing marketplace';

export const UPLOAD_PLUGIN_ACTION_ID = 'upload-plugin';
export const UPLOAD_SKILL_ACTION_ID = 'upload-skill';
export const CREATE_PLUGIN_ACTION_ID = 'create-plugin';
export const UPLOAD_PLUGIN_LABEL = 'Upload plugin';
export const UPLOAD_PLUGIN_INTRO =
  'Choose a zip of your plugin. It needs a skills folder, and may carry a plugin manifest folder.';
export const UPLOAD_PLUGIN_ACCEPT = '.zip,application/zip';
export const UPLOAD_PLUGIN_FAILED_COPY = 'The plugin could not be uploaded.';

export const UPLOAD_SKILL_LABEL = 'Upload skill';
export const UPLOAD_SKILL_INTRO =
  'Choose a SKILL.md, or a zip of the skill folder with its references and scripts. SKILL.md needs a name and a description in its frontmatter.';
export const UPLOAD_SKILL_ACCEPT = '.md,.zip,text/markdown,application/zip';
export const UPLOAD_SKILL_FAILED_COPY = 'The skill could not be uploaded.';

export const UPLOAD_CHOOSE_FILE_LABEL = 'Choose file';
export const UPLOAD_NO_FILE_LABEL = 'No file chosen yet.';
export const UPLOAD_SUBMIT_LABEL = 'Upload';
export const UPLOAD_CANCEL_LABEL = 'Cancel';
export const UPLOAD_DONE_LABEL = 'Done';
export const UPLOAD_BUSY_LABEL = 'Uploading';
export const UPLOAD_CAUTION_TITLE = 'This upload could not be fully verified';
export const UPLOAD_CAUTION_BODY =
  'The security scan found patterns that may carry risk depending on where the file came from. Continue only if you trust its source.';
export const UPLOAD_CAUTION_CONTINUE_LABEL = 'Continue anyway';

export const CREATE_PLUGIN_LABEL = 'Create a plugin';
export const CREATE_PLUGIN_INTRO =
  'A plugin is a name, a description and the skills it brings. You can add more skills later.';
export const CREATE_PLUGIN_NAME_LABEL = 'Name';
export const CREATE_PLUGIN_NAME_PLACEHOLDER = 'Release notes';
export const CREATE_PLUGIN_DESCRIPTION_LABEL = 'Description';
export const CREATE_PLUGIN_DESCRIPTION_PLACEHOLDER = 'Turns a changelog into release notes.';
export const CREATE_PLUGIN_SKILL_HEADING = 'Skills';
export const CREATE_PLUGIN_SKILL_NAME_LABEL = 'Skill name';
export const CREATE_PLUGIN_SKILL_NAME_PLACEHOLDER = 'draft-release-notes';
export const CREATE_PLUGIN_SKILL_NAME_HINT =
  'Lowercase letters, numbers and hyphens. This is what you type after a slash in chat.';
export const CREATE_PLUGIN_SKILL_DESCRIPTION_LABEL = 'Skill description';
export const CREATE_PLUGIN_SKILL_DESCRIPTION_PLACEHOLDER = 'Draft release notes from a changelog.';
export const CREATE_PLUGIN_SKILL_BODY_LABEL = 'Instructions';
export const CREATE_PLUGIN_SKILL_BODY_PLACEHOLDER = 'Read the changelog and write the notes.';
export const CREATE_PLUGIN_ADD_SKILL_LABEL = 'Add another skill';
export const CREATE_PLUGIN_REMOVE_SKILL_LABEL = 'Remove this skill';
export const CREATE_PLUGIN_SUBMIT_LABEL = 'Create plugin';
export const CREATE_PLUGIN_FAILED_COPY = 'The plugin could not be created.';
export const EDIT_PLUGIN_LABEL = 'Edit plugin';
export const EDIT_PLUGIN_INTRO =
  'Change the plugin name, description and skills. Your chats use the saved version.';
export const EDIT_PLUGIN_SUBMIT_LABEL = 'Save changes';
export const EDIT_PLUGIN_FAILED_COPY = 'The plugin could not be saved.';
export const EDIT_PLUGIN_LOADING_LABEL = 'Loading plugin';
export const CUSTOMIZE_PLUGIN_LABEL = 'Customize';
export const CUSTOMIZE_PLUGIN_HINT = 'Make your own copy of this plugin and edit its skills.';
export const CUSTOMIZE_CONFIRM_TITLE_PREFIX = 'Customize';
export const CUSTOMIZE_CONFIRM_BODY =
  'You get your own copy with the same skills and files, which you can edit. The original is turned off so your chats use your copy; you can turn it back on from its page.';
export const CUSTOMIZE_CONFIRM_LABEL = 'Make my copy';
export const SUBMIT_PLUGIN_LABEL = 'Submit to the directory';
export const SUBMIT_PLUGIN_UPDATE_LABEL = 'Submit this version';
export const SUBMIT_PLUGIN_HINT = 'Once it is approved, anyone can find and install it.';
export const SUBMIT_PLUGIN_CONFIRM_TITLE_PREFIX = 'Submit';
export const SUBMIT_PLUGIN_CONFIRM_BODY =
  'Every submission is reviewed before it is listed. Once it is approved, anyone can find and install it, and you can withdraw it at any time.';
export const SUBMIT_PLUGIN_CONFIRM_LABEL = 'Submit for review';
export const WITHDRAW_SUBMISSION_LABEL = 'Withdraw';
export const WITHDRAW_SUBMISSION_CONFIRM_TITLE_PREFIX = 'Withdraw';
export const WITHDRAW_SUBMISSION_CONFIRM_BODY =
  'If it is listed, it leaves the directory and everyone who installed it loses it. You can submit it again later.';
export const WITHDRAW_SUBMISSION_CONFIRM_LABEL = 'Withdraw it';
export const SUBMISSION_REVIEW_NOTE_LABEL = 'Reviewer note';

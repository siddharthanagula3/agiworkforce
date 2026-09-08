export const OFFICIAL_MARKETPLACE_NAME = 'claude-plugins-official';
export const OFFICIAL_MARKETPLACE_REPOSITORY_URL =
  'https://github.com/anthropics/claude-plugins-official';
export const OFFICIAL_MARKETPLACE_REF = 'main';
export const OFFICIAL_MARKETPLACE_OWNER_NAME = 'Anthropic';

export const CLAUDE_MARKETPLACE_MANIFEST_PATH = '.claude-plugin/marketplace.json';
export const CLAUDE_PLUGIN_METADATA_PATH = '.claude-plugin/plugin.json';
export const CLAUDE_PLUGIN_HOOKS_PATH = 'hooks/hooks.json';
export const CLAUDE_PLUGIN_MCP_PATH = '.mcp.json';
export const CLAUDE_PLUGIN_SKILLS_DIRECTORY = 'skills';
export const CLAUDE_PLUGIN_COMMANDS_DIRECTORY = 'commands';
export const CLAUDE_PLUGIN_AGENTS_DIRECTORY = 'agents';
export const CLAUDE_SKILL_FILE_NAME = 'SKILL.md';

export const CLAUDE_CLI_INSTALL_COMMAND = 'claude plugin install';

export const PUBLIC_DIRECTORY_URL = 'https://claude.com/plugins';
export const PUBLIC_DIRECTORY_PAGE_LIMIT = 20;
export const PUBLIC_DIRECTORY_REQUEST_SPACING_MS = 250;
export const PUBLIC_DIRECTORY_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
export const PUBLIC_DIRECTORY_VERIFIED_LABEL = 'Anthropic verified';
export const PUBLIC_DIRECTORY_DETAIL_FETCHES_PER_RUN = 60;
export const PARTNER_PUBLISHER_ID = 'partner';
export const PARTNER_PUBLISHER_NAME = 'Partner';
export const PUBLISHER_KIND_PARTNER = 'partner';
export const PUBLISHER_KIND_THIRD_PARTY = 'third-party';
export const MARKETPLACE_EXTERNAL_PLUGINS_DIRECTORY = 'external_plugins';

export const SHADOW_SOURCE_NAME_PREFIX = 'agi:installed:';

export function shadowSourceName(marketplaceName: string): string {
  return `${SHADOW_SOURCE_NAME_PREFIX}${marketplaceName}`;
}

export function isShadowSourceName(name: string): boolean {
  return name.startsWith(SHADOW_SOURCE_NAME_PREFIX);
}

export const BRAND_NAME_PATTERN =
  /\b(?:Claude(?: Code| Desktop| desktop app| mobile app| for Chrome| Cowork| app)?|ChatGPT)\b/gu;
export const BRAND_NAME_REPLACEMENT = 'the assistant';
const EN_DASH_CODE_POINT = 0x2013;
const EM_DASH_CODE_POINT = 0x2014;
const DASH_LIKE_CLASS = `[${String.fromCodePoint(EN_DASH_CODE_POINT)}${String.fromCodePoint(EM_DASH_CODE_POINT)}]`;
export const DASH_PATTERN = new RegExp(`\\s*${DASH_LIKE_CLASS}\\s*`, 'gu');
export const DASH_REPLACEMENT = ', ';

export const GITHUB_HOST = 'github.com';
export const GITHUB_API_BASE_URL = 'https://api.github.com';
export const GITHUB_RAW_BASE_URL = 'https://raw.githubusercontent.com';
export const GITHUB_API_USER_AGENT = 'agiworkforce-plugin-directory';
export const GITHUB_API_ACCEPT = 'application/vnd.github+json';
export const GITHUB_TOKEN_ENV_VAR = 'GITHUB_TOKEN';
export const GITHUB_DEFAULT_TREE_REF = 'HEAD';
export const GITHUB_UNAUTHENTICATED_INSPECTIONS_PER_RUN = 40;
export const GITHUB_AUTHENTICATED_INSPECTIONS_PER_RUN = 400;
export const GITHUB_INSPECTION_CONCURRENCY = 6;

export const PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS = 15_000;
export const PLUGIN_DIRECTORY_MAX_DESCRIPTION_CHARS = 2_000;
export const PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL = 50;
export const PLUGIN_DIRECTORY_SKILL_FETCH_CONCURRENCY = 4;
export const PLUGIN_DIRECTORY_FALLBACK_VERSION = '0.0.0';
export const PLUGIN_DIRECTORY_SHA_VERSION_PREFIX = 'sha.';
export const PLUGIN_DIRECTORY_SHORT_SHA_LENGTH = 7;
export const PLUGIN_DIRECTORY_UNCATEGORIZED = '';
export const PLUGIN_DIRECTORY_DEFAULT_LIMIT = 50;
export const PLUGIN_DIRECTORY_MAX_LIMIT = 100;
export const PLUGIN_DIRECTORY_MAX_SEARCH_CHARS = 200;
export const PLUGIN_DIRECTORY_MAX_CURSOR_CHARS = 7;
export const PLUGIN_DIRECTORY_BUILTIN_READ_LIMIT = 100;
export const PLUGIN_DIRECTORY_FAILURE_SAMPLE_SIZE = 5;

export const WORKS_WITH_CLAUDE_CODE = 'claude-code';
export const WORKS_WITH_COWORK = 'cowork';
export const WORKS_WITH_WEB = 'web';
export const PLUGIN_WORKS_WITH = [
  WORKS_WITH_CLAUDE_CODE,
  WORKS_WITH_COWORK,
  WORKS_WITH_WEB,
] as const;

export const PUBLIC_DIRECTORY_WORKS_WITH_LABELS: Readonly<Record<string, string>> = {
  'Claude Code': WORKS_WITH_CLAUDE_CODE,
  Cowork: WORKS_WITH_COWORK,
  'Claude Cowork': WORKS_WITH_COWORK,
};

export const SOURCE_FACET_BUILTIN = 'builtin';
export const SOURCE_FACET_PARTNER = 'partner';
export const SOURCE_FACET_MARKETPLACE = 'marketplace';
export const PLUGIN_SOURCE_FACETS = [
  SOURCE_FACET_BUILTIN,
  SOURCE_FACET_PARTNER,
  SOURCE_FACET_MARKETPLACE,
] as const;

export const PLUGIN_SORT_INSTALLS = 'installs';
export const PLUGIN_SORT_NAME = 'name';
export const PLUGIN_SORTS = [PLUGIN_SORT_INSTALLS, PLUGIN_SORT_NAME] as const;

export const PLUGIN_CAPABILITY_MCP = 'mcp';
export const PLUGIN_CAPABILITY_SHELL = 'shell';

export const RUNTIME_NOTE_COWORK_ONLY =
  'This plugin is listed for Cowork only, and no install source is published for it.';
export const RUNTIME_NOTE_SOURCE_UNKNOWN =
  'This plugin is not listed in a marketplace manifest we can read, so install it from the CLI with the command shown.';
export const RUNTIME_NOTE_NOT_INSPECTED =
  'This plugin has not been inspected yet, so install it from the desktop app or the CLI.';
export const RUNTIME_NOTE_HOOKS =
  'This plugin runs CLI hooks the web app cannot execute, so install it from the desktop app or the CLI.';
export const RUNTIME_NOTE_LSP =
  'This plugin starts a language server the web app cannot run, so install it from the desktop app or the CLI.';
export const RUNTIME_NOTE_STDIO_MCP =
  'This plugin starts a local MCP server process the web app cannot run, so install it from the desktop app or the CLI.';
export const RUNTIME_NOTE_NO_SKILLS =
  'This plugin ships slash commands or agents for the CLI and no skills the web app can load, so install it from the desktop app or the CLI.';

export const INSTALLS_DISABLED_MESSAGE = 'Plugin installs are not enabled on this deployment yet';
export const MARKETPLACE_UNAVAILABLE_MESSAGE =
  'The plugin marketplace is not available yet. Please try again later.';
export const INSTALL_SKILLS_UNAVAILABLE_MESSAGE =
  'None of this plugin skills could be fetched from its repository right now, so it was not installed.';
export const INSTALL_BUILTIN_MESSAGE =
  'This plugin is a built-in pack; install it through the plugin installations route.';
export const INSTALL_UNKNOWN_MESSAGE = 'This plugin is not in the directory.';

export const SNAPSHOT_CACHE_METHOD = 'plugins.directory.snapshot';
export const SYNC_STATE_CACHE_METHOD = 'plugins.directory.sync-state';
export const INGEST_LEASE_CACHE_METHOD = 'plugins.directory.ingest-lease';
export const INSPECTIONS_CACHE_METHOD = 'plugins.directory.inspections';
export const INSTALLED_SKILLS_CACHE_METHOD = 'plugins.directory.installed-skills';
export const CACHE_PARAMS_VERSION = 'v1';
export const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const SYNC_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const INSPECTIONS_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const INSTALLED_SKILLS_TTL_MS = 90 * 24 * 60 * 60 * 1_000;

export const INGEST_MANIFEST_BUDGET_FRACTION = 0.15;
export const INGEST_PUBLIC_BUDGET_FRACTION = 0.4;
export const INGEST_INSPECTION_BUDGET_FRACTION = 0.9;
export const MS_PER_SECOND = 1_000;
export const INGEST_LEASE_MESSAGE = 'Plugin directory ingest already running';

export const PLUGIN_UPLOAD_MAX_MEMBERS = 2_000;
export const PLUGIN_UPLOAD_MAX_TOTAL_BYTES = 20_000_000;
export const PLUGIN_UPLOAD_MAX_PATH_CHARS = 400;
export const PLUGIN_UPLOAD_FILE_FIELD = 'file';
export const PLUGIN_UPLOAD_NAME_FIELD = 'name';
export const PLUGIN_UPLOAD_ARCHIVE_MEDIA_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const;

export const UNIX_FILE_TYPE_MASK = 0xf000;
export const UNIX_FILE_TYPE_SYMLINK = 0xa000;

export const PLUGIN_KEY_MAX_CHARS = 128;

export const UPLOAD_NOT_AN_ARCHIVE_MESSAGE = 'That file is not a readable zip archive.';
export const UPLOAD_EMPTY_MESSAGE = 'The zip archive is empty.';
export const UPLOAD_TOO_MANY_MEMBERS_MESSAGE = `The zip archive holds more than ${PLUGIN_UPLOAD_MAX_MEMBERS} files.`;
export const UPLOAD_EXPANDS_TOO_FAR_MESSAGE = `The zip archive expands to more than ${PLUGIN_UPLOAD_MAX_TOTAL_BYTES} bytes.`;
export const UPLOAD_NO_SKILLS_MESSAGE =
  'This plugin declares no SKILL.md the web app can run, so there is nothing to install. A plugin needs at least one skills/<name>/SKILL.md.';
export const UPLOAD_NO_PLUGIN_MESSAGE =
  'No plugin was found in the zip. It needs a .claude-plugin/plugin.json, a .claude-plugin/marketplace.json, or a skills directory.';

export function uploadUnsafePathMessage(path: string): string {
  return `"${path}" is not a safe path inside the archive.`;
}

export function uploadSymlinkMessage(path: string): string {
  return `"${path}" is a symbolic link, which an uploaded plugin may not contain.`;
}

export function uploadMemberTooLargeMessage(path: string, limit: number): string {
  return `"${path}" is larger than ${limit} bytes.`;
}

export function uploadNotUtf8Message(path: string): string {
  return `"${path}" is not valid UTF-8 text.`;
}

export function uploadTooManySkillsMessage(pluginName: string, limit: number): string {
  return `"${pluginName}" declares more than ${limit} skills.`;
}

export function uploadTooManyPluginsMessage(limit: number): string {
  return `The archive declares more than ${limit} plugins.`;
}

export function uploadUnusableNameMessage(name: string): string {
  return `"${name}" cannot be used as a plugin identifier. Use letters, numbers, dots, dashes or underscores.`;
}

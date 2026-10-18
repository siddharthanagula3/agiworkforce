export interface FileEntry {
  name: string;
  /** Path relative to the workspace root, POSIX-separated. */
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface FileStat extends FileEntry {
  binary: boolean;
  readOnly: boolean;
}

export interface FileTextContent {
  path: string;
  text: string;
  sizeBytes: number;
  modifiedAtMs: number;
  truncated: boolean;
  readOnly?: boolean;
  lineEnding?: 'lf' | 'crlf';
  sha256?: string;
}

export interface FileTextWrite extends FileStat {
  sha256?: string;
}

export interface FileBinaryContent {
  path: string;
  /** Base64, because the runtime response crosses IPC as structured JSON. */
  base64: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface FileSearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface FileTextEdit {
  path: string;
  replacements: number;
  sizeBytes: number;
}

export const FILESYSTEM_COMMANDS = [
  'file_list',
  'file_read_text',
  'file_read_bytes',
  'file_write_text',
  'file_edit_text',
  'file_glob',
  'file_grep',
] as const;

export type FilesystemCommand = (typeof FILESYSTEM_COMMANDS)[number];

const CREDENTIAL_BASENAMES: readonly string[] = [
  '.env',
  '.npmrc',
  '.netrc',
  '.pgpass',
  '.git-credentials',
  '.envrc',
  '.pypirc',
  '.yarnrc.yml',
  'credentials',
];

/** Files that hold credentials only where they sit: a registry login, a cluster token, a remote URL with one in it. */
const CREDENTIAL_PATH_TAILS: readonly (readonly string[])[] = [
  ['.docker', 'config.json'],
  ['.kube', 'config'],
  ['.git', 'config'],
];

const ENVIRONMENT_FILE_PREFIX = '.env.';

/** Checked-in templates name the variables and hold placeholders, not values. */
const ENVIRONMENT_TEMPLATE_SUFFIXES: readonly string[] = ['.example', '.sample', '.template'];

const CREDENTIAL_EXTENSIONS: readonly string[] = ['.pem', '.key', '.p12', '.pfx', '.env'];

const CREDENTIAL_DIRECTORIES: readonly string[] = ['.ssh'];

const SSH_PRIVATE_KEY = /^id_(rsa|dsa|ecdsa|ed25519|xmss)(_sk)?([-_.].*)?$/u;
const SSH_PUBLIC_KEY_SUFFIX = '.pub';

const FOLD_ROUNDS = 3;

/**
 * The characters HFS+ skips when it compares two names: zero-width joiners
 * and marks, the bidirectional controls, the deprecated format characters and
 * the byte-order mark. APFS keeps them apart; an external HFS+ volume does
 * not, so a name holding one is asked about rather than missed there. The
 * sandbox-policy crate drops the same set.
 */
const IGNORED_BY_HFS = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/gu;

/**
 * A file name as a volume that ignores case compares it, or wider. Lower case
 * alone is not that: APFS also reads the long s (U+017F) as `s`, the Kelvin
 * sign (U+212A) as `k`, the sharp s in either case as `ss` and the Latin
 * ligatures as the letters they join, so `.mcp.j\u017Fon` opens `.mcp.json`
 * and `.\u1E9Eh` opens `.ssh`. Compatibility forms are folded too, and the
 * case mapping is repeated until it settles, because the capital sharp s
 * takes two rounds. Anything this folds that a volume does not is refused
 * where it could have been allowed, never the reverse, so it is used only to
 * decide that a name is protected or holds credentials.
 */
export function foldedFileName(name: string): string {
  let folded = name.replace(IGNORED_BY_HFS, '').normalize('NFKC');
  for (let round = 0; round < FOLD_ROUNDS; round += 1) {
    const next = folded.toUpperCase().toLowerCase();
    if (next === folded) break;
    folded = next;
  }
  return folded.normalize('NFKC');
}

function rawSegments(value: string): string[] {
  return value.split(/[\\/]+/u).filter((segment) => segment !== '' && segment !== '.');
}

function pathSegments(value: string): string[] {
  return rawSegments(value).map(foldedFileName);
}

/**
 * Refused outright: reading one of these would hand over credentials
 * wholesale. Matched on names alone, folded as `foldedFileName` folds them,
 * so the answer is the same for a path that does not exist yet and on a
 * volume that folds case. The two exceptions, a template and a public key,
 * are read from the name as written: a wider fold there would open a file
 * that only resembles one.
 */
export function isCredentialPath(filePath: string): boolean {
  const segments = pathSegments(filePath);
  const base = segments[segments.length - 1];
  const raw = rawSegments(filePath);
  const written = raw[raw.length - 1]?.toLowerCase();
  if (base === undefined || written === undefined) return false;
  if (segments.some((segment) => CREDENTIAL_DIRECTORIES.includes(segment))) return true;
  if (CREDENTIAL_BASENAMES.includes(base)) return true;
  if (
    CREDENTIAL_PATH_TAILS.some((tail) =>
      tail.every((segment, index) => segments[segments.length - tail.length + index] === segment),
    )
  ) {
    return true;
  }
  if (base.startsWith(ENVIRONMENT_FILE_PREFIX)) {
    return !ENVIRONMENT_TEMPLATE_SUFFIXES.some((suffix) => written.endsWith(suffix));
  }
  if (CREDENTIAL_EXTENSIONS.some((extension) => base.endsWith(extension))) return true;
  return SSH_PRIVATE_KEY.test(base) && !written.endsWith(SSH_PUBLIC_KEY_SUFFIX);
}

export const GIT_METADATA_ENTRY = '.git';

/**
 * The project files hooks, policy, commands, the worktree setup script and MCP
 * servers are read from. Whatever rewrites them chooses what runs next,
 * outside any sandbox. Mirrors `project_config_paths` in the sandbox-policy
 * crate.
 */
export const PROJECT_CONFIG_PATHS: readonly string[] = [
  '.agiworkforce',
  '.mcp.json',
  'mcp.json',
  '.vscode/mcp.json',
];

/**
 * Where hook managers keep what they run on a commit, a push or a checkout. A
 * sandbox denies writes here as it does to `.git`, outside a dependency or
 * build tree (`DEPENDENCY_TREE_NAMES`), where packages ship these names and
 * nothing runs them. A write the agent asks for by itself needs the user
 * wherever it is. Mirrors `HOOK_MANAGER_PATHS` in the sandbox-policy crate,
 * which says where each manager's names come from: husky's folder and its
 * version 4 files, lefthook's main and `-local` files in every format and
 * place it reads them, pre-commit's file, and overcommit's files and folder.
 */
export const HOOK_MANAGER_PATHS: readonly string[] = [
  '.husky',
  '.huskyrc',
  '.huskyrc.json',
  '.huskyrc.yaml',
  '.huskyrc.yml',
  '.huskyrc.js',
  'husky.config.js',
  '.githooks',
  'lefthook.yml',
  'lefthook.yaml',
  'lefthook.toml',
  'lefthook.json',
  'lefthook.jsonc',
  '.lefthook.yml',
  '.lefthook.yaml',
  '.lefthook.toml',
  '.lefthook.json',
  '.lefthook.jsonc',
  '.config/lefthook.yml',
  '.config/lefthook.yaml',
  '.config/lefthook.toml',
  '.config/lefthook.json',
  '.config/lefthook.jsonc',
  'lefthook-local.yml',
  'lefthook-local.yaml',
  'lefthook-local.toml',
  'lefthook-local.json',
  'lefthook-local.jsonc',
  '.lefthook-local.yml',
  '.lefthook-local.yaml',
  '.lefthook-local.toml',
  '.lefthook-local.json',
  '.lefthook-local.jsonc',
  '.config/lefthook-local.yml',
  '.config/lefthook-local.yaml',
  '.config/lefthook-local.toml',
  '.config/lefthook-local.json',
  '.config/lefthook-local.jsonc',
  '.pre-commit-config.yaml',
  '.overcommit.yml',
  '.local-overcommit.yml',
  '.git-hooks',
];

/**
 * Folder names that hold installed dependencies or build output. A sandbox
 * profile does not deny a protected name inside one: published packages ship
 * hook-manager files and even `mcp.json` in their archives, so denying them
 * there fails ordinary installs, and nothing reads them there. The approval
 * gate does not use this list: an agent's own edit of such a file asks
 * wherever it is. Mirrors `DEPENDENCY_TREE_NAMES` in the sandbox-policy crate.
 */
export const DEPENDENCY_TREE_NAMES: readonly string[] = [
  'node_modules',
  'site-packages',
  '.venv',
  'venv',
  'vendor',
  'target',
  '.pnpm-store',
  '.yarn',
  '.cargo',
  '.gradle',
  'Pods',
  'bower_components',
  '.terraform',
  '.build',
];

/**
 * Where a user keeps credentials, relative to the home folder: keys, cloud
 * and cluster logins, registry and forge tokens, git's credential stores, the
 * macOS keychains, shell histories and browser profiles. The folders of other
 * coding agents are named file by file, not whole: they also hold the
 * programs those tools install, and a command that lives there has to be able
 * to start. The rest are the files where command-line tools keep a login, by
 * the name each gives it on macOS and on Linux, and the desktop chat apps'
 * own data: each the file itself, or the narrowest folder nothing runs from.
 * A sandboxed command is given none of these to read, even where a folder it
 * may read holds one. Mirrors `CREDENTIAL_PATHS` in the sandbox-policy crate.
 */
export const HOME_CREDENTIAL_PATHS: readonly string[] = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.config/gcloud',
  '.azure',
  '.kube',
  '.docker/config.json',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.git-credentials',
  '.config/git/credentials',
  'Library/Keychains',
  '.config/gh',
  '.cargo/credentials.toml',
  '.cargo/credentials',
  '.claude.json',
  '.claude/.credentials.json',
  '.claude/settings.json',
  '.claude/projects',
  '.claude/sessions',
  '.claude/history.jsonl',
  '.claude/backups',
  '.claude/paste-cache',
  '.claude/shell-snapshots',
  '.claude/session-env',
  '.codex/auth.json',
  '.codex/config.toml',
  '.codex/sessions',
  '.codex/history.jsonl',
  '.codex/session_index.jsonl',
  '.codex/attachments',
  '.codex/shell_snapshots',
  '.zsh_history',
  '.zsh_sessions',
  '.bash_history',
  '.cursor/mcp.json',
  'Library/Application Support/Google/Chrome',
  'Library/Application Support/Chromium',
  'Library/Application Support/Microsoft Edge',
  'Library/Application Support/BraveSoftware',
  'Library/Application Support/Arc',
  'Library/Application Support/Firefox',
  'Library/Safari',
  'Library/Cookies',
  'Library/Containers/com.apple.Safari',
  '.config/google-chrome',
  '.config/chromium',
  '.config/microsoft-edge',
  '.config/BraveSoftware',
  '.mozilla',
  '.local/share/opencode/auth.json',
  '.local/state/gh',
  '.config/glab-cli',
  '.config/hub',
  '.config/github-copilot',
  'Library/Application Support/com.vercel.cli/auth.json',
  '.local/share/com.vercel.cli/auth.json',
  'Library/Preferences/netlify/config.json',
  '.config/netlify/config.json',
  '.fly/config.yml',
  '.supabase/access-token',
  '.railway/config.json',
  '.doppler',
  '.config/op',
  '.op',
  '.config/stripe/config.toml',
  '.config/neonctl/credentials.json',
  '.config/doctl/config.yaml',
  '.config/pnpm/rc',
  'Library/Preferences/pnpm/rc',
  '.yarnrc.yml',
  '.yarnrc',
  '.bunfig.toml',
  '.config/pip/pip.conf',
  '.pip/pip.conf',
  '.config/pypoetry/auth.toml',
  'Library/Application Support/pypoetry/auth.toml',
  '.gem/credentials',
  '.m2/settings.xml',
  '.gradle/gradle.properties',
  '.composer/auth.json',
  '.config/composer/auth.json',
  '.config/helm/registry/config.json',
  'Library/Preferences/helm/registry/config.json',
  '.terraform.d/credentials.tfrc.json',
  '.terraformrc',
  '.pulumi/credentials.json',
  '.config/ngrok/ngrok.yml',
  'Library/Application Support/ngrok/ngrok.yml',
  '.ngrok2/ngrok.yml',
  '.cloudflared',
  '.wrangler/config/default.toml',
  '.config/.wrangler/config/default.toml',
  'Library/Preferences/.wrangler/config/default.toml',
  '.config/configstore/firebase-tools.json',
  '.expo/state.json',
  '.sentryclirc',
  '.cache/huggingface/token',
  '.cache/huggingface/stored_tokens',
  '.huggingface/token',
  '.ollama/id_ed25519',
  '.vault-token',
  '.config/rclone/rclone.conf',
  '.boto',
  '.s3cfg',
  '.pgpass',
  '.my.cnf',
  'Library/Application Support/Claude',
  'Library/Application Support/com.openai.chat',
  'Library/Application Support/com.openai.atlas',
];

/**
 * Every protected entry, as a path relative to a project folder. Mirrors
 * `protected_project_entries` in the sandbox-policy crate, entry for entry.
 */
export const PROTECTED_WORKSPACE_PATHS: readonly string[] = [
  GIT_METADATA_ENTRY,
  ...PROJECT_CONFIG_PATHS,
  ...HOOK_MANAGER_PATHS,
];

const PROTECTED_WORKSPACE_ENTRIES: readonly (readonly string[])[] =
  PROTECTED_WORKSPACE_PATHS.map(pathSegments);

/**
 * True when a path inside a workspace is git metadata, project configuration
 * or a hook manager's files, or lies beneath one, at any depth: a nested
 * repository or a folder approved on its own reads the same names from its
 * own directory. Mirrors `is_protected_relative_path` in the sandbox-policy
 * crate, which is the one definition of the list.
 */
export function isProtectedWorkspacePath(relativePath: string): boolean {
  const segments = pathSegments(relativePath);
  return PROTECTED_WORKSPACE_ENTRIES.some((entry) =>
    segments.some((_, start) =>
      entry.every((segment, offset) => segments[start + offset] === segment),
    ),
  );
}

export const MAX_TEXT_READ_BYTES = 2_000_000;
/** Above any consumer's own attachment cap, so the refusal a user sees is the consumer's. */
export const MAX_BINARY_READ_BYTES = 16 * 1024 * 1024;
export const MAX_LIST_ENTRIES = 5_000;

export const MAX_GREP_MATCHES = 500;

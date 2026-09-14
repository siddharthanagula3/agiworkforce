/**
 * The wire contract between the Chrome extension and whichever desktop shell
 * it is paired with.
 *
 * The frozen Tauri app speaks this today from Rust
 * (`apps/desktop/src-tauri/src/integrations`); the Electron shell speaks it
 * from Node. It lives here rather than with the desktop runtime contract
 * because the extension is one of the two speakers and depends on this package
 * already.
 */

export const NATIVE_MESSAGING_HOST_NAME = 'com.agiworkforce.browser';

export const BROWSER_BRIDGE_LOOPBACK_ADDRESS = '127.0.0.1';
export const BROWSER_BRIDGE_DEFAULT_PORT = 8787;

export const BROWSER_BRIDGE_ROUTES = {
  pair: '/pair',
  pairRequest: '/pair/request',
  pairConfirm: '/pair/confirm',
  nativeMessage: '/native/message',
  clientState: '/client/state',
  clientCommand: '/client/command',
} as const;

export const NATIVE_HOST_TOKEN_HEADER = 'x-native-host-token';
export const BRIDGE_TOKEN_HEADER = 'x-bridge-token';

/**
 * The other local program on this machine, the CLI, asking the shell to drive
 * the paired browser.
 *
 * Its own token and header rather than the extension's: the extension proves
 * it is the paired extension, a local client proves it can read a file only
 * this user can read. Neither grant is the other's, and a leaked bridge token
 * must not let a client issue page commands.
 */
export const LOCAL_CLIENT_TOKEN_HEADER = 'x-local-client-token';

/**
 * Where the shell advertises the bridge to local clients: this file, mode
 * 0600, in the CLI's config root (the directory `AGIWORKFORCE_HOME` names,
 * else `~/.agiworkforce/`). Written when the bridge starts, removed when it
 * stops.
 *
 * A client treats the file as absent when the process it names is gone or
 * `clientState` refuses it, because a shell killed with SIGKILL leaves the
 * file behind and a port can be reused by something else.
 */
export const LOCAL_CLIENT_BRIDGE_FILE = 'desktop-bridge.json';

export const LOCAL_CLIENT_PROTOCOL_VERSION = 1;

export interface LocalClientBridgeFile {
  version: typeof LOCAL_CLIENT_PROTOCOL_VERSION;
  port: number;
  token: string;
  pid: number;
  startedAtMs: number;
}

export function isLocalClientBridgeFile(value: unknown): value is LocalClientBridgeFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocalClientBridgeFile>;
  return (
    candidate.version === LOCAL_CLIENT_PROTOCOL_VERSION &&
    typeof candidate.port === 'number' &&
    Number.isInteger(candidate.port) &&
    candidate.port > 0 &&
    candidate.port < 65_536 &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.pid === 'number' &&
    Number.isInteger(candidate.pid) &&
    typeof candidate.startedAtMs === 'number'
  );
}

/** Who is asking, named in the shell's capability prompt and activity log. */
export interface LocalClientIdentity {
  name: string;
  cwd?: string;
  threadId?: string;
}

export interface LocalClientCommandRequest {
  version: typeof LOCAL_CLIENT_PROTOCOL_VERSION;
  command: BrowserCommand;
  args: Record<string, unknown>;
  client: LocalClientIdentity;
}

/**
 * Why a local client's command did not run.
 *
 * A client shows the user a different thing for each: pair the browser, grant
 * the capability, nothing (they refused), the page never answered, or the
 * token is stale and the file should be re-read.
 */
export const LOCAL_CLIENT_FAILURE_CODES = [
  'not-paired',
  'permission-denied',
  'cancelled',
  'timeout',
  'unauthorized',
] as const;

export type LocalClientFailureCode = (typeof LOCAL_CLIENT_FAILURE_CODES)[number];

export function isLocalClientFailureCode(value: unknown): value is LocalClientFailureCode {
  return (
    typeof value === 'string' && (LOCAL_CLIENT_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export interface LocalClientCommandResponse extends Omit<BrowserCommandResult, 'id'> {
  id?: string;
  code?: LocalClientFailureCode;
}

/** What `clientState` answers: whether a command can run at all, and why not. */
export interface LocalClientStateResponse {
  version: typeof LOCAL_CLIENT_PROTOCOL_VERSION;
  paired: boolean;
  extensionId?: string;
  appVersion?: string;
}

export function isLocalClientCommandRequest(value: unknown): value is LocalClientCommandRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocalClientCommandRequest>;
  const client = candidate.client as Partial<LocalClientIdentity> | undefined;
  return (
    candidate.version === LOCAL_CLIENT_PROTOCOL_VERSION &&
    isBrowserCommand(candidate.command) &&
    !!candidate.args &&
    typeof candidate.args === 'object' &&
    !Array.isArray(candidate.args) &&
    !!client &&
    typeof client === 'object' &&
    typeof client.name === 'string' &&
    client.name.trim().length > 0 &&
    (client.cwd === undefined || typeof client.cwd === 'string') &&
    (client.threadId === undefined || typeof client.threadId === 'string')
  );
}

export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 8;
export const PAIR_REQUEST_TTL_MS = 120_000;
export const MAX_PENDING_PAIR_REQUESTS = 8;
export const MAX_PAIR_CONFIRM_ATTEMPTS = 3;

const EXTENSION_ID_RE = /^[a-p]{32}$/;
const PAIR_CODE_RE = new RegExp(`^[${PAIR_CODE_ALPHABET}]{6,12}$`);

export function isValidExtensionId(value: unknown): value is string {
  return typeof value === 'string' && EXTENSION_ID_RE.test(value);
}

export function normalizePairCode(value: string): string {
  return (value ?? '')
    .split('')
    .filter((character) => /[A-Za-z0-9]/.test(character))
    .join('')
    .toUpperCase();
}

export function isValidPairCode(value: string): boolean {
  return PAIR_CODE_RE.test(normalizePairCode(value));
}

/**
 * Chrome hands a native host its caller as `chrome-extension://<id>/`. The host
 * binds the claimed `connect.extension_id` to it, so a manifest shared with
 * another extension cannot impersonate the paired one.
 */
export function extensionIdFromLaunchOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'chrome-extension:' || parsed.pathname !== '/') return null;
  return isValidExtensionId(parsed.hostname) ? parsed.hostname : null;
}

/**
 * Desktop-initiated page work.
 *
 * The extension asks for work (`NATIVE_BROWSER_POLL_MESSAGE`) and reports back
 * (`NATIVE_BROWSER_RESULT_MESSAGE`) rather than the host pushing: the
 * extension's native client only ever resolves responses to its own requests,
 * so a push would be dropped on the floor. Both message types are versioned
 * because the Rust host predates them and answers an error to either.
 */
export const NATIVE_BROWSER_POLL_MESSAGE = 'desktop_browser_poll';
export const NATIVE_BROWSER_RESULT_MESSAGE = 'desktop_browser_result';
export const BROWSER_COMMAND_PROTOCOL_VERSION = 1;
export const BROWSER_COMMAND_POLL_WINDOW_MS = 20_000;
export const BROWSER_COMMAND_TIMEOUT_MS = 45_000;

export const BROWSER_COMMANDS = [
  'browser_read_page',
  'browser_click',
  'browser_type',
  'browser_navigate',
  'browser_screenshot',
  'browser_console',
  'browser_network',
  'browser_download',
] as const;

export type BrowserCommand = (typeof BROWSER_COMMANDS)[number];

export function isBrowserCommand(value: unknown): value is BrowserCommand {
  return typeof value === 'string' && (BROWSER_COMMANDS as readonly string[]).includes(value);
}

/** Commands that read page internals through the debugger rather than the DOM. */
export const BROWSER_CDP_COMMANDS: readonly BrowserCommand[] = [
  'browser_console',
  'browser_network',
];

export interface BrowserCommandRequest {
  version: typeof BROWSER_COMMAND_PROTOCOL_VERSION;
  id: string;
  command: BrowserCommand;
  args: Record<string, unknown>;
}

export interface BrowserCommandResult {
  version: typeof BROWSER_COMMAND_PROTOCOL_VERSION;
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function isBrowserCommandRequest(value: unknown): value is BrowserCommandRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrowserCommandRequest>;
  return (
    candidate.version === BROWSER_COMMAND_PROTOCOL_VERSION &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isBrowserCommand(candidate.command) &&
    !!candidate.args &&
    typeof candidate.args === 'object' &&
    !Array.isArray(candidate.args)
  );
}

export function isBrowserCommandResult(value: unknown): value is BrowserCommandResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrowserCommandResult>;
  return (
    candidate.version === BROWSER_COMMAND_PROTOCOL_VERSION &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.ok === 'boolean'
  );
}

export interface BrowserPageSummary {
  url: string;
  title: string;
  text: string;
}

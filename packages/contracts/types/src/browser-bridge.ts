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
} as const;

export const NATIVE_HOST_TOKEN_HEADER = 'x-native-host-token';
export const BRIDGE_TOKEN_HEADER = 'x-bridge-token';

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

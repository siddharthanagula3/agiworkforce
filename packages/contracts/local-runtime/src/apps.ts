export const APPLICATION_COMMANDS = [
  'app_open_path',
  'app_reveal_path',
  'app_open_in_editor',
  'app_open_preview',
  'app_preview_errors',
] as const;

export type ApplicationCommand = (typeof APPLICATION_COMMANDS)[number];

export interface ApplicationOpenResult {
  /** POSIX-separated path relative to the workspace root. */
  path: string;
  opened: boolean;
}

export interface PreviewConsoleError {
  message: string;
  source: string | null;
  line: number | null;
  /** How many times in a row the page logged this exact error. */
  count: number;
}

export interface PreviewConsoleReport {
  /** The page the preview shows, or null when no preview is open. */
  url: string | null;
  errors: PreviewConsoleError[];
  /** Errors logged since the last read that did not fit in `errors`. */
  dropped: number;
}

export const PREVIEW_ERROR_LIMIT = 50;
export const PREVIEW_ERROR_TEXT_LIMIT = 1_000;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * A page served on this computer, as the preview opens it, or null. Only a
 * loopback address qualifies: the preview is for what a session is building
 * here, not a browser for anywhere. 0.0.0.0, which dev servers print when they
 * listen on every interface, is opened as localhost.
 */
export function localPreviewUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2_000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.username !== '' || url.password !== '') return null;
  if (url.hostname === '0.0.0.0') url.hostname = 'localhost';
  return url.href;
}

// eslint-disable-next-line no-control-regex -- terminal colour codes are control characters by definition
const TERMINAL_ESCAPES = /\u001b\[[0-9;?]*[A-Za-z]/gu;
const LOOPBACK_URL_IN_TEXT =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?(?:\/[^\s'"<>)\]]*)?/giu;

/** The last loopback address a dev server printed, with its colour codes removed. */
export function findLocalPreviewUrl(output: string): string | null {
  const plain = output.replace(TERMINAL_ESCAPES, '');
  const found = [...plain.matchAll(LOOPBACK_URL_IN_TEXT)]
    .map((match) => localPreviewUrl(match[0]))
    .filter((url): url is string => url !== null);
  return found[found.length - 1] ?? null;
}

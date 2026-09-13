import { sanitizePageText } from '../../background/policy';

export const CONSOLE_BUFFER_LIMIT = 200;
export const CONSOLE_TEXT_MAX_CHARS = 600;
export const CONSOLE_DOMAINS: readonly string[] = ['Runtime', 'Log'];

const DUPLICATE_WINDOW_MS = 100;

export type ConsoleLevel = 'error' | 'warning' | 'info' | 'log' | 'debug';

export interface ConsoleEntry {
  readonly at: number;
  readonly level: ConsoleLevel;
  readonly source: string;
  readonly text: string;
  readonly url?: string;
  readonly line?: number;
}

const buffers = new Map<number, ConsoleEntry[]>();

const CONSOLE_API_LEVELS: Record<string, ConsoleLevel> = {
  error: 'error',
  assert: 'error',
  warning: 'warning',
  warn: 'warning',
  info: 'info',
  debug: 'debug',
  trace: 'debug',
};

const LOG_ENTRY_LEVELS: Record<string, ConsoleLevel> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  verbose: 'debug',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function describeRemoteObject(value: unknown): string {
  const remote = asRecord(value);
  if (!remote) return '';
  if ('value' in remote) {
    const raw = remote['value'];
    if (typeof raw === 'string') return raw;
    if (raw === null) return 'null';
    if (typeof raw === 'object') {
      try {
        return JSON.stringify(raw);
      } catch {
        return String(remote['description'] ?? remote['type'] ?? '');
      }
    }
    return String(raw);
  }
  if (typeof remote['unserializableValue'] === 'string') return remote['unserializableValue'];
  if (typeof remote['description'] === 'string') return remote['description'];
  return typeof remote['type'] === 'string' ? remote['type'] : '';
}

function firstCallFrame(stackTrace: unknown): { url?: string; line?: number } {
  const trace = asRecord(stackTrace);
  const frames = trace?.['callFrames'];
  if (!Array.isArray(frames) || frames.length === 0) return {};
  const frame = asRecord(frames[0]);
  if (!frame) return {};
  const url = typeof frame['url'] === 'string' && frame['url'] ? frame['url'] : undefined;
  const lineNumber = frame['lineNumber'];
  const line = typeof lineNumber === 'number' ? lineNumber + 1 : undefined;
  return { ...(url ? { url } : {}), ...(line === undefined ? {} : { line }) };
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now();
}

function push(tabId: number, entry: ConsoleEntry): void {
  const buffer = buffers.get(tabId) ?? [];
  const last = buffer[buffer.length - 1];
  if (
    last &&
    last.level === entry.level &&
    last.text === entry.text &&
    Math.abs(entry.at - last.at) < DUPLICATE_WINDOW_MS
  ) {
    return;
  }
  buffer.push(entry);
  while (buffer.length > CONSOLE_BUFFER_LIMIT) buffer.shift();
  buffers.set(tabId, buffer);
}

function buildEntry(
  level: ConsoleLevel,
  source: string,
  rawText: string,
  at: number,
  location: { url?: string; line?: number },
): ConsoleEntry | null {
  const text = sanitizePageText(rawText).trim().slice(0, CONSOLE_TEXT_MAX_CHARS);
  if (!text) return null;
  return {
    at,
    level,
    source,
    text,
    ...(location.url ? { url: location.url } : {}),
    ...(location.line === undefined ? {} : { line: location.line }),
  };
}

export function recordConsoleEvent(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): void {
  if (method === 'Runtime.consoleAPICalled') {
    const type = typeof params['type'] === 'string' ? params['type'] : 'log';
    const args = Array.isArray(params['args']) ? params['args'] : [];
    const text = args.map(describeRemoteObject).filter(Boolean).join(' ');
    const entry = buildEntry(
      CONSOLE_API_LEVELS[type] ?? 'log',
      'console',
      text,
      normalizeTimestamp(params['timestamp']),
      firstCallFrame(params['stackTrace']),
    );
    if (entry) push(tabId, entry);
    return;
  }

  if (method === 'Runtime.exceptionThrown') {
    const details = asRecord(params['exceptionDetails']);
    if (!details) return;
    const exception = asRecord(details['exception']);
    const text =
      (typeof exception?.['description'] === 'string' ? exception['description'] : '') ||
      (typeof details['text'] === 'string' ? details['text'] : '');
    const lineNumber = details['lineNumber'];
    const entry = buildEntry('error', 'uncaught', text, normalizeTimestamp(params['timestamp']), {
      ...(typeof details['url'] === 'string' && details['url']
        ? { url: details['url'] }
        : firstCallFrame(details['stackTrace'])),
      ...(typeof lineNumber === 'number' ? { line: lineNumber + 1 } : {}),
    });
    if (entry) push(tabId, entry);
    return;
  }

  if (method === 'Log.entryAdded') {
    const logEntry = asRecord(params['entry']);
    if (!logEntry) return;
    const level = typeof logEntry['level'] === 'string' ? logEntry['level'] : 'info';
    const lineNumber = logEntry['lineNumber'];
    const entry = buildEntry(
      LOG_ENTRY_LEVELS[level] ?? 'info',
      typeof logEntry['source'] === 'string' ? logEntry['source'] : 'log',
      typeof logEntry['text'] === 'string' ? logEntry['text'] : '',
      normalizeTimestamp(logEntry['timestamp']),
      {
        ...(typeof logEntry['url'] === 'string' && logEntry['url'] ? { url: logEntry['url'] } : {}),
        ...(typeof lineNumber === 'number' ? { line: lineNumber + 1 } : {}),
      },
    );
    if (entry) push(tabId, entry);
  }
}

export interface ConsoleQuery {
  readonly pattern?: string;
  readonly level?: ConsoleLevel;
  readonly limit?: number;
}

export class ConsolePatternError extends Error {}

export function readConsoleEntries(tabId: number, query: ConsoleQuery = {}): ConsoleEntry[] {
  let entries = buffers.get(tabId) ?? [];
  if (query.level) entries = entries.filter((entry) => entry.level === query.level);
  if (query.pattern) {
    let matcher: RegExp;
    try {
      matcher = new RegExp(query.pattern, 'i');
    } catch {
      throw new ConsolePatternError(`pattern "${query.pattern}" is not a valid regular expression`);
    }
    entries = entries.filter((entry) => matcher.test(entry.text));
  }
  const limit = query.limit;
  if (typeof limit === 'number' && limit > 0 && entries.length > limit) {
    return entries.slice(entries.length - limit);
  }
  return [...entries];
}

export function clearConsoleEntries(tabId: number): void {
  buffers.delete(tabId);
}

export function formatConsoleEntries(entries: readonly ConsoleEntry[]): string {
  if (entries.length === 0) return 'No console messages captured for this tab.';
  return entries
    .map((entry) => {
      const where = entry.url
        ? ` (${entry.url}${entry.line === undefined ? '' : `:${entry.line}`})`
        : '';
      return `[${entry.level}] ${entry.source}: ${entry.text}${where}`;
    })
    .join('\n');
}

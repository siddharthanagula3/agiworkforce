import { SITE_ALLOWLIST_STORAGE_KEY } from '../../background/policy';
import { authorizeBrowserToolTab } from './tabAuthority';

export const DOWNLOAD_LEDGER_STORAGE_KEY = 'agi_session_downloads';
export const DOWNLOAD_LEDGER_LIMIT = 50;

export type DownloadState = 'in_progress' | 'complete' | 'interrupted';

export interface DownloadRecord {
  readonly id: number;
  readonly url: string;
  readonly filename: string;
  readonly origin: string;
  readonly state: DownloadState;
  readonly bytesReceived: number;
  readonly totalBytes: number;
  readonly startedAt: number;
  readonly error?: string;
}

type DownloadBroadcast = (record: DownloadRecord) => void;

const ledger = new Map<number, DownloadRecord>();

let broadcast: DownloadBroadcast | null = null;
let hydrated: Promise<void> | null = null;
let listenersInstalled = false;

function sessionArea(): chrome.storage.StorageArea | null {
  return chrome.storage?.session ?? null;
}

function sanitizeRecord(value: unknown): DownloadRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = raw['id'];
  const state = raw['state'];
  if (typeof id !== 'number') return null;
  if (state !== 'in_progress' && state !== 'complete' && state !== 'interrupted') return null;
  return {
    id,
    url: typeof raw['url'] === 'string' ? raw['url'] : '',
    filename: typeof raw['filename'] === 'string' ? raw['filename'] : '',
    origin: typeof raw['origin'] === 'string' ? raw['origin'] : '',
    state,
    bytesReceived: typeof raw['bytesReceived'] === 'number' ? raw['bytesReceived'] : 0,
    totalBytes: typeof raw['totalBytes'] === 'number' ? raw['totalBytes'] : 0,
    startedAt: typeof raw['startedAt'] === 'number' ? raw['startedAt'] : 0,
    ...(typeof raw['error'] === 'string' && raw['error'] ? { error: raw['error'] } : {}),
  };
}

async function hydrateLedger(): Promise<void> {
  const area = sessionArea();
  if (!area) return;
  try {
    const stored = await area.get(DOWNLOAD_LEDGER_STORAGE_KEY);
    const list = stored?.[DOWNLOAD_LEDGER_STORAGE_KEY];
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const record = sanitizeRecord(entry);
      if (record && !ledger.has(record.id)) ledger.set(record.id, record);
    }
  } catch {
    // A session store that cannot be read leaves the in-memory ledger as-is.
  }
}

function ensureHydrated(): Promise<void> {
  hydrated ??= hydrateLedger();
  return hydrated;
}

function persistLedger(): void {
  const area = sessionArea();
  if (!area) return;
  const records = [...ledger.values()].sort((a, b) => a.startedAt - b.startedAt);
  while (records.length > DOWNLOAD_LEDGER_LIMIT) {
    const dropped = records.shift();
    if (dropped) ledger.delete(dropped.id);
  }
  void area.set({ [DOWNLOAD_LEDGER_STORAGE_KEY]: records }).catch(() => {});
}

function put(record: DownloadRecord): void {
  ledger.set(record.id, record);
  persistLedger();
  broadcast?.(record);
}

async function readSiteAllowlist(): Promise<ReadonlySet<string>> {
  try {
    const result = await chrome.storage.local.get([SITE_ALLOWLIST_STORAGE_KEY]);
    const list = result[SITE_ALLOWLIST_STORAGE_KEY];
    if (Array.isArray(list)) return new Set(list as string[]);
  } catch {
    return new Set<string>();
  }
  return new Set<string>();
}

function stateFromDelta(value: string | undefined): DownloadState | null {
  if (value === 'in_progress' || value === 'complete' || value === 'interrupted') return value;
  return null;
}

function applyDelta(delta: chrome.downloads.DownloadDelta): void {
  const existing = ledger.get(delta.id);
  if (!existing) return;
  const nextState = stateFromDelta(delta.state?.current);
  const error = delta.error?.current;
  put({
    ...existing,
    ...(nextState ? { state: nextState } : {}),
    ...(typeof delta.filename?.current === 'string' && delta.filename.current
      ? { filename: delta.filename.current }
      : {}),
    ...(typeof error === 'string' && error ? { error } : {}),
  });
  if (nextState === 'complete' || nextState === 'interrupted') {
    void refreshDownload(delta.id);
  }
}

async function refreshDownload(id: number): Promise<void> {
  const existing = ledger.get(id);
  if (!existing) return;
  try {
    const [item] = await chrome.downloads.search({ id });
    if (!item) return;
    put({
      ...existing,
      filename: item.filename || existing.filename,
      state: stateFromDelta(item.state) ?? existing.state,
      bytesReceived: item.bytesReceived ?? existing.bytesReceived,
      totalBytes: item.totalBytes ?? existing.totalBytes,
      ...(item.error ? { error: item.error } : {}),
    });
  } catch {
    // A search that fails leaves the last known state in place.
  }
}

export function initDownloadLedger(onUpdate: DownloadBroadcast): void {
  broadcast = onUpdate;
  void ensureHydrated();
  if (listenersInstalled) return;
  listenersInstalled = true;
  chrome.downloads?.onChanged?.addListener((delta) => {
    void ensureHydrated().then(() => applyDelta(delta));
  });
}

/**
 * Resolves the URL a download tool was handed against the tab it was invoked
 * from, and refuses any destination the user has not approved.
 *
 * Page text reaches the model untrusted, so an injected "download this" cannot
 * be allowed to pull a file from an arbitrary host. Same-origin with the
 * approved tab, or an origin that is itself on the allowlist, are the two cases
 * the user has actually authorized.
 */
export async function resolveDownloadUrl(rawUrl: string, tabUrl: string): Promise<string> {
  let resolved: URL;
  try {
    resolved = new URL(rawUrl, tabUrl);
  } catch {
    throw new Error(`download: "${rawUrl}" is not a URL.`);
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    throw new Error(
      `download: only http and https URLs can be downloaded, got ${resolved.protocol}`,
    );
  }
  const tabOrigin = new URL(tabUrl).origin;
  if (resolved.origin === tabOrigin) return resolved.toString();
  const allowlist = await readSiteAllowlist();
  if (!allowlist.has(resolved.origin)) {
    throw new Error(
      `download: "${resolved.origin}" is neither the page's own origin nor on your AGI ` +
        'site allowlist. Add it in the extension options before downloading from there.',
    );
  }
  return resolved.toString();
}

export async function startBrowserToolDownload(
  tabId: number,
  rawUrl: string,
): Promise<DownloadRecord> {
  const authorized = await authorizeBrowserToolTab(tabId);
  const url = await resolveDownloadUrl(rawUrl, authorized.url);
  await ensureHydrated();

  const id = await chrome.downloads.download({ url, conflictAction: 'uniquify' });
  const record: DownloadRecord = {
    id,
    url,
    filename: '',
    origin: authorized.origin,
    state: 'in_progress',
    bytesReceived: 0,
    totalBytes: 0,
    startedAt: Date.now(),
  };
  put(record);
  void refreshDownload(id);
  return record;
}

export async function listSessionDownloads(): Promise<DownloadRecord[]> {
  await ensureHydrated();
  return [...ledger.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export async function revealDownload(id: number): Promise<void> {
  await ensureHydrated();
  if (!ledger.has(id)) throw new Error('That download was not started by AGI in this session.');
  chrome.downloads.show(id);
}

export function formatDownloadRecord(record: DownloadRecord): string {
  const name = record.filename || record.url;
  if (record.state === 'complete') return `Downloaded ${name} (${record.totalBytes} bytes).`;
  if (record.state === 'interrupted') {
    return `Download of ${name} was interrupted${record.error ? `: ${record.error}` : ''}.`;
  }
  return `Started downloading ${name}. It is still in progress.`;
}

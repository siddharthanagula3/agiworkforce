import type {
  DownloadResponse,
  PageConsoleEntry,
  PageNetworkEntry,
  PageWatchResponse,
  SessionDownload,
} from '../../types';
import { el, formatTime } from './dom';

export const BROWSER_TOOLS_PANEL_CSS = `
  #sp-page-panel {
    display: none;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    gap: 14px;
    padding: 14px;
  }

  #sp-page-panel.sp-tab-visible {
    display: flex;
  }

  .sp-bt-section {
    /* A flex child shrinks below its content by default, which clipped the
       capture explainer against the rounded overflow. Each card owns its own
       height; the panel scrolls instead. */
    flex-shrink: 0;
    border: 1px solid var(--agi-ext-border);
    border-radius: 10px;
    background: var(--agi-ext-surface);
    overflow: hidden;
  }

  .sp-bt-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--agi-ext-border);
  }

  .sp-bt-title {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--agi-ext-text);
  }

  .sp-bt-action {
    flex-shrink: 0;
    min-height: 26px;
    padding: 4px 10px;
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    background: var(--agi-ext-bg);
    color: var(--agi-ext-text);
    font-size: 11px;
    cursor: pointer;
  }

  .sp-bt-action:hover:not(:disabled) {
    background: var(--agi-ext-hover);
  }

  .sp-bt-action:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .sp-bt-action[aria-pressed='true'] {
    background: var(--agi-ext-accent);
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-on-accent);
  }

  .sp-bt-filter {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
    border: none;
    border-bottom: 1px solid var(--agi-ext-border);
    background: var(--agi-ext-bg);
    color: var(--agi-ext-text);
    font-size: 11px;
  }

  .sp-bt-list {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
  }

  .sp-bt-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--agi-ext-border);
    font-size: 11px;
    color: var(--agi-ext-text);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sp-bt-row:last-child {
    border-bottom: none;
  }

  .sp-bt-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--agi-ext-text-muted);
    font-size: 10px;
  }

  .sp-bt-tag {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--agi-ext-hover);
    color: var(--agi-ext-text-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sp-bt-tag[data-level='error'],
  .sp-bt-tag[data-outcome='bad'] {
    background: var(--agi-ext-danger-bg);
    color: var(--agi-ext-danger);
  }

  .sp-bt-tag[data-level='warning'] {
    background: var(--agi-ext-warning-bg);
    color: var(--agi-ext-warning);
  }

  .sp-bt-tag[data-outcome='good'] {
    background: var(--agi-ext-success-bg);
    color: var(--agi-ext-success);
  }

  .sp-bt-empty {
    padding: 12px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--agi-ext-text-muted);
  }

  .sp-bt-link {
    align-self: flex-start;
    min-height: 24px;
    padding: 2px 0;
    border: none;
    background: none;
    color: var(--agi-ext-accent);
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
  }
`;

const REFRESH_INTERVAL_MS = 2_000;

export interface BrowserToolsPanelAPI {
  readonly panelEl: HTMLElement;
  setActive(active: boolean): void;
  applyDownload(download: SessionDownload): void;
}

type Send = <T>(message: Record<string, unknown>) => Promise<T | undefined>;

function sendMessage<T>(message: Record<string, unknown>): Promise<T | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<T | undefined>;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function describeDownload(download: SessionDownload): string {
  if (download.state === 'complete') return formatBytes(download.totalBytes);
  if (download.state === 'interrupted') return download.error ?? 'interrupted';
  if (download.totalBytes > 0) {
    return `${Math.round((download.bytesReceived / download.totalBytes) * 100)}%`;
  }
  return 'downloading';
}

function downloadOutcome(download: SessionDownload): string {
  if (download.state === 'complete') return 'good';
  if (download.state === 'interrupted') return 'bad';
  return 'neutral';
}

function fileNameOf(download: SessionDownload): string {
  if (download.filename) return download.filename.split(/[\\/]/).pop() ?? download.filename;
  try {
    return new URL(download.url).pathname.split('/').pop() || download.url;
  } catch {
    return download.url;
  }
}

interface SectionParts {
  section: HTMLElement;
  list: HTMLElement;
  empty: HTMLElement;
}

function buildSection(id: string, title: string, controls: HTMLElement[]): SectionParts {
  const head = el('div', { class: 'sp-bt-head' }, el('div', { class: 'sp-bt-title' }, title));
  for (const control of controls) head.appendChild(control);
  const list = el('ul', { class: 'sp-bt-list', id: `${id}-list` });
  const empty = el('div', { class: 'sp-bt-empty', id: `${id}-empty` });
  const section = el('section', { class: 'sp-bt-section', id }, head, list, empty);
  return { section, list, empty };
}

export function buildBrowserToolsPanel(send: Send = sendMessage): BrowserToolsPanelAPI {
  const panelEl = el('div', { id: 'sp-page-panel' });

  const watchBtn = el(
    'button',
    { class: 'sp-bt-action', type: 'button', 'aria-pressed': 'false', id: 'sp-bt-watch' },
    'Watch page',
  );
  const watchStatus = el('div', {
    class: 'sp-bt-empty',
    role: 'status',
    'aria-live': 'polite',
    id: 'sp-bt-watch-status',
  });
  const CAPTURE_EXPLAINER =
    'Console messages and network requests are captured only while a computer-use run is active or this watch is on. Chrome shows its debugging bar the whole time.';
  watchStatus.textContent = CAPTURE_EXPLAINER;
  const watchSection = el(
    'section',
    { class: 'sp-bt-section' },
    el(
      'div',
      { class: 'sp-bt-head' },
      el('div', { class: 'sp-bt-title' }, 'Page capture'),
      watchBtn,
    ),
    watchStatus,
  );

  const downloads = buildSection('sp-bt-downloads', 'Downloads', []);
  downloads.empty.textContent = 'No downloads started from AGI in this session.';

  const consoleFilter = el('input', {
    class: 'sp-bt-filter',
    type: 'search',
    placeholder: 'Filter console messages',
    'aria-label': 'Filter console messages',
  }) as HTMLInputElement;
  const consoleParts = buildSection('sp-bt-console', 'Console', []);
  consoleParts.section.insertBefore(consoleFilter, consoleParts.list);
  consoleParts.empty.textContent = 'No console messages captured for this page yet.';

  const networkFilter = el('input', {
    class: 'sp-bt-filter',
    type: 'search',
    placeholder: 'Filter requests by URL',
    'aria-label': 'Filter network requests by URL',
  }) as HTMLInputElement;
  const networkParts = buildSection('sp-bt-network', 'Network', []);
  networkParts.section.insertBefore(networkFilter, networkParts.list);
  networkParts.empty.textContent = 'No requests captured for this page yet.';

  panelEl.append(watchSection, downloads.section, consoleParts.section, networkParts.section);

  let active = false;
  let watching = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const knownDownloads = new Map<number, SessionDownload>();

  function renderDownloads(): void {
    const records = [...knownDownloads.values()].sort((a, b) => b.startedAt - a.startedAt);
    downloads.list.replaceChildren();
    downloads.empty.hidden = records.length > 0;
    for (const record of records) {
      const tag = el(
        'span',
        { class: 'sp-bt-tag', 'data-outcome': downloadOutcome(record) },
        record.state.replace('_', ' '),
      );
      const meta = el(
        'div',
        { class: 'sp-bt-row-meta' },
        tag,
        el('span', {}, describeDownload(record)),
        el('span', {}, formatTime(record.startedAt)),
      );
      const row = el('li', { class: 'sp-bt-row' }, el('div', {}, fileNameOf(record)), meta);
      if (record.state === 'complete') {
        const reveal = el('button', { class: 'sp-bt-link', type: 'button' }, 'Show in folder');
        reveal.addEventListener('click', () => {
          void send({ type: 'REVEAL_DOWNLOAD', downloadId: record.id });
        });
        row.appendChild(reveal);
      }
      downloads.list.appendChild(row);
    }
  }

  function renderConsole(entries: PageConsoleEntry[]): void {
    consoleParts.list.replaceChildren();
    consoleParts.empty.hidden = entries.length > 0;
    for (const entry of [...entries].reverse()) {
      const meta = el(
        'div',
        { class: 'sp-bt-row-meta' },
        el('span', { class: 'sp-bt-tag', 'data-level': entry.level }, entry.level),
        el('span', {}, entry.source),
      );
      consoleParts.list.appendChild(
        el('li', { class: 'sp-bt-row' }, el('div', {}, entry.text), meta),
      );
    }
  }

  function renderNetwork(entries: PageNetworkEntry[]): void {
    networkParts.list.replaceChildren();
    networkParts.empty.hidden = entries.length > 0;
    for (const entry of [...entries].reverse()) {
      const failed =
        entry.failure !== undefined || (entry.status !== undefined && entry.status >= 400);
      const outcome = failed ? 'bad' : entry.status === undefined ? 'neutral' : 'good';
      const label =
        entry.failure ?? (entry.status === undefined ? 'pending' : String(entry.status));
      const meta = el(
        'div',
        { class: 'sp-bt-row-meta' },
        el('span', { class: 'sp-bt-tag', 'data-outcome': outcome }, label),
        el('span', {}, `${entry.method} ${entry.resourceType}`),
        el('span', {}, entry.durationMs === undefined ? '' : `${entry.durationMs}ms`),
      );
      networkParts.list.appendChild(
        el('li', { class: 'sp-bt-row' }, el('div', {}, entry.url), meta),
      );
    }
  }

  async function refreshDownloads(): Promise<void> {
    const response = await send<DownloadResponse>({ type: 'LIST_DOWNLOADS' });
    if (!response?.success || !response.downloads) return;
    knownDownloads.clear();
    for (const record of response.downloads) knownDownloads.set(record.id, record);
    renderDownloads();
  }

  async function refreshCapture(): Promise<void> {
    const pattern = consoleFilter.value.trim();
    const consoleResponse = await send<PageWatchResponse>({
      type: 'READ_PAGE_CONSOLE',
      ...(pattern ? { pattern } : {}),
    });
    if (consoleResponse?.success) {
      renderConsole(consoleResponse.console ?? []);
      setWatching(consoleResponse.watching === true);
      consoleParts.empty.textContent = 'No console messages captured for this page yet.';
      watchStatus.textContent = consoleResponse.origin
        ? `${consoleResponse.watching ? 'Capturing' : 'Reporting'} on ${consoleResponse.origin}. ${CAPTURE_EXPLAINER}`
        : CAPTURE_EXPLAINER;
    } else if (consoleResponse?.error) {
      // The toggle and the banner name a live origin. Leaving them as they were
      // while the read is being refused told the user capture was running on a
      // page they had already left.
      setWatching(false);
      watchStatus.textContent = CAPTURE_EXPLAINER;
      consoleParts.list.replaceChildren();
      consoleParts.empty.hidden = false;
      consoleParts.empty.textContent = consoleResponse.error;
    }

    const urlPattern = networkFilter.value.trim();
    const networkResponse = await send<PageWatchResponse>({
      type: 'READ_PAGE_NETWORK',
      ...(urlPattern ? { pattern: urlPattern } : {}),
    });
    if (networkResponse?.success) {
      renderNetwork(networkResponse.network ?? []);
      networkParts.empty.textContent = 'No requests captured for this page yet.';
    } else if (networkResponse?.error) {
      networkParts.list.replaceChildren();
      networkParts.empty.hidden = false;
      networkParts.empty.textContent = networkResponse.error;
    }
  }

  function setWatching(next: boolean): void {
    watching = next;
    watchBtn.setAttribute('aria-pressed', String(next));
    watchBtn.textContent = next ? 'Stop watching' : 'Watch page';
  }

  watchBtn.addEventListener('click', () => {
    const target = !watching;
    watchBtn.disabled = true;
    void send<PageWatchResponse>({ type: 'SET_PAGE_WATCH', watching: target })
      .then((response) => {
        if (response?.success) {
          setWatching(response.watching === true);
          watchStatus.textContent = response.watching
            ? `Capturing console and network on ${response.origin ?? 'this page'}. Chrome's debugging bar stays up while this is on.`
            : 'Capture stopped. Nothing further is recorded from this page.';
          return refreshCapture();
        }
        setWatching(false);
        watchStatus.textContent = response?.error ?? 'Page capture could not be started.';
        return undefined;
      })
      .finally(() => {
        watchBtn.disabled = false;
      });
  });

  consoleFilter.addEventListener('input', () => {
    void refreshCapture();
  });
  networkFilter.addEventListener('input', () => {
    void refreshCapture();
  });

  return {
    panelEl,
    setActive(next: boolean): void {
      if (active === next) return;
      active = next;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      if (!next) return;
      void refreshDownloads();
      void refreshCapture();
      timer = setInterval(() => {
        void refreshDownloads();
        void refreshCapture();
      }, REFRESH_INTERVAL_MS);
    },
    applyDownload(download: SessionDownload): void {
      knownDownloads.set(download.id, download);
      renderDownloads();
    },
  };
}

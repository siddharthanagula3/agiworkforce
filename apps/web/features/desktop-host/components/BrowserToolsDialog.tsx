'use client';

import { toUserMessage } from '@/lib/user-error-message';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DesktopRuntimeError,
  type BrowserActivityEntry,
  type BrowserPairingState,
} from '@agiworkforce/local-runtime-contract';
import type { BrowserCommand, BrowserTabSummary } from '@agiworkforce/types';
import { Spinner, useDialogKeyboard } from '@agiworkforce/ui';
import {
  capturePairedBrowser,
  clickInPairedBrowser,
  downloadThroughPairedBrowser,
  navigatePairedBrowser,
  openDownloadsFolder,
  readBrowserActivity,
  listPairedTabs,
  readBrowserPairing,
  readPairedBrowserConsole,
  readPairedBrowserNetwork,
  readPairedPage,
  screenshotAttachment,
  typeInPairedBrowser,
} from '../lib/runtime-client';

const TITLE = 'Use the browser';
const INTRO =
  'Acts in the Chrome window paired with this Mac. Every action asks you first, and Chrome carries it out only on sites you approved in the extension.';
const NOT_PAIRED =
  'No browser is paired yet. Open Settings, Capabilities to pair the AGI Workforce extension with this Mac.';
const NOT_CONNECTED =
  'The paired browser is not answering. Open Chrome with the AGI Workforce extension enabled and try again.';
const FAILED = 'That browser action did not run.';
const ACTIVITY_HEADING = 'Recent activity';
const NO_ACTIVITY = 'Nothing has used the paired browser since AGI Cloud opened.';
const DOWNLOADS_HEADING = 'Downloads';
const OPEN_DOWNLOADS_LABEL = 'Open Downloads folder';
const SUB_HEADING_CLASS = 'text-xs font-medium text-muted-foreground';
const TAB_LABEL = 'Tab';
const ACTIVE_TAB_LABEL = 'The tab open now';
const CHOOSE_TAB_LABEL = 'Choose a tab';
const CHOOSE_TAB_HINT =
  'Reads the tab open now. To pick another, list the open tabs; the desktop asks first, and their titles and addresses are shown only here.';
const ACTIVITY_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD_CLASS =
  'min-h-[36px] w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';

type Field = 'selector' | 'text' | 'url';

type DialogCommand = Exclude<
  BrowserCommand,
  'browser_find' | 'browser_fill_form' | 'browser_history'
>;

interface BrowserAction {
  command: DialogCommand;
  label: string;
  fields: readonly Field[];
}

const DEFAULT_ACTION: BrowserAction = {
  command: 'browser_read_page',
  label: 'Read the page',
  fields: [],
};

const ACTIONS: readonly BrowserAction[] = [
  DEFAULT_ACTION,
  { command: 'browser_screenshot', label: 'Screenshot', fields: [] },
  { command: 'browser_click', label: 'Click', fields: ['selector'] },
  { command: 'browser_type', label: 'Type', fields: ['selector', 'text'] },
  { command: 'browser_navigate', label: 'Open a page', fields: ['url'] },
  { command: 'browser_console', label: 'Read the console', fields: [] },
  { command: 'browser_network', label: 'Read network activity', fields: [] },
  { command: 'browser_download', label: 'Download a file', fields: ['url'] },
];

const FIELD_LABELS: Record<Field, { label: string; placeholder: string }> = {
  selector: { label: 'CSS selector', placeholder: '#submit' },
  text: { label: 'Text', placeholder: 'hello' },
  url: { label: 'Address', placeholder: 'https://example.com' },
};

export interface BrowserToolsDialogProps {
  open: boolean;
  onClose: () => void;
  onAttach: (files: File[]) => void;
}

function activityLabel(command: string): string {
  return ACTIONS.find((entry) => entry.command === command)?.label ?? command;
}

function activityOutcome(entry: BrowserActivityEntry): string {
  if (entry.outcome === 'running') return 'running';
  if (entry.outcome === 'failed') return entry.error ? `failed: ${entry.error}` : 'failed';
  return 'done';
}

function messageFor(error: unknown): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : error.message;
  }
  return toUserMessage(error, FAILED);
}

function tabLabel(tab: BrowserTabSummary): string {
  const title = tab.title.trim();
  return title ? `${title} (${tab.url})` : tab.url;
}

async function runAction(
  command: DialogCommand,
  values: Record<Field, string>,
  tabId: number | null,
): Promise<{ transcript: string; files: File[] }> {
  const now = Date.now();
  switch (command) {
    case 'browser_list_tabs': {
      const tabs = await listPairedTabs();
      return { transcript: tabs.map(tabLabel).join('\n'), files: [] };
    }
    case 'browser_read_page': {
      const page = await readPairedPage(tabId ?? undefined);
      return {
        transcript: `${page.title}\n${page.url}\n\n${page.text}`,
        files: [
          new File([`${page.title}\n${page.url}\n\n${page.text}`], `page-${now}.txt`, {
            type: 'text/plain',
            lastModified: now,
          }),
        ],
      };
    }
    case 'browser_screenshot': {
      const shot = await capturePairedBrowser();
      return {
        transcript: 'Screenshot captured.',
        files: [screenshotAttachment(shot.dataUrl, now)],
      };
    }
    case 'browser_click':
      await clickInPairedBrowser(values.selector);
      return { transcript: `Clicked ${values.selector}.`, files: [] };
    case 'browser_type':
      await typeInPairedBrowser(values.selector, values.text);
      return { transcript: `Typed into ${values.selector}.`, files: [] };
    case 'browser_navigate': {
      const navigated = await navigatePairedBrowser(values.url);
      return { transcript: `Opened ${navigated.url}.`, files: [] };
    }
    case 'browser_console': {
      const read = await readPairedBrowserConsole({});
      const body = JSON.stringify(read.console, null, 2);
      return {
        transcript: `Console on ${read.origin}\n\n${body}`,
        files: [
          new File([body], `console-${now}.json`, { type: 'application/json', lastModified: now }),
        ],
      };
    }
    case 'browser_network': {
      const read = await readPairedBrowserNetwork({});
      const body = JSON.stringify(read.network, null, 2);
      return {
        transcript: `Requests on ${read.origin}\n\n${body}`,
        files: [
          new File([body], `network-${now}.json`, { type: 'application/json', lastModified: now }),
        ],
      };
    }
    case 'browser_download': {
      const started = await downloadThroughPairedBrowser(values.url);
      return {
        transcript: `Downloading ${started.download?.filename ?? values.url}.`,
        files: [],
      };
    }
  }
}

/**
 * The paired browser, driven by the user from the composer.
 *
 * Three gates stand between a click here and a page: the capability grant the
 * desktop asks for once, the per-action dialog the desktop raises every time,
 * and the extension's own approved-sites list. None of them lives here.
 */
export function BrowserToolsDialog({ open, onClose, onAttach }: BrowserToolsDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pairing, setPairing] = useState<BrowserPairingState | null>(null);
  const [action, setAction] = useState<DialogCommand>('browser_read_page');
  const [values, setValues] = useState<Record<Field, string>>({ selector: '', text: '', url: '' });
  const [result, setResult] = useState<{ transcript: string; files: File[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<BrowserActivityEntry[]>([]);
  const [tabs, setTabs] = useState<BrowserTabSummary[]>([]);
  const [tabsError, setTabsError] = useState<string | null>(null);
  const [listingTabs, setListingTabs] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);

  const refreshActivity = useCallback(() => {
    readBrowserActivity()
      .then(setActivity)
      .catch((cause: unknown) => setError(messageFor(cause)));
  }, []);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    readBrowserPairing()
      .then(setPairing)
      .catch((cause: unknown) => setError(messageFor(cause)));
    refreshActivity();
  }, [open, refreshActivity]);

  useEffect(() => {
    if (open) return;
    setTabs([]);
    setTabId(null);
    setTabsError(null);
  }, [open]);

  const onListTabs = useCallback(async () => {
    setListingTabs(true);
    setTabsError(null);
    try {
      const listed = await listPairedTabs();
      setTabs(listed);
      setTabId((current) =>
        current !== null && listed.some((tab) => tab.tabId === current) ? current : null,
      );
    } catch (cause) {
      setTabsError(messageFor(cause));
    } finally {
      setListingTabs(false);
      refreshActivity();
    }
  }, [refreshActivity]);

  useDialogKeyboard({ open, onClose, panelRef });

  const selected = ACTIONS.find((entry) => entry.command === action) ?? DEFAULT_ACTION;
  const ready = selected.fields.every((field) => values[field].trim() !== '');

  const onRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runAction(action, values, tabId));
      setPairing(await readBrowserPairing());
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setRunning(false);
      refreshActivity();
    }
  }, [action, values, tabId, refreshActivity]);

  const onAddToChat = useCallback(() => {
    if (!result || result.files.length === 0) return;
    onAttach(result.files);
    onClose();
  }, [result, onAttach, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-popover p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">{TITLE}</h2>
          <button type="button" className={BUTTON_CLASS} onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{INTRO}</p>

        {pairing && !pairing.paired ? (
          <p className="text-xs text-muted-foreground">{NOT_PAIRED}</p>
        ) : null}
        {pairing?.paired && !pairing.connected ? (
          <p className="text-xs text-muted-foreground">{NOT_CONNECTED}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((entry) => (
            <button
              key={entry.command}
              type="button"
              aria-pressed={entry.command === action}
              className={BUTTON_CLASS}
              onClick={() => {
                setAction(entry.command);
                setResult(null);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {action === 'browser_read_page' && tabs.length === 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">{CHOOSE_TAB_HINT}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={listingTabs || pairing?.paired === false}
                onClick={() => void onListTabs()}
              >
                {CHOOSE_TAB_LABEL}
              </button>
              {listingTabs ? <Spinner aria-label="Listing tabs" /> : null}
            </div>
          </div>
        ) : null}
        {action === 'browser_read_page' && tabs.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {TAB_LABEL}
            <select
              className={FIELD_CLASS}
              value={tabId === null ? '' : String(tabId)}
              onChange={(event) => {
                setTabId(event.target.value === '' ? null : Number(event.target.value));
                setResult(null);
              }}
            >
              <option value="">{ACTIVE_TAB_LABEL}</option>
              {tabs.map((tab) => (
                <option key={tab.tabId} value={String(tab.tabId)}>
                  {tabLabel(tab)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {action === 'browser_read_page' && tabsError ? (
          <p className="text-xs text-muted-foreground">{tabsError}</p>
        ) : null}

        {selected.fields.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {FIELD_LABELS[field].label}
            <input
              className={FIELD_CLASS}
              value={values[field]}
              placeholder={FIELD_LABELS[field].placeholder}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field]: event.target.value }))
              }
            />
          </label>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={running || !ready || pairing?.paired === false}
            onClick={() => void onRun()}
          >
            Run
          </button>
          {result && result.files.length > 0 ? (
            <button type="button" className={BUTTON_CLASS} onClick={onAddToChat}>
              Add to chat
            </button>
          ) : null}
          {running ? <Spinner aria-label="Running" /> : null}
        </div>

        {result ? (
          <pre
            aria-label="Browser result"
            className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-xs text-muted-foreground"
          >
            {result.transcript}
          </pre>
        ) : null}

        <section aria-label={ACTIVITY_HEADING} className="flex flex-col gap-2">
          <h3 className={SUB_HEADING_CLASS}>{ACTIVITY_HEADING}</h3>
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">{NO_ACTIVITY}</p>
          ) : (
            <ol className="flex max-h-48 list-none flex-col gap-1 overflow-y-auto p-0">
              {activity.map((entry, index) => (
                <li
                  key={`${entry.atMs}-${index}`}
                  className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"
                >
                  <span>{ACTIVITY_TIME.format(entry.atMs)}</span>
                  <span className="text-foreground">{entry.client}</span>
                  <span>{activityLabel(entry.command)}</span>
                  {entry.target ? (
                    <span className="min-w-0 truncate font-mono">{entry.target}</span>
                  ) : null}
                  <span className={entry.outcome === 'failed' ? 'text-danger' : undefined}>
                    {activityOutcome(entry)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {activity.some(
          (entry) => entry.command === 'browser_download' && entry.outcome === 'ok',
        ) ? (
          <section aria-label={DOWNLOADS_HEADING} className="flex flex-col gap-2">
            <h3 className={SUB_HEADING_CLASS}>{DOWNLOADS_HEADING}</h3>
            <ul className="flex list-none flex-col gap-1 p-0">
              {activity
                .filter((entry) => entry.command === 'browser_download' && entry.outcome === 'ok')
                .map((entry, index) => (
                  <li
                    key={`${entry.atMs}-${index}`}
                    className="truncate font-mono text-xs text-muted-foreground"
                  >
                    {entry.target}
                  </li>
                ))}
            </ul>
            <div>
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() =>
                  void openDownloadsFolder().catch((cause: unknown) => setError(messageFor(cause)))
                }
              >
                {OPEN_DOWNLOADS_LABEL}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

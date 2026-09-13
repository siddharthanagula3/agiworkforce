'use client';

import { toUserMessage } from '@/lib/user-error-message';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DesktopRuntimeError,
  type BrowserPairingState,
} from '@agiworkforce/local-runtime-contract';
import type { BrowserCommand } from '@agiworkforce/types';
import { Spinner } from '@agiworkforce/ui';
import {
  capturePairedBrowser,
  clickInPairedBrowser,
  downloadThroughPairedBrowser,
  navigatePairedBrowser,
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

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD_CLASS =
  'min-h-[36px] w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';

type Field = 'selector' | 'text' | 'url';

interface BrowserAction {
  command: BrowserCommand;
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

function messageFor(error: unknown): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : error.message;
  }
  return toUserMessage(error, FAILED);
}

async function runAction(
  command: BrowserCommand,
  values: Record<Field, string>,
): Promise<{ transcript: string; files: File[] }> {
  const now = Date.now();
  switch (command) {
    case 'browser_read_page': {
      const page = await readPairedPage();
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
  const [pairing, setPairing] = useState<BrowserPairingState | null>(null);
  const [action, setAction] = useState<BrowserCommand>('browser_read_page');
  const [values, setValues] = useState<Record<Field, string>>({ selector: '', text: '', url: '' });
  const [result, setResult] = useState<{ transcript: string; files: File[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    readBrowserPairing()
      .then(setPairing)
      .catch((cause: unknown) => setError(messageFor(cause)));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const selected = ACTIONS.find((entry) => entry.command === action) ?? DEFAULT_ACTION;
  const ready = selected.fields.every((field) => values[field].trim() !== '');

  const onRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runAction(action, values));
      setPairing(await readBrowserPairing());
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setRunning(false);
    }
  }, [action, values]);

  const onAddToChat = useCallback(() => {
    if (!result || result.files.length === 0) return;
    onAttach(result.files);
    onClose();
  }, [result, onAttach, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
      </div>
    </div>,
    document.body,
  );
}

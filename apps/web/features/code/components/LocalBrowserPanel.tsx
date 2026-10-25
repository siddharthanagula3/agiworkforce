'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Globe, RefreshCw, X } from '@agiworkforce/icons';
import {
  CLOSED_BROWSER_PANE,
  browserPaneAddress,
  type BrowserPaneBounds,
  type BrowserPaneState,
} from '@agiworkforce/local-runtime-contract';
import {
  hideBrowserPane,
  navigateBrowserPane,
  onBrowserPaneState,
  openBrowserPane,
  setBrowserPaneBounds,
  stepBrowserPane,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const MODAL_SELECTOR =
  '[aria-modal="true"], [role="alertdialog"], [role="dialog"][data-state="open"]';

export interface LocalBrowserPanelProps {
  /** A page to open, such as the address a running command is serving. */
  address: string | null;
  /** Changes each time the same address is asked for again. */
  addressKey: number;
  onClose: () => void;
}

function boundsOf(element: HTMLElement): BrowserPaneBounds {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function modalOpen(): boolean {
  return document.querySelector(MODAL_SELECTOR) !== null;
}

export function LocalBrowserPanel({ address, addressKey, onClose }: LocalBrowserPanelProps) {
  const inputId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserPaneState>(CLOSED_BROWSER_PANE);
  const [draft, setDraft] = useState(address ?? '');
  const [lastAsked, setLastAsked] = useState<string | null>(address);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<BrowserPaneState>) => {
    try {
      const next = await work();
      setState(next);
      setError(null);
      if (next.url) setDraft(next.url);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.browserFailed));
    }
  }, []);

  useEffect(
    () =>
      onBrowserPaneState((next) => {
        setState(next);
        if (next.url) setDraft(next.url);
      }),
    [],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    void run(() => openBrowserPane(boundsOf(viewport), address));
    if (address) setLastAsked(address);
    return undefined;
  }, [address, addressKey, run]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let frame = 0;
    let hidden = false;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (modalOpen()) {
          if (!hidden) {
            hidden = true;
            void hideBrowserPane().catch(() => undefined);
          }
          return;
        }
        if (hidden) {
          hidden = false;
          void openBrowserPane(boundsOf(viewport), null).catch(() => undefined);
          return;
        }
        void setBrowserPaneBounds(boundsOf(viewport)).catch(() => undefined);
      });
    };
    const resize = new ResizeObserver(sync);
    resize.observe(viewport);
    const modals = new MutationObserver(sync);
    modals.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-state', 'role'],
    });
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      modals.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      void hideBrowserPane().catch(() => undefined);
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = browserPaneAddress(draft);
    if (!url) {
      setError(LOCAL_CODE_COPY.browserInvalid);
      return;
    }
    setLastAsked(url);
    void run(() => navigateBrowserPane(url));
  };

  const showEmpty = state.url === null && state.refusedHost === null;

  return (
    <aside className={styles['changes']} aria-label={LOCAL_CODE_COPY.browser}>
      <div className={styles['changesHeader']}>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.browserBack}
            title={LOCAL_CODE_COPY.browserBack}
            disabled={!state.canGoBack}
            onClick={() => void run(() => stepBrowserPane('back'))}
          >
            <ChevronLeft size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.browserForward}
            title={LOCAL_CODE_COPY.browserForward}
            disabled={!state.canGoForward}
            onClick={() => void run(() => stepBrowserPane('forward'))}
          >
            <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.browserReload}
            title={LOCAL_CODE_COPY.browserReload}
            disabled={state.url === null}
            onClick={() => void run(() => stepBrowserPane('reload'))}
          >
            <RefreshCw size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <form className="min-w-0 flex-1" onSubmit={submit}>
            <label htmlFor={inputId} className="sr-only">
              {LOCAL_CODE_COPY.browserAddress}
            </label>
            <input
              id={inputId}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={styles['textInput']}
              placeholder={LOCAL_CODE_COPY.browserAddressPlaceholder}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </form>
        </div>
        <div className={styles['changesActions']}>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.closeBrowser}
            title={LOCAL_CODE_COPY.closeBrowser}
            onClick={onClose}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error !== null && (
        <p className={styles['formHelp']} role="alert">
          {error}
        </p>
      )}
      <div ref={viewportRef} className="relative min-h-0 flex-1">
        {showEmpty && (
          <div className={styles['changesEmpty']}>
            <Globe size={24} aria-hidden="true" />
            <p className="font-medium">{LOCAL_CODE_COPY.browserEmptyTitle}</p>
            <p>{LOCAL_CODE_COPY.browserEmptyHint}</p>
          </div>
        )}
        {state.refusedHost !== null && (
          <div className={styles['changesEmpty']} role="status">
            <p>{LOCAL_CODE_COPY.browserRefused(state.refusedHost)}</p>
            {lastAsked && (
              <button
                type="button"
                className={styles['secondaryButton']}
                onClick={() => void run(() => navigateBrowserPane(lastAsked))}
              >
                {LOCAL_CODE_COPY.browserTryAgain}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

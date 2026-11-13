'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { BROWSER_PANE_TAB_LIMIT, browserPaneAddress } from '@agiworkforce/local-runtime-contract';
import {
  captureBrowserPane,
  readBackgroundActivity,
  useDesktopHost,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { BROWSER_PANE_COPY, type BrowserPaneRequest } from '../browser-pane';
import { useBrowserPane } from '../hooks/use-browser-pane';
import { useBrowserPaneStage } from '../hooks/use-browser-pane-stage';
import { LocalCaptureAnnotator } from './LocalCaptureAnnotator';
import styles from '../CloudCodePage.module.css';
import paneStyles from './LocalBrowserPane.module.css';

const GLYPH_SIZE = 16;
const TAB_GLYPH_SIZE = 14;

type ServerSearch =
  | { status: 'idle' }
  | { status: 'looking' }
  | { status: 'none' }
  | { status: 'found'; urls: string[] }
  | { status: 'failed'; message: string };

export interface LocalBrowserPaneProps {
  paneId: string;
  rootId: string;
  /** A page something else in the session asked to see, such as a running dev server. */
  request: BrowserPaneRequest | null;
  onRequestHandled: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  /** Absent when this session cannot take pictures, which leaves the mark-up control out. */
  onAttachImage?: (file: File) => void;
}

export function LocalBrowserPane({
  paneId,
  rootId,
  request,
  onRequestHandled,
  expanded,
  onToggleExpanded,
  onClose,
  onAttachImage,
}: LocalBrowserPaneProps) {
  const host = useDesktopHost();
  const pane = useBrowserPane(paneId);
  const { activeTab, state } = pane;
  const baseId = useId();
  const panelId = `${baseId}-page`;
  const viewport = useRef<HTMLDivElement>(null);
  const tabButtons = useRef(new Map<string, HTMLButtonElement>());
  const handledRequest = useRef<number | null>(null);
  const lastAddress = useRef('');
  const [draft, setDraft] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerSearch>({ status: 'idle' });

  const shownUrl = activeTab?.url ?? '';
  const failure = activeTab?.failure ?? null;
  const hasPage = pane.ready && shownUrl !== '' && failure === null;
  const stage = useBrowserPaneStage(paneId, viewport, hasPage && annotating === null);

  const activeTabId = activeTab?.id ?? null;
  useEffect(() => {
    setDraft(null);
  }, [activeTabId]);

  const go = (url: string) => {
    lastAddress.current = url;
    setDraft(null);
    setServers({ status: 'idle' });
    void pane.navigate(url);
  };

  useEffect(() => {
    if (!pane.ready || !request || handledRequest.current === request.key) return;
    handledRequest.current = request.key;
    onRequestHandled();
    const url = browserPaneAddress(request.url);
    if (url === null) {
      pane.fail(BROWSER_PANE_COPY.addressInvalid);
      return;
    }
    lastAddress.current = url;
    setServers({ status: 'idle' });
    const open = state.tabs.find((tab) => tab.url === url);
    if (open) void pane.selectTab(open.id);
    else if (shownUrl === '' || state.tabs.length >= BROWSER_PANE_TAB_LIMIT)
      void pane.navigate(url);
    else void pane.openTab(url);
  }, [pane, request, onRequestHandled, state.tabs, shownUrl]);

  const submitAddress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = browserPaneAddress(draft ?? shownUrl);
    if (url === null) {
      pane.fail(BROWSER_PANE_COPY.addressInvalid);
      return;
    }
    go(url);
  };

  const retry = () => {
    if (shownUrl !== '') void pane.move('reload');
    else if (lastAddress.current !== '') go(lastAddress.current);
  };

  const findServer = async () => {
    setServers({ status: 'looking' });
    try {
      const activity = await readBackgroundActivity();
      const urls = [
        ...new Set(
          activity.commands
            .filter((run) => run.rootId === rootId)
            .flatMap((run) => browserPaneAddress(run.previewUrl) ?? []),
        ),
      ];
      const [only] = urls;
      if (urls.length === 1 && only) go(only);
      else setServers(urls.length === 0 ? { status: 'none' } : { status: 'found', urls });
    } catch (cause: unknown) {
      setServers({
        status: 'failed',
        message: toUserMessage(cause, BROWSER_PANE_COPY.findServerFailed),
      });
    }
  };

  const annotate = async () => {
    try {
      const capture = await captureBrowserPane(paneId);
      pane.fail(null);
      setAnnotating(capture.dataUrl);
    } catch (cause: unknown) {
      pane.fail(toUserMessage(cause, BROWSER_PANE_COPY.captureFailed));
    }
  };

  const openOutside = () => {
    if (!host || shownUrl === '') return;
    host.openExternal(shownUrl).then(
      () => pane.fail(null),
      (cause: unknown) => pane.fail(toUserMessage(cause, BROWSER_PANE_COPY.openOutsideFailed)),
    );
  };

  const moveTabFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const target = state.tabs[(index + step + state.tabs.length) % state.tabs.length];
    if (!target) return;
    void pane.selectTab(target.id);
    tabButtons.current.get(target.id)?.focus();
  };

  const canAnnotate = onAttachImage !== undefined && hasPage && !stage.paused;
  const canRetry = shownUrl !== '' || lastAddress.current !== '';
  const message = pane.error ?? state.notice;

  return (
    <aside
      className={`${styles['changes']} ${styles['changesWide']} ${paneStyles['pane']} ${
        expanded ? paneStyles['expanded'] : ''
      }`}
      aria-label={BROWSER_PANE_COPY.pane}
      data-testid="local-browser-pane"
    >
      <div className={paneStyles['tabBar']}>
        {state.tabs.length > 0 && (
          <div
            className={`${styles['terminalTabs']} ${paneStyles['tabs']}`}
            role="tablist"
            aria-label={BROWSER_PANE_COPY.tabs}
          >
            {state.tabs.map((tab, index) => {
              const selected = tab.id === state.activeTabId;
              const label = tab.title || BROWSER_PANE_COPY.blankTab;
              return (
                <div
                  key={tab.id}
                  className={`${styles['terminalTab']} ${selected ? styles['terminalTabActive'] : ''}`}
                >
                  <button
                    type="button"
                    role="tab"
                    ref={(node) => {
                      if (node) tabButtons.current.set(tab.id, node);
                      else tabButtons.current.delete(tab.id);
                    }}
                    className={styles['terminalTabButton']}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    title={tab.url || label}
                    onClick={() => void pane.selectTab(tab.id)}
                    onKeyDown={(event) => moveTabFocus(event, index)}
                  >
                    {tab.loading ? (
                      <Spinner size="sm" aria-hidden="true" />
                    ) : (
                      <Globe size={TAB_GLYPH_SIZE} aria-hidden="true" />
                    )}
                    <span className={`${styles['terminalTabLabel']} ${paneStyles['tabLabel']}`}>
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles['terminalTabClose']}
                    aria-label={BROWSER_PANE_COPY.closeTab(label)}
                    title={BROWSER_PANE_COPY.closeTab(label)}
                    onClick={() => void pane.closeTab(tab.id)}
                  >
                    <X size={TAB_GLYPH_SIZE} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {state.tabs.length < BROWSER_PANE_TAB_LIMIT && (
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={BROWSER_PANE_COPY.newTab}
            title={BROWSER_PANE_COPY.newTab}
            onClick={() => {
              setAnnotating(null);
              void pane.openTab();
            }}
          >
            <Plus size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        )}
        <span className={paneStyles['spacer']} />
        <div className={styles['changesActions']}>
          {canAnnotate && annotating === null && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={BROWSER_PANE_COPY.annotate}
              title={BROWSER_PANE_COPY.annotate}
              onClick={() => void annotate()}
            >
              <Pencil size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          {host && shownUrl !== '' && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={BROWSER_PANE_COPY.openOutside}
              title={BROWSER_PANE_COPY.openOutside}
              onClick={openOutside}
            >
              <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={`${styles['headerButton']} ${expanded ? styles['headerButtonActive'] : ''}`}
            aria-label={expanded ? BROWSER_PANE_COPY.restore : BROWSER_PANE_COPY.expand}
            aria-pressed={expanded}
            title={expanded ? BROWSER_PANE_COPY.restore : BROWSER_PANE_COPY.expand}
            onClick={onToggleExpanded}
          >
            {expanded ? (
              <Minimize2 size={GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <Maximize2 size={GLYPH_SIZE} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={BROWSER_PANE_COPY.close}
            title={BROWSER_PANE_COPY.close}
            onClick={onClose}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>

      <form className={paneStyles['addressRow']} onSubmit={submitAddress}>
        <button
          type="button"
          className={`${styles['headerButton']} ${paneStyles['nav']}`}
          aria-label={BROWSER_PANE_COPY.back}
          title={BROWSER_PANE_COPY.back}
          disabled={!activeTab?.canGoBack}
          onClick={() => void pane.move('back')}
        >
          <ChevronLeft size={GLYPH_SIZE} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles['headerButton']} ${paneStyles['nav']}`}
          aria-label={BROWSER_PANE_COPY.forward}
          title={BROWSER_PANE_COPY.forward}
          disabled={!activeTab?.canGoForward}
          onClick={() => void pane.move('forward')}
        >
          <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
        </button>
        {activeTab?.loading ? (
          <button
            type="button"
            className={`${styles['headerButton']} ${paneStyles['nav']}`}
            aria-label={BROWSER_PANE_COPY.stop}
            title={BROWSER_PANE_COPY.stop}
            onClick={() => void pane.move('stop')}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={`${styles['headerButton']} ${paneStyles['nav']}`}
            aria-label={BROWSER_PANE_COPY.reload}
            title={BROWSER_PANE_COPY.reload}
            disabled={shownUrl === ''}
            onClick={() => void pane.move('reload')}
          >
            <RefreshCw size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        )}
        <input
          className={paneStyles['address']}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={BROWSER_PANE_COPY.address}
          placeholder={BROWSER_PANE_COPY.addressPlaceholder}
          value={draft ?? shownUrl}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDraft(null);
          }}
        />
      </form>

      {message !== null && (
        <p className={paneStyles['message']} role={pane.error === null ? 'status' : 'alert'}>
          {message}
        </p>
      )}

      <div
        ref={viewport}
        id={panelId}
        className={paneStyles['viewport']}
        role="tabpanel"
        aria-label={activeTab?.title || BROWSER_PANE_COPY.pane}
      >
        {annotating !== null && onAttachImage ? (
          <LocalCaptureAnnotator
            image={annotating}
            name={BROWSER_PANE_COPY.captureName}
            onAdd={(file) => {
              onAttachImage(file);
              setAnnotating(null);
            }}
            onClose={() => setAnnotating(null)}
          />
        ) : !pane.ready ? (
          <div className={paneStyles['state']} role="status">
            <Spinner size="sm" aria-label={BROWSER_PANE_COPY.loading} />
          </div>
        ) : failure !== null ? (
          <div className={paneStyles['state']} role="alert">
            <h2 className={paneStyles['stateTitle']}>{BROWSER_PANE_COPY.failureTitle}</h2>
            <p className={paneStyles['stateBody']}>{failure}</p>
            {canRetry && (
              <button type="button" className={styles['secondaryButton']} onClick={retry}>
                {BROWSER_PANE_COPY.retry}
              </button>
            )}
          </div>
        ) : shownUrl === '' ? (
          <div className={paneStyles['state']}>
            <Globe size={28} aria-hidden="true" />
            <h2 className={paneStyles['stateTitle']}>{BROWSER_PANE_COPY.emptyTitle}</h2>
            <p className={paneStyles['stateBody']}>{BROWSER_PANE_COPY.emptyBody}</p>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={servers.status === 'looking'}
              onClick={() => void findServer()}
            >
              {servers.status === 'looking' && <Spinner size="sm" aria-hidden="true" />}
              {servers.status === 'looking'
                ? BROWSER_PANE_COPY.findingServer
                : BROWSER_PANE_COPY.findServer}
            </button>
            {servers.status === 'none' && (
              <p className={paneStyles['stateBody']} role="status">
                {BROWSER_PANE_COPY.noServer}
              </p>
            )}
            {servers.status === 'failed' && (
              <p className={paneStyles['stateBody']} role="alert">
                {servers.message}
              </p>
            )}
            {servers.status === 'found' && (
              <ul className={paneStyles['servers']} aria-label={BROWSER_PANE_COPY.serverChoices}>
                {servers.urls.map((url) => (
                  <li key={url}>
                    <button
                      type="button"
                      className={styles['secondaryButton']}
                      onClick={() => go(url)}
                    >
                      {BROWSER_PANE_COPY.openServer(url)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={paneStyles['stateNote']}>{BROWSER_PANE_COPY.emptyPrivacy}</p>
          </div>
        ) : stage.paused ? (
          stage.frozen !== null ? (
            <img
              className={paneStyles['frozen']}
              src={stage.frozen}
              alt={BROWSER_PANE_COPY.frozenPage}
            />
          ) : (
            <div className={paneStyles['state']} role="status">
              <p className={paneStyles['stateBody']}>{BROWSER_PANE_COPY.paused}</p>
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}

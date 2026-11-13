'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_BROWSER_PANE_STATE,
  type BrowserPaneHistoryAction,
  type BrowserPaneState,
  type BrowserPaneTab,
} from '@agiworkforce/local-runtime-contract';
import {
  closeBrowserPaneTab,
  moveBrowserPaneHistory,
  navigateBrowserPane,
  onBrowserPaneChanged,
  openBrowserPaneTab,
  readBrowserPane,
  selectBrowserPaneTab,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { BROWSER_PANE_COPY } from '../browser-pane';

export interface BrowserPaneController {
  state: BrowserPaneState;
  /** The tabs the desktop already holds for this pane have been read. */
  ready: boolean;
  activeTab: BrowserPaneTab | null;
  error: string | null;
  fail: (message: string | null) => void;
  openTab: (url?: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  selectTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  move: (action: BrowserPaneHistoryAction) => Promise<void>;
}

export function useBrowserPane(paneId: string): BrowserPaneController {
  const [state, setState] = useState<BrowserPaneState>(EMPTY_BROWSER_PANE_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setReady(false);
    setState(EMPTY_BROWSER_PANE_STATE);
    const unsubscribe = onBrowserPaneChanged(paneId, (next) => {
      if (current) setState(next);
    });
    readBrowserPane(paneId)
      .then((next) => {
        if (current) setState(next);
      })
      .catch((cause: unknown) => {
        if (current) setError(toUserMessage(cause, BROWSER_PANE_COPY.failed));
      })
      .finally(() => {
        if (current) setReady(true);
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [paneId]);

  const run = useCallback(async (action: () => Promise<BrowserPaneState>) => {
    try {
      setState(await action());
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, BROWSER_PANE_COPY.failed));
    }
  }, []);

  const openTab = useCallback(
    (url?: string) => run(() => openBrowserPaneTab(paneId, url)),
    [paneId, run],
  );
  const navigate = useCallback(
    (url: string) => run(() => navigateBrowserPane(paneId, url)),
    [paneId, run],
  );
  const selectTab = useCallback(
    (tabId: string) => run(() => selectBrowserPaneTab(paneId, tabId)),
    [paneId, run],
  );
  const closeTab = useCallback(
    (tabId: string) => run(() => closeBrowserPaneTab(paneId, tabId)),
    [paneId, run],
  );
  const move = useCallback(
    (action: BrowserPaneHistoryAction) => run(() => moveBrowserPaneHistory(paneId, action)),
    [paneId, run],
  );

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;

  return {
    state,
    ready,
    activeTab,
    error,
    fail: setError,
    openTab,
    navigate,
    selectTab,
    closeTab,
    move,
  };
}

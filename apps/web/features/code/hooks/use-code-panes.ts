'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CodePaneLayout = 'tiled' | 'stacked';

export interface CodeSplitPane {
  key: number;
  sessionId: string;
}

export interface CodePanes {
  active: boolean;
  panes: readonly CodeSplitPane[];
  layout: CodePaneLayout;
  primaryFocused: boolean;
  isFocused: (key: number) => boolean;
  focusPrimary: () => void;
  focus: (key: number) => void;
  select: (sessionId: string, split: boolean) => boolean;
  replace: (key: number, sessionId: string) => void;
  close: (key: number) => void;
  closePrimary: () => void;
  toggleLayout: () => void;
}

const MAX_CODE_PANES = 3;
const CLOSE_PANE_KEY = '\\';

export function useCodePanes({
  enabled,
  primaryId,
  openPrimary,
}: {
  enabled: boolean;
  primaryId: string | null;
  openPrimary: (sessionId: string) => void;
}): CodePanes {
  const [panes, setPanes] = useState<CodeSplitPane[]>([]);
  const [focusedKey, setFocusedKey] = useState<number | null>(null);
  const [layout, setLayout] = useState<CodePaneLayout>('tiled');
  const nextKey = useRef(0);
  const active = enabled && panes.length > 0;

  useEffect(() => {
    if (primaryId === null) return;
    setPanes((current) =>
      current.some((entry) => entry.sessionId === primaryId)
        ? current.filter((entry) => entry.sessionId !== primaryId)
        : current,
    );
  }, [primaryId]);

  const close = useCallback((key: number) => {
    setPanes((current) => current.filter((entry) => entry.key !== key));
    setFocusedKey((current) => (current === key ? null : current));
  }, []);

  const closePrimary = useCallback(() => {
    const [promoted, ...rest] = panes;
    if (!promoted) return;
    setPanes(rest);
    setFocusedKey(null);
    openPrimary(promoted.sessionId);
  }, [openPrimary, panes]);

  const replace = useCallback((key: number, sessionId: string) => {
    setPanes((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, sessionId } : entry)),
    );
  }, []);

  const select = useCallback(
    (sessionId: string, split: boolean) => {
      if (!enabled) return false;
      if (sessionId === primaryId) {
        setFocusedKey(null);
        return true;
      }
      const open = panes.find((entry) => entry.sessionId === sessionId);
      if (open) {
        setFocusedKey(open.key);
        return true;
      }
      const focused = panes.find((entry) => entry.key === focusedKey);
      if (split && primaryId !== null && panes.length + 1 < MAX_CODE_PANES) {
        nextKey.current += 1;
        const key = nextKey.current;
        setPanes((current) => [...current, { key, sessionId }]);
        setFocusedKey(key);
        return true;
      }
      if (focused) {
        replace(focused.key, sessionId);
        return true;
      }
      return false;
    },
    [enabled, focusedKey, panes, primaryId, replace],
  );

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== CLOSE_PANE_KEY || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (focusedKey === null) closePrimary();
      else close(focusedKey);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, close, closePrimary, focusedKey]);

  return useMemo<CodePanes>(
    () => ({
      active,
      panes,
      layout,
      primaryFocused: focusedKey === null,
      isFocused: (key) => focusedKey === key,
      focusPrimary: () => setFocusedKey(null),
      focus: setFocusedKey,
      select,
      replace,
      close,
      closePrimary,
      toggleLayout: () => setLayout((current) => (current === 'tiled' ? 'stacked' : 'tiled')),
    }),
    [active, close, closePrimary, focusedKey, layout, panes, replace, select],
  );
}

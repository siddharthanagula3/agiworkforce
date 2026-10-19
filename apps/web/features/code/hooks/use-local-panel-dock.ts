'use client';

import { useCallback, useState } from 'react';
import { isLocalPanelDock, type LocalPanelDock } from '../local-code';

const STORAGE_KEY = 'agi.code.local.panelDock';

function readDock(): LocalPanelDock {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocalPanelDock(stored) ? stored : 'right';
  } catch {
    return 'right';
  }
}

/** Where a local session's side panel sits, remembered on this device. */
export function useLocalPanelDock(): [LocalPanelDock, (dock: LocalPanelDock) => void] {
  const [dock, setDock] = useState<LocalPanelDock>(readDock);
  const choose = useCallback((next: LocalPanelDock) => {
    setDock(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
  }, []);
  return [dock, choose];
}

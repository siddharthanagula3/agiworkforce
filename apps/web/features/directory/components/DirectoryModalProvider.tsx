'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

import { buildDirectoryHash, parseDirectoryHash, type DirectorySectionKey } from '@agiworkforce/ui';

const WebDirectoryModal = dynamic(
  () => import('./WebDirectoryModal').then((m) => ({ default: m.WebDirectoryModal })),
  { ssr: false },
);

const MAIN_CONTENT_ID = 'main-content';
const ARIA_HIDDEN = 'aria-hidden';

interface DirectoryRoute {
  section: DirectorySectionKey;
  entryId: string | null;
}

interface DirectoryModalContextValue {
  isOpen: boolean;
  openDirectory: (section?: DirectorySectionKey, entryId?: string | null) => void;
  closeDirectory: () => void;
}

const DirectoryModalContext = createContext<DirectoryModalContextValue>({
  isOpen: false,
  openDirectory: () => undefined,
  closeDirectory: () => undefined,
});

export function DirectoryModalProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<DirectoryRoute | null>(null);

  const openDirectory = useCallback(
    (section: DirectorySectionKey = 'skills', entryId: string | null = null) => {
      setRoute({ section, entryId });
    },
    [],
  );

  const closeDirectory = useCallback(() => {
    setRoute(null);
    if (typeof window === 'undefined') return;
    if (!parseDirectoryHash(window.location.hash)) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const sync = () => {
      const parsed = parseDirectoryHash(window.location.hash);
      if (!parsed) return;
      setRoute({ section: parsed.section, entryId: parsed.id });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const directoryOpen = route !== null;
  useEffect(() => {
    if (!directoryOpen) return undefined;
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return undefined;
    const previous = main.getAttribute(ARIA_HIDDEN);
    main.setAttribute(ARIA_HIDDEN, 'true');
    return () => {
      if (previous === null) main.removeAttribute(ARIA_HIDDEN);
      else main.setAttribute(ARIA_HIDDEN, previous);
    };
  }, [directoryOpen]);

  const onRouteChange = useCallback((section: DirectorySectionKey, entryId: string | null) => {
    setRoute((current) =>
      current && current.section === section && current.entryId === entryId
        ? current
        : { section, entryId },
    );
    if (typeof window === 'undefined') return;
    if (!parseDirectoryHash(window.location.hash)) return;
    window.history.replaceState(null, '', buildDirectoryHash(section, entryId));
  }, []);

  return (
    <DirectoryModalContext.Provider
      value={{ isOpen: directoryOpen, openDirectory, closeDirectory }}
    >
      {children}
      {route ? (
        <WebDirectoryModal
          open
          onClose={closeDirectory}
          initialSection={route.section}
          initialEntryId={route.entryId}
          onRouteChange={onRouteChange}
        />
      ) : null}
    </DirectoryModalContext.Provider>
  );
}

export function useDirectoryModal() {
  return useContext(DirectoryModalContext);
}

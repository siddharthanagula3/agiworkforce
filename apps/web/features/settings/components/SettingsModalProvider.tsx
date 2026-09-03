'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const WebSettingsModal = dynamic(
  () => import('./WebSettingsModal').then((m) => ({ default: m.WebSettingsModal })),
  { ssr: false },
);

interface SettingsModalContextValue {
  isOpen: boolean;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
}

const SettingsModalContext = createContext<SettingsModalContextValue>({
  isOpen: false,
  openSettings: () => undefined,
  closeSettings: () => undefined,
});

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<string>('general');

  const openSettings = useCallback((section = 'general') => {
    setInitialSection(section);
    setIsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const main = document.getElementById('main-content');
    if (!main) return undefined;
    const previous = main.getAttribute('aria-hidden');
    main.setAttribute('aria-hidden', 'true');
    return () => {
      if (previous === null) main.removeAttribute('aria-hidden');
      else main.setAttribute('aria-hidden', previous);
    };
  }, [isOpen]);

  return (
    <SettingsModalContext.Provider value={{ isOpen, openSettings, closeSettings }}>
      {children}
      {isOpen ? (
        <WebSettingsModal open={isOpen} onClose={closeSettings} initialSection={initialSection} />
      ) : null}
    </SettingsModalContext.Provider>
  );
}

export function useSettingsModal() {
  return useContext(SettingsModalContext);
}

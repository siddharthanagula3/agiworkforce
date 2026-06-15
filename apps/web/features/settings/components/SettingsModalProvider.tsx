'use client';

/**
 * SettingsModalProvider — app-level context that holds open/close state for
 * WebSettingsModal so any component (sidebar avatar, header button, etc.) can
 * open the settings modal without prop-drilling.
 *
 * Usage:
 *   // anywhere in the tree
 *   const { openSettings } = useSettingsModal();
 *   openSettings('billing'); // optional section key
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import dynamic from 'next/dynamic';

const WebSettingsModal = dynamic(
  () => import('./WebSettingsModal').then((m) => ({ default: m.WebSettingsModal })),
  { ssr: false },
);

// ─── Context ──────────────────────────────────────────────────────────────────

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

// ─── Provider ─────────────────────────────────────────────────────────────────

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

  return (
    <SettingsModalContext.Provider value={{ isOpen, openSettings, closeSettings }}>
      {children}
      <WebSettingsModal open={isOpen} onClose={closeSettings} initialSection={initialSection} />
    </SettingsModalContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSettingsModal() {
  return useContext(SettingsModalContext);
}

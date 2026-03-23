import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '../lib/tokens';

type ActiveView = 'chat' | 'projects' | 'project-detail' | 'skills' | 'connectors' | 'customize';
type ActiveRightPanel = 'artifact' | null;

interface UIState {
  sidebarCollapsed: boolean;
  activeView: ActiveView;
  activeRightPanel: ActiveRightPanel;
  artifactPanelWidth: number;
  settingsOpen: boolean;
  settingsTab: string;
  commandPaletteOpen: boolean;
  themeMode: ThemeMode;
  searchModalOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveView: (view: ActiveView) => void;
  openArtifactPanel: () => void;
  closeArtifactPanel: () => void;
  setArtifactPanelWidth: (width: number) => void;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  toggleCommandPalette: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSearchModal: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeView: 'chat' as ActiveView,
      activeRightPanel: null,
      artifactPanelWidth: 400,
      settingsOpen: false,
      settingsTab: 'general',
      commandPaletteOpen: false,
      themeMode: 'dark' as ThemeMode,
      searchModalOpen: false,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setActiveView: (view) => set({ activeView: view }),

      openArtifactPanel: () => set({ activeRightPanel: 'artifact', sidebarCollapsed: true }),

      closeArtifactPanel: () => set({ activeRightPanel: null }),

      setArtifactPanelWidth: (width) =>
        set({ artifactPanelWidth: Math.max(280, Math.min(900, width)) }),

      openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? 'general' }),

      closeSettings: () => set({ settingsOpen: false }),

      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

      setThemeMode: (mode) => set({ themeMode: mode }),

      toggleSearchModal: () => set((state) => ({ searchModalOpen: !state.searchModalOpen })),
    }),
    {
      name: 'chat-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        themeMode: state.themeMode,
        artifactPanelWidth: state.artifactPanelWidth,
      }),
    },
  ),
);

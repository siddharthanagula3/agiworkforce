/**
 * Sidecar Store
 *
 * Manages sidecar panel state (terminal, browser, code editor views).
 * Split from unifiedChatStore for better modularity.
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(immer(...))))
 * - Export selectors for all state slices
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { EnhancedMessage } from './types';

export type SidecarSection =
  | 'operations'
  | 'reasoning'
  | 'approvals'
  | 'files'
  | 'terminal'
  | 'browser'
  | 'media'
  | 'tools'
  | 'tasks'
  | 'agents';

export type SidecarMode = 'code' | 'browser' | 'terminal' | 'preview' | 'diff' | 'canvas' | 'data';

export interface SidecarState {
  isOpen: boolean;
  activeMode: SidecarMode;
  contextId: string | null;
  context?: unknown;
  autoTrigger: boolean;
}

// Storage fallback for SSR/non-browser environments
const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const STORAGE_VERSION = 1;

export interface SidecarStoreState {
  // Legacy sidecar state
  sidecarOpen: boolean;
  sidecarSection: SidecarSection;
  sidecarWidth: number;
  sidecarUserSelected: boolean;

  // Sidebar state
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // New sidecar state
  sidecar: SidecarState;

  // Actions - Sidecar panel
  setSidecarOpen: (open: boolean) => void;
  setSidecarSection: (section: SidecarSection) => void;
  setSidecarSectionFromEvent: (event: string) => void;
  setSidecarWidth: (width: number) => void;

  // Actions - Sidebar
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Actions - New sidecar
  setSidecar: (state: Partial<SidecarState>) => void;
  openSidecar: (mode: SidecarMode, contextId?: string, context?: unknown) => void;
  closeSidecar: () => void;

  // Actions - Utilities
  getSuggestedSidecarMode: (message: EnhancedMessage) => SidecarMode | null;

  // Actions - Reset
  resetOnLogout: () => void;
}

export const useSidecarStore = create<SidecarStoreState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, _get) => ({
          // Initial state
          sidecarOpen: false,
          sidecarSection: 'operations',
          sidecarWidth: 400,
          sidecarUserSelected: false,
          sidebarWidth: 260,
          sidebarCollapsed: false,
          sidecar: {
            isOpen: false,
            activeMode: 'code',
            contextId: null,
            autoTrigger: false,
          },

          // Sidecar panel actions
          setSidecarOpen: (open) =>
            set((state) => {
              state.sidecarOpen = open;
              if (!open) {
                state.sidecarUserSelected = false;
              }
            }),

          setSidecarSection: (section) =>
            set((state) => {
              state.sidecarSection = section;
              state.sidecarUserSelected = true;
            }),

          setSidecarSectionFromEvent: (eventType) =>
            set((state) => {
              if (state.sidecarUserSelected) return;
              const lowered = eventType.toLowerCase();
              let target: SidecarSection | null = null;
              if (lowered.includes('terminal') || lowered.includes('execute')) {
                target = 'terminal';
              } else if (
                lowered.includes('read_file') ||
                lowered.includes('edit_file') ||
                lowered.includes('file')
              ) {
                target = 'files';
              } else if (lowered.includes('browser')) {
                target = 'browser';
              } else if (
                lowered.includes('generate_image') ||
                lowered.includes('generate_video') ||
                lowered.includes('media')
              ) {
                target = 'media';
              }
              if (!target) return;
              if (!state.sidecarOpen) {
                state.sidecarOpen = true;
              }
              state.sidecarSection = target;
            }),

          setSidecarWidth: (width) =>
            set((state) => {
              state.sidecarWidth = width;
            }),

          // Sidebar actions
          setSidebarWidth: (width) =>
            set((state) => {
              state.sidebarWidth = width;
            }),

          setSidebarCollapsed: (collapsed) =>
            set((state) => {
              state.sidebarCollapsed = collapsed;
            }),

          // New sidecar actions
          setSidecar: (updates) =>
            set((state) => {
              state.sidecar = { ...state.sidecar, ...updates };
            }),

          openSidecar: (mode, contextId, context) =>
            set((state) => {
              state.sidecar.isOpen = true;
              state.sidecar.activeMode = mode;
              state.sidecar.contextId = contextId ?? null;
              state.sidecar.context = context;
              state.sidecarOpen = true;
            }),

          closeSidecar: () =>
            set((state) => {
              state.sidecar.isOpen = false;
              state.sidecarOpen = false;
            }),

          // Utilities
          getSuggestedSidecarMode: (message) => {
            const content = message.content.toLowerCase();

            const codeBlockMatches = message.content.match(/```[\s\S]+?```/g);
            if (
              codeBlockMatches &&
              codeBlockMatches.some((block) => {
                const lines = block.split('\n').length;
                return lines > 15;
              })
            ) {
              return 'code';
            }

            if (
              content.includes('.csv') ||
              content.includes('id,name,value') ||
              content.includes('```csv')
            ) {
              return 'data';
            }

            if (
              content.includes('http://') ||
              content.includes('https://') ||
              message.operations?.some(
                (op) =>
                  op.type === 'tool' &&
                  typeof op.data === 'object' &&
                  op.data !== null &&
                  typeof (op.data as { toolName?: string }).toolName === 'string' &&
                  (op.data as { toolName: string }).toolName.includes('browser'),
              )
            ) {
              return 'browser';
            }

            if (message.operations?.some((op) => op.type === 'terminal')) {
              return 'terminal';
            }

            if (content.includes('diff') || (content.includes('---') && content.includes('+++'))) {
              return 'diff';
            }

            if (codeBlockMatches || content.includes('```')) {
              return 'preview';
            }

            return null;
          },

          // Reset
          resetOnLogout: () =>
            set((state) => {
              state.sidecarOpen = false;
              state.sidecarSection = 'operations';
              state.sidecarUserSelected = false;
              state.sidecar = {
                isOpen: false,
                activeMode: 'code',
                contextId: null,
                autoTrigger: false,
              };
            }),
        })),
      ),
      {
        name: 'sidecar-storage',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          sidecarOpen: state.sidecarOpen,
          sidecarSection: state.sidecarSection,
          sidecarWidth: state.sidecarWidth,
          sidebarWidth: state.sidebarWidth,
          sidebarCollapsed: state.sidebarCollapsed,
          sidecar: state.sidecar,
        }),
      },
    ),
    { name: 'SidecarStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectSidecarOpen = (state: SidecarStoreState) => state.sidecarOpen;
export const selectSidecarSection = (state: SidecarStoreState) => state.sidecarSection;
export const selectSidecarWidth = (state: SidecarStoreState) => state.sidecarWidth;
export const selectSidecarUserSelected = (state: SidecarStoreState) => state.sidecarUserSelected;
export const selectSidebarWidth = (state: SidecarStoreState) => state.sidebarWidth;
export const selectSidebarCollapsed = (state: SidecarStoreState) => state.sidebarCollapsed;
export const selectSidecar = (state: SidecarStoreState) => state.sidecar;

// Derived selectors
export const selectIsSidecarVisible = (state: SidecarStoreState) =>
  state.sidecarOpen || state.sidecar.isOpen;

export const selectActiveSidecarMode = (state: SidecarStoreState) => state.sidecar.activeMode;

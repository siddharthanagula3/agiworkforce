// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * Execution Sidecar Store
 *
 * Manages the persistent right-panel execution sidecar state:
 * panel visibility, active context view, filmstrip screenshots,
 * and tool-to-chat highlight linking.
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(persist(immer(...)))
 * - Export selectors for all state slices
 * - Persist only user preferences (width, isCollapsed), not transient state
 */
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { storageFallback } from '../utils/localStorage';

export type SidecarContext = 'timeline' | 'screenshot' | 'browser' | 'terminal' | 'approval';

export interface FilmstripScreenshot {
  id: string;
  url: string;
  timestamp: number;
  source: 'computer-use' | 'browser' | 'screenshot-tool';
}

const FILMSTRIP_LIMIT = 50;
const STORAGE_VERSION = 1;

export interface ExecutionSidecarState {
  isOpen: boolean;
  isCollapsed: boolean;
  width: number;
  activeContext: SidecarContext;
  userOverrideContext: SidecarContext | null;
  filmstripScreenshots: FilmstripScreenshot[];
  highlightedToolId: string | null;

  // Whether user manually closed during the current agentic session
  userClosedThisSession: boolean;

  // Actions
  open: () => void;
  close: () => void;
  collapse: () => void;
  expand: () => void;
  setWidth: (width: number) => void;
  setActiveContext: (ctx: SidecarContext) => void;
  setUserOverrideContext: (ctx: SidecarContext | null) => void;
  addFilmstripScreenshot: (screenshot: FilmstripScreenshot) => void;
  setHighlightedToolId: (id: string | null) => void;
  reset: () => void;
}

export const useExecutionSidecarStore = create<ExecutionSidecarState>()(
  devtools(
    persist(
      immer((set) => ({
        isOpen: false,
        isCollapsed: false,
        width: 400,
        activeContext: 'timeline' as SidecarContext,
        userOverrideContext: null,
        filmstripScreenshots: [],
        highlightedToolId: null,
        userClosedThisSession: false,

        open: () =>
          set(
            (state) => {
              state.isOpen = true;
              state.isCollapsed = false;
            },
            undefined,
            'executionSidecar/open',
          ),

        close: () =>
          set(
            (state) => {
              state.isOpen = false;
              state.userClosedThisSession = true;
            },
            undefined,
            'executionSidecar/close',
          ),

        collapse: () =>
          set(
            (state) => {
              state.isCollapsed = true;
            },
            undefined,
            'executionSidecar/collapse',
          ),

        expand: () =>
          set(
            (state) => {
              state.isCollapsed = false;
            },
            undefined,
            'executionSidecar/expand',
          ),

        setWidth: (width) =>
          set(
            (state) => {
              state.width = Math.max(280, Math.min(600, width));
            },
            undefined,
            'executionSidecar/setWidth',
          ),

        setActiveContext: (ctx) =>
          set(
            (state) => {
              state.activeContext = ctx;
            },
            undefined,
            'executionSidecar/setActiveContext',
          ),

        setUserOverrideContext: (ctx) =>
          set(
            (state) => {
              state.userOverrideContext = ctx;
            },
            undefined,
            'executionSidecar/setUserOverrideContext',
          ),

        addFilmstripScreenshot: (screenshot) =>
          set(
            (state) => {
              state.filmstripScreenshots.push(screenshot);
              if (state.filmstripScreenshots.length > FILMSTRIP_LIMIT) {
                state.filmstripScreenshots = state.filmstripScreenshots.slice(-FILMSTRIP_LIMIT);
              }
            },
            undefined,
            'executionSidecar/addFilmstripScreenshot',
          ),

        setHighlightedToolId: (id) =>
          set(
            (state) => {
              state.highlightedToolId = id;
            },
            undefined,
            'executionSidecar/setHighlightedToolId',
          ),

        reset: () =>
          set(
            (state) => {
              state.isOpen = false;
              state.isCollapsed = false;
              state.activeContext = 'timeline';
              state.userOverrideContext = null;
              state.filmstripScreenshots = [];
              state.highlightedToolId = null;
              state.userClosedThisSession = false;
            },
            undefined,
            'executionSidecar/reset',
          ),
      })),
      {
        name: 'execution-sidecar-storage',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          width: state.width,
          isCollapsed: state.isCollapsed,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          return persistedState as ExecutionSidecarState;
        },
      },
    ),
    { name: 'ExecutionSidecarStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectIsOpen = (state: ExecutionSidecarState) => state.isOpen;
export const selectIsCollapsed = (state: ExecutionSidecarState) => state.isCollapsed;
export const selectWidth = (state: ExecutionSidecarState) => state.width;
export const selectActiveContext = (state: ExecutionSidecarState) => state.activeContext;
export const selectUserOverrideContext = (state: ExecutionSidecarState) =>
  state.userOverrideContext;
export const selectFilmstripScreenshots = (state: ExecutionSidecarState) =>
  state.filmstripScreenshots;
export const selectHighlightedToolId = (state: ExecutionSidecarState) => state.highlightedToolId;
export const selectUserClosedThisSession = (state: ExecutionSidecarState) =>
  state.userClosedThisSession;

/**
 * Window Store
 *
 * Wires Rust window commands (window.rs) to the frontend via invoke().
 * Manages window state: maximize, fullscreen, pinned, always-on-top,
 * docking, floating window, and visibility.
 *
 * Rust commands wired:
 *   - window_get_state
 *   - window_set_pinned
 *   - window_set_always_on_top
 *   - window_set_visibility
 *   - window_dock
 *   - window_is_maximized
 *   - window_maximize
 *   - window_unmaximize
 *   - window_toggle_maximize
 *   - window_set_fullscreen
 *   - window_is_fullscreen
 *   - window_toggle_floating
 *   - window_open_floating
 *   - window_close_floating
 *   - window_is_floating_visible
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs)
// =============================================================================

export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface WindowStatePayload {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
}

// =============================================================================
// Store State
// =============================================================================

interface WindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
  floatingVisible: boolean;
  loading: boolean;
  error: string | null;

  // === Actions: State Query ===
  getState: () => Promise<WindowStatePayload>;
  isMaximized: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  isFloatingVisible: () => Promise<boolean>;

  // === Actions: Window Control ===
  setPinned: (pinned: boolean) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setVisibility: (visible: boolean) => Promise<void>;
  setDock: (position: DockPosition | null) => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  toggleFullscreen: () => Promise<void>;

  // === Actions: Floating Window ===
  toggleFloating: () => Promise<boolean>;
  openFloating: () => Promise<void>;
  closeFloating: () => Promise<void>;

  // === Lifecycle ===
  init: () => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useWindowStore = create<WindowState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        pinned: false,
        alwaysOnTop: false,
        dock: null,
        maximized: false,
        fullscreen: false,
        floatingVisible: false,
        loading: false,
        error: null,

        // =================================================================
        // State Query
        // =================================================================

        getState: async () => {
          try {
            const state = await invoke<WindowStatePayload>('window_get_state');
            set(
              {
                pinned: state.pinned,
                alwaysOnTop: state.alwaysOnTop,
                dock: state.dock,
                maximized: state.maximized,
                fullscreen: state.fullscreen,
              },
              undefined,
              'window/getState',
            );
            return state;
          } catch (err) {
            console.error('[WindowStore] getState failed:', err);
            set({ error: String(err) }, undefined, 'window/getState/error');
            throw err;
          }
        },

        isMaximized: async () => {
          try {
            const maximized = await invoke<boolean>('window_is_maximized');
            set({ maximized }, undefined, 'window/isMaximized');
            return maximized;
          } catch (err) {
            console.error('[WindowStore] isMaximized failed:', err);
            return false;
          }
        },

        isFullscreen: async () => {
          try {
            const fullscreen = await invoke<boolean>('window_is_fullscreen');
            set({ fullscreen }, undefined, 'window/isFullscreen');
            return fullscreen;
          } catch (err) {
            console.error('[WindowStore] isFullscreen failed:', err);
            return false;
          }
        },

        isFloatingVisible: async () => {
          try {
            const visible = await invoke<boolean>('window_is_floating_visible');
            set({ floatingVisible: visible }, undefined, 'window/isFloatingVisible');
            return visible;
          } catch (err) {
            console.error('[WindowStore] isFloatingVisible failed:', err);
            return false;
          }
        },

        // =================================================================
        // Window Control
        // =================================================================

        setPinned: async (pinned) => {
          try {
            await invoke('window_set_pinned', { pinned });
            set({ pinned }, undefined, 'window/setPinned');
          } catch (err) {
            console.error('[WindowStore] setPinned failed:', err);
            set({ error: String(err) }, undefined, 'window/setPinned/error');
          }
        },

        setAlwaysOnTop: async (value) => {
          try {
            await invoke('window_set_always_on_top', { value });
            set({ alwaysOnTop: value }, undefined, 'window/setAlwaysOnTop');
          } catch (err) {
            console.error('[WindowStore] setAlwaysOnTop failed:', err);
            set({ error: String(err) }, undefined, 'window/setAlwaysOnTop/error');
          }
        },

        setVisibility: async (visible) => {
          try {
            await invoke('window_set_visibility', { visible });
          } catch (err) {
            console.error('[WindowStore] setVisibility failed:', err);
            set({ error: String(err) }, undefined, 'window/setVisibility/error');
          }
        },

        setDock: async (position) => {
          try {
            await invoke('window_dock', { position: position ?? null });
            set({ dock: position }, undefined, 'window/setDock');
          } catch (err) {
            console.error('[WindowStore] setDock failed:', err);
            set({ error: String(err) }, undefined, 'window/setDock/error');
          }
        },

        maximize: async () => {
          try {
            await invoke('window_maximize');
            set({ maximized: true, fullscreen: false }, undefined, 'window/maximize');
          } catch (err) {
            console.error('[WindowStore] maximize failed:', err);
            set({ error: String(err) }, undefined, 'window/maximize/error');
          }
        },

        unmaximize: async () => {
          try {
            await invoke('window_unmaximize');
            set({ maximized: false }, undefined, 'window/unmaximize');
          } catch (err) {
            console.error('[WindowStore] unmaximize failed:', err);
            set({ error: String(err) }, undefined, 'window/unmaximize/error');
          }
        },

        toggleMaximize: async () => {
          try {
            await invoke('window_toggle_maximize');
            set(
              (s) => {
                s.maximized = !s.maximized;
              },
              undefined,
              'window/toggleMaximize',
            );
          } catch (err) {
            console.error('[WindowStore] toggleMaximize failed:', err);
            set({ error: String(err) }, undefined, 'window/toggleMaximize/error');
          }
        },

        setFullscreen: async (fullscreen) => {
          try {
            await invoke('window_set_fullscreen', { fullscreen });
            set(
              {
                fullscreen,
                maximized: fullscreen ? false : get().maximized,
              },
              undefined,
              'window/setFullscreen',
            );
          } catch (err) {
            console.error('[WindowStore] setFullscreen failed:', err);
            set({ error: String(err) }, undefined, 'window/setFullscreen/error');
          }
        },

        toggleFullscreen: async () => {
          const current = get().fullscreen;
          await get().setFullscreen(!current);
        },

        // =================================================================
        // Floating Window
        // =================================================================

        toggleFloating: async () => {
          try {
            const isVisible = await invoke<boolean>('window_toggle_floating');
            set({ floatingVisible: isVisible }, undefined, 'window/toggleFloating');
            return isVisible;
          } catch (err) {
            console.error('[WindowStore] toggleFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/toggleFloating/error');
            return false;
          }
        },

        openFloating: async () => {
          try {
            await invoke('window_open_floating');
            set({ floatingVisible: true }, undefined, 'window/openFloating');
          } catch (err) {
            console.error('[WindowStore] openFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/openFloating/error');
          }
        },

        closeFloating: async () => {
          try {
            await invoke('window_close_floating');
            set({ floatingVisible: false }, undefined, 'window/closeFloating');
          } catch (err) {
            console.error('[WindowStore] closeFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/closeFloating/error');
          }
        },

        // =================================================================
        // Lifecycle
        // =================================================================

        init: async () => {
          try {
            await get().getState();
            await get().isFloatingVisible();
          } catch {
            // Non-critical — window state will be fetched on demand
          }
        },
      })),
    ),
    { name: 'WindowStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectPinned = (s: WindowState) => s.pinned;
export const selectAlwaysOnTop = (s: WindowState) => s.alwaysOnTop;
export const selectDock = (s: WindowState) => s.dock;
export const selectMaximized = (s: WindowState) => s.maximized;
export const selectFullscreen = (s: WindowState) => s.fullscreen;
export const selectFloatingVisible = (s: WindowState) => s.floatingVisible;
export const selectWindowLoading = (s: WindowState) => s.loading;
export const selectWindowError = (s: WindowState) => s.error;

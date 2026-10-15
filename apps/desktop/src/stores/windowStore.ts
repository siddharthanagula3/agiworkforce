import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface WindowStatePayload {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
}

interface WindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
  floatingVisible: boolean;
  loading: boolean;
  error: string | null;

  getState: () => Promise<WindowStatePayload>;

  setPinned: (pinned: boolean) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setVisibility: (visible: boolean) => Promise<void>;
  setDock: (position: DockPosition | null) => Promise<void>;
  toggleMaximize: () => Promise<void>;

  toggleFloating: () => Promise<boolean>;
  closeFloating: () => Promise<void>;

  init: () => Promise<void>;
}

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

        closeFloating: async () => {
          try {
            await invoke('window_close_floating');
            set({ floatingVisible: false }, undefined, 'window/closeFloating');
          } catch (err) {
            console.error('[WindowStore] closeFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/closeFloating/error');
          }
        },

        init: async () => {
          try {
            await get().getState();
          } catch {
            return;
          }
        },
      })),
    ),
    { name: 'WindowStore', enabled: import.meta.env.DEV },
  ),
);

export const selectPinned = (s: WindowState) => s.pinned;
export const selectAlwaysOnTop = (s: WindowState) => s.alwaysOnTop;
export const selectDock = (s: WindowState) => s.dock;
export const selectMaximized = (s: WindowState) => s.maximized;
export const selectFullscreen = (s: WindowState) => s.fullscreen;
export const selectFloatingVisible = (s: WindowState) => s.floatingVisible;
export const selectWindowLoading = (s: WindowState) => s.loading;
export const selectWindowError = (s: WindowState) => s.error;

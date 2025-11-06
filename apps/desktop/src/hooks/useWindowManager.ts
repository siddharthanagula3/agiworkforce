import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type DockPosition = 'left' | 'right';

interface BackendWindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
}

interface DockPreviewPayload {
  preview: DockPosition | null;
}

interface WindowState extends BackendWindowState {
  focused: boolean;
  dockPreview: DockPosition | null;
}

const defaultState: WindowState = {
  pinned: true,
  alwaysOnTop: false,
  dock: null,
  focused: true,
  dockPreview: null,
};

export interface WindowActions {
  refresh: () => Promise<void>;
  setPinned: (value: boolean) => Promise<void>;
  togglePinned: () => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  toggleAlwaysOnTop: () => Promise<void>;
  dock: (position: DockPosition | null) => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  hide: () => Promise<void>;
  show: () => Promise<void>;
}

export function useWindowManager(): { state: WindowState; actions: WindowActions } {
  const [state, setState] = useState<WindowState>(defaultState);

  const refresh = useCallback(async () => {
    try {
      const payload = await invoke<BackendWindowState>('window_get_state');
      setState((current) => ({
        ...current,
        pinned: payload.pinned,
        alwaysOnTop: payload.alwaysOnTop,
        dock: payload.dock ?? null,
      }));
    } catch (error) {
      console.error('Failed to refresh window state', error);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let isMounted = true;
    const cleaners: UnlistenFn[] = [];

    (async () => {
      const windowStateListener = await listen<BackendWindowState>('window://state', (event) => {
        if (!isMounted) return;
        const payload = event.payload;
        setState((current) => ({
          ...current,
          pinned: payload.pinned,
          alwaysOnTop: payload.alwaysOnTop,
          dock: payload.dock ?? null,
        }));
      });

      const focusListener = await listen<boolean>('window://focus', (event) => {
        if (!isMounted) return;
        setState((current) => ({ ...current, focused: event.payload }));
      });

      const previewListener = await listen<DockPreviewPayload>('window://dock-preview', (event) => {
        if (!isMounted) return;
        setState((current) => ({ ...current, dockPreview: event.payload.preview }));
      });

      cleaners.push(windowStateListener, focusListener, previewListener);
    })();

    return () => {
      isMounted = false;
      while (cleaners.length > 0) {
        const unlisten = cleaners.pop();
        if (unlisten) {
          unlisten();
        }
      }
    };
  }, []);

  const dock = useCallback(async (position: DockPosition | null) => {
    try {
      await invoke('window_dock', { position });
    } catch (error) {
      console.error('Failed to dock window', error);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) {
        return;
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        void dock('left');
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        void dock('right');
      } else if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
        event.preventDefault();
        void dock(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dock]);

  const setPinned = useCallback(async (value: boolean) => {
    try {
      await invoke('window_set_pinned', { pinned: value });
      setState((current) => ({ ...current, pinned: value }));
    } catch (error) {
      console.error('Failed to update pinned state', error);
    }
  }, []);

  const togglePinned = useCallback(async () => {
    await setPinned(!state.pinned);
  }, [setPinned, state.pinned]);

  const setAlwaysOnTop = useCallback(async (value: boolean) => {
    try {
      await invoke('window_set_always_on_top', { value });
      setState((current) => ({ ...current, alwaysOnTop: value }));
    } catch (error) {
      console.error('Failed to update always-on-top state', error);
    }
  }, []);

  const toggleAlwaysOnTop = useCallback(async () => {
    await setAlwaysOnTop(!state.alwaysOnTop);
  }, [setAlwaysOnTop, state.alwaysOnTop]);

  const minimize = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('Failed to minimize window', error);
    }
  }, []);

  const toggleMaximize = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      await window.toggleMaximize();
    } catch (error) {
      console.error('Failed to toggle maximize state', error);
    }
  }, []);

  const hide = useCallback(async () => {
    try {
      await invoke('window_set_visibility', { visible: false });
    } catch (error) {
      console.error('Failed to hide window', error);
    }
  }, []);

  const show = useCallback(async () => {
    try {
      await invoke('window_set_visibility', { visible: true });
    } catch (error) {
      console.error('Failed to show window', error);
    }
  }, []);

  const actions: WindowActions = useMemo(
    () => ({
      refresh,
      setPinned,
      togglePinned,
      setAlwaysOnTop,
      toggleAlwaysOnTop,
      dock,
      minimize,
      toggleMaximize,
      hide,
      show,
    }),
    [
      dock,
      hide,
      minimize,
      refresh,
      setAlwaysOnTop,
      setPinned,
      show,
      toggleAlwaysOnTop,
      toggleMaximize,
      togglePinned,
    ],
  );

  return { state, actions };
}

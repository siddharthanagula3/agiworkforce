import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

export interface ScreenCapture {
  image_data: string;
  width: number;
  height: number;
  timestamp: number;
}

export type ActionType =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'move_mouse'
  | 'type'
  | 'key_press'
  | 'screenshot'
  | 'scroll'
  | 'zoom';

export interface ComputerAction {
  action_type: ActionType;
  coordinates: [number, number] | null;
  text: string | null;
  key: string | null;
  timestamp: number;
}

interface ComputerUseState {
  isActive: boolean;
  sessionId: string | null;
  currentScreenshot: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  actionLog: ComputerAction[];
  error: string | null;

  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  captureScreen: () => Promise<void>;
  logAction: (action: ComputerAction) => void;
  clearLog: () => void;
  reset: () => void;
}

export const useComputerUseStore = create<ComputerUseState>()(
  devtools(
    immer((set, get) => ({
      isActive: false,
      sessionId: null,
      currentScreenshot: null,
      screenWidth: null,
      screenHeight: null,
      actionLog: [],
      error: null,

      startSession: async () => {
        try {
          const sessionId = await invoke<string>('computer_use_start_session');
          set(
            (state) => {
              state.isActive = true;
              state.sessionId = sessionId;
              state.actionLog = [];
              state.error = null;
            },
            undefined,
            'computerUse/startSession',
          );
        } catch (error) {
          set(
            (state) => {
              state.error = String(error);
            },
            undefined,
            'computerUse/startSession/error',
          );
        }
      },

      stopSession: async () => {
        set(
          (state) => {
            state.isActive = false;
            state.sessionId = null;
          },
          undefined,
          'computerUse/stopSession',
        );
      },

      captureScreen: async () => {
        try {
          const capture = await invoke<ScreenCapture>('computer_use_capture_screen');
          set(
            (state) => {
              state.currentScreenshot = capture.image_data;
              state.screenWidth = capture.width;
              state.screenHeight = capture.height;
              state.error = null;
            },
            undefined,
            'computerUse/captureScreen',
          );

          // Log the screenshot action
          get().logAction({
            action_type: 'screenshot',
            coordinates: null,
            text: null,
            key: null,
            timestamp: capture.timestamp || Math.floor(Date.now() / 1000),
          });
        } catch (error) {
          set(
            (state) => {
              state.error = String(error);
            },
            undefined,
            'computerUse/captureScreen/error',
          );
        }
      },

      logAction: (action) => {
        set(
          (state) => {
            state.actionLog.push(action);
          },
          undefined,
          'computerUse/logAction',
        );
      },

      clearLog: () => {
        set(
          (state) => {
            state.actionLog = [];
          },
          undefined,
          'computerUse/clearLog',
        );
      },

      reset: () => {
        set(
          {
            isActive: false,
            sessionId: null,
            currentScreenshot: null,
            screenWidth: null,
            screenHeight: null,
            actionLog: [],
            error: null,
          },
          undefined,
          'computerUse/reset',
        );
      },
    })),
    { name: 'ComputerUseStore', enabled: import.meta.env.DEV },
  ),
);

/** Subscribe to Tauri computer_use events for reactive updates. Returns cleanup fn. */
export function subscribeToComputerUseEvents(): () => void {
  const unlisteners: Promise<UnlistenFn>[] = [];

  unlisteners.push(
    listen<{ action_type: string; coordinates?: [number, number]; text?: string; key?: string }>(
      'computer_use:action_completed',
      (event) => {
        const { action_type, coordinates, text, key } = event.payload;
        useComputerUseStore.getState().logAction({
          action_type: action_type as ActionType,
          coordinates: coordinates ?? null,
          text: text ?? null,
          key: key ?? null,
          timestamp: Math.floor(Date.now() / 1000),
        });
      },
    ),
  );

  unlisteners.push(
    listen<ScreenCapture>('computer_use:screenshot', (event) => {
      const capture = event.payload;
      useComputerUseStore.setState({
        currentScreenshot: capture.image_data,
        screenWidth: capture.width,
        screenHeight: capture.height,
      });
    }),
  );

  unlisteners.push(
    listen<{ session_id: string }>('computer_use:session_started', (event) => {
      useComputerUseStore.setState({
        isActive: true,
        sessionId: event.payload.session_id,
        actionLog: [],
      });
    }),
  );

  unlisteners.push(
    listen<{ session_id: string }>('computer_use:session_completed', () => {
      useComputerUseStore.setState({
        isActive: false,
        sessionId: null,
      });
    }),
  );

  return () => {
    unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
  };
}

// Selectors
export const selectIsActive = (state: ComputerUseState) => state.isActive;
export const selectSessionId = (state: ComputerUseState) => state.sessionId;
export const selectCurrentScreenshot = (state: ComputerUseState) => state.currentScreenshot;
export const selectScreenDimensions = (state: ComputerUseState) => ({
  width: state.screenWidth,
  height: state.screenHeight,
});
export const selectActionLog = (state: ComputerUseState) => state.actionLog;
export const selectComputerUseError = (state: ComputerUseState) => state.error;
export const selectLastClickPosition = (state: ComputerUseState) => {
  for (let i = state.actionLog.length - 1; i >= 0; i--) {
    const action = state.actionLog[i];
    if (
      (action.action_type === 'click' ||
        action.action_type === 'double_click' ||
        action.action_type === 'right_click') &&
      action.coordinates
    ) {
      return action.coordinates;
    }
  }
  return null;
};

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

// Session type from computer_use.rs ComputerUseSession
export interface ComputerUseSession {
  id: string;
  actions: ComputerAction[];
  screenshots: ScreenCapture[];
  started_at: number;
}

// Zoom region request/response from computer_use.rs
export interface ZoomRegionRequest {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom_level?: number;
  interpolation?: string;
  save_path?: string;
}

export interface ZoomRegionResponse {
  image_data: string;
  width: number;
  height: number;
  scale_factor: number;
  original_x: number;
  original_y: number;
  original_width: number;
  original_height: number;
  processing_time_ms: number;
  saved_path?: string;
}

// OPA task result
export interface OpaTaskResult {
  success: boolean;
  reason?: string;
  state?: unknown;
  outcome?: unknown;
}

interface ComputerUseState {
  isActive: boolean;
  sessionId: string | null;
  currentScreenshot: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  actionLog: ComputerAction[];
  sessions: ComputerUseSession[];
  error: string | null;
  isExecutingOpa: boolean;
  lastOpaResult: OpaTaskResult | null;

  // Existing actions
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  captureScreen: () => Promise<void>;
  logAction: (action: ComputerAction) => void;
  clearLog: () => void;
  reset: () => void;

  // Newly wired actions
  typeText: (text: string) => Promise<void>;
  getSession: (sessionId: string) => Promise<ComputerUseSession | null>;
  listSessions: () => Promise<ComputerUseSession[]>;
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  zoomAtPoint: (
    x: number,
    y: number,
    contextSize?: number,
    zoomLevel?: number,
  ) => Promise<ZoomRegionResponse | null>;
  suggestZoomLevel: (width: number, height: number) => Promise<number>;
  executeOpaTask: (
    description: string,
    options?: {
      timeoutMs?: number;
      maxActions?: number;
      targetApplication?: string;
      successIndicators?: string[];
    },
  ) => Promise<OpaTaskResult | null>;
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
      sessions: [],
      error: null,
      isExecutingOpa: false,
      lastOpaResult: null,

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
            sessions: [],
            error: null,
            isExecutingOpa: false,
            lastOpaResult: null,
          },
          undefined,
          'computerUse/reset',
        );
      },

      // -----------------------------------------------------------------------
      // Newly wired commands
      // -----------------------------------------------------------------------

      typeText: async (text) => {
        try {
          await invoke('computer_use_type_text', { text });
          get().logAction({
            action_type: 'type',
            coordinates: null,
            text,
            key: null,
            timestamp: Math.floor(Date.now() / 1000),
          });
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/typeText/error',
          );
        }
      },

      getSession: async (sessionId) => {
        try {
          const session = await invoke<ComputerUseSession>('computer_use_get_session', {
            sessionId,
          });
          return session;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/getSession/error',
          );
          return null;
        }
      },

      listSessions: async () => {
        try {
          const sessions = await invoke<ComputerUseSession[]>('computer_use_list_sessions');
          set(
            (state) => {
              state.sessions = sessions;
            },
            undefined,
            'computerUse/listSessions',
          );
          return sessions;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/listSessions/error',
          );
          return [];
        }
      },

      executeTool: async (toolName, args) => {
        try {
          return await invoke<unknown>('computer_use_execute_tool', { toolName, args });
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/executeTool/error',
          );
          return null;
        }
      },

      zoomAtPoint: async (x, y, contextSize, zoomLevel) => {
        try {
          const result = await invoke<ZoomRegionResponse>('computer_use_zoom_at_point', {
            x,
            y,
            contextSize,
            zoomLevel,
          });
          set(
            (state) => {
              state.currentScreenshot = result.image_data;
              state.screenWidth = result.width;
              state.screenHeight = result.height;
            },
            undefined,
            'computerUse/zoomAtPoint',
          );
          return result;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/zoomAtPoint/error',
          );
          return null;
        }
      },

      suggestZoomLevel: async (width, height) => {
        try {
          return await invoke<number>('computer_use_suggest_zoom_level', { width, height });
        } catch {
          // Fallback: larger elements need less zoom
          if (width > 100 || height > 100) return 2.0;
          if (width > 50 || height > 50) return 4.0;
          return 8.0;
        }
      },

      executeOpaTask: async (description, options) => {
        set(
          (state) => {
            state.isExecutingOpa = true;
            state.error = null;
          },
          undefined,
          'computerUse/executeOpa/start',
        );
        try {
          const result = await invoke<OpaTaskResult>('computer_use_execute_opa_task', {
            description,
            timeoutMs: options?.timeoutMs,
            maxActions: options?.maxActions,
            targetApplication: options?.targetApplication,
            successIndicators: options?.successIndicators,
          });
          set(
            (state) => {
              state.lastOpaResult = result;
              state.isExecutingOpa = false;
            },
            undefined,
            'computerUse/executeOpa/done',
          );
          return result;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isExecutingOpa = false;
            },
            undefined,
            'computerUse/executeOpa/error',
          );
          return null;
        }
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
    unlisteners.forEach((p) =>
      p
        .then((unlisten) => unlisten())
        .catch((err) => console.warn('[computerUseStore] Failed to unlisten:', err)),
    );
  };
}

// Selectors
export const selectIsActive = (state: ComputerUseState) => state.isActive;
export const selectSessionId = (state: ComputerUseState) => state.sessionId;
export const selectCurrentScreenshot = (state: ComputerUseState) => state.currentScreenshot;
export const selectScreenWidth = (state: ComputerUseState) => state.screenWidth;
export const selectScreenHeight = (state: ComputerUseState) => state.screenHeight;
export const selectActionLog = (state: ComputerUseState) => state.actionLog;
export const selectComputerUseError = (state: ComputerUseState) => state.error;
export const selectSessions = (state: ComputerUseState) => state.sessions;
export const selectIsExecutingOpa = (state: ComputerUseState) => state.isExecutingOpa;
export const selectLastOpaResult = (state: ComputerUseState) => state.lastOpaResult;
export const selectLastClickPosition = (state: ComputerUseState) => {
  for (let i = state.actionLog.length - 1; i >= 0; i--) {
    const action = state.actionLog[i];
    if (!action) continue;
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

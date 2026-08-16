// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useAppModeStore, selectPrivacyMode } from './appModeStore';
import { isLocalProvider } from '../types/provider';

type OpaExecutionMode = 'local_only' | 'byok' | 'cloud_managed';

const opaExecutionMode = (): OpaExecutionMode =>
  selectPrivacyMode(useAppModeStore.getState()) === 'managed' ? 'cloud_managed' : 'local_only';

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

export interface DesktopComputerAction {
  action_type: ActionType;
  coordinates: [number, number] | null;
  text: string | null;
  key: string | null;
  timestamp: number;
}

export interface DesktopComputerUseSession {
  id: string;
  actions: DesktopComputerAction[];
  screenshots: ScreenCapture[];
  started_at: number;
}

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

export type OpaCompletionReason =
  | { type: 'task_complete' }
  | { type: 'max_iterations_reached' }
  | { type: 'timeout' }
  | { type: 'too_many_failures'; failures: number }
  | { type: 'user_cancelled' }
  | { type: 'safety_blocked'; reason: string }
  | { type: 'not_making_progress' };

export interface OpaTaskResult {
  success: boolean;
  reason: OpaCompletionReason;
  state?: unknown;
  outcome?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseOpaTaskResult(value: unknown): OpaTaskResult {
  if (!isRecord(value) || typeof value['success'] !== 'boolean') {
    throw new Error('Native desktop control returned an invalid task result.');
  }
  if (!isRecord(value['reason']) || typeof value['reason']['type'] !== 'string') {
    throw new Error('Native desktop control returned an invalid completion reason.');
  }

  const reason = value['reason'];
  let parsedReason: OpaCompletionReason;
  switch (reason['type']) {
    case 'task_complete':
    case 'max_iterations_reached':
    case 'timeout':
    case 'user_cancelled':
    case 'not_making_progress':
      parsedReason = { type: reason['type'] };
      break;
    case 'too_many_failures':
      if (!Number.isInteger(reason['failures']) || Number(reason['failures']) < 0) {
        throw new Error('Native desktop control returned an invalid failure count.');
      }
      parsedReason = { type: reason['type'], failures: Number(reason['failures']) };
      break;
    case 'safety_blocked':
      if (typeof reason['reason'] !== 'string' || reason['reason'].trim() === '') {
        throw new Error('Native desktop control returned an invalid safety reason.');
      }
      parsedReason = { type: reason['type'], reason: reason['reason'] };
      break;
    default:
      throw new Error(
        `Native desktop control returned unknown completion reason '${reason['type']}'.`,
      );
  }
  if (value['success'] !== (parsedReason.type === 'task_complete')) {
    throw new Error('Native desktop control returned an inconsistent task result.');
  }

  return {
    success: value['success'],
    reason: parsedReason,
    ...(value['state'] === undefined ? {} : { state: value['state'] }),
    ...(value['outcome'] === undefined ? {} : { outcome: value['outcome'] }),
  };
}

export function formatOpaCompletionReason(reason: OpaCompletionReason): string {
  switch (reason.type) {
    case 'task_complete':
      return 'Desktop control completed the action.';
    case 'max_iterations_reached':
      return 'Desktop control reached its action limit before completing the task.';
    case 'timeout':
      return 'Desktop control timed out before completing the task.';
    case 'too_many_failures':
      return `Desktop control stopped after ${reason.failures} failed actions.`;
    case 'user_cancelled':
      return 'Desktop control was stopped by the user.';
    case 'safety_blocked':
      return `Desktop control was blocked by a safety check: ${reason.reason}`;
    case 'not_making_progress':
      return 'Desktop control stopped because it was not making progress.';
  }
}

interface ComputerUseState {
  isActive: boolean;
  sessionId: string | null;
  currentScreenshot: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  actionLog: DesktopComputerAction[];
  sessions: DesktopComputerUseSession[];
  error: string | null;
  isExecutingOpa: boolean;
  activeOpaExecutionId: string | null;
  cancellingOpaExecutionId: string | null;
  lastOpaResult: OpaTaskResult | null;

  computerUseEnabled: boolean;
  consentAccepted: boolean;
  allowedApps: string[];
  deniedApps: string[];
  hideAppsOnTask: boolean;

  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  captureScreen: () => Promise<void>;
  logAction: (action: DesktopComputerAction) => void;
  clearLog: () => void;
  reset: () => void;

  setComputerUseEnabled: (enabled: boolean) => void;
  setConsentAccepted: (accepted: boolean) => void;
  addAllowedApp: (app: string) => void;
  removeAllowedApp: (app: string) => void;
  addDeniedApp: (app: string) => void;
  removeDeniedApp: (app: string) => void;
  setHideAppsOnTask: (hide: boolean) => void;

  click: (x: number, y: number) => Promise<void>;
  moveMouse: (x: number, y: number) => Promise<void>;
  typeText: (text: string) => Promise<void>;
  getSession: (sessionId: string) => Promise<DesktopComputerUseSession | null>;
  listSessions: () => Promise<DesktopComputerUseSession[]>;
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  zoomRegion: (request: ZoomRegionRequest) => Promise<ZoomRegionResponse | null>;
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
      model?: string;
      provider?: string;
      executionId?: string;
    },
  ) => Promise<OpaTaskResult | null>;
  cancelOpaTask: (executionId?: string) => Promise<boolean>;
}

let pendingOpaCancellation: Promise<boolean> | null = null;

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
      activeOpaExecutionId: null,
      cancellingOpaExecutionId: null,
      lastOpaResult: null,

      computerUseEnabled: false,
      consentAccepted: false,
      allowedApps: [],
      deniedApps: [],
      hideAppsOnTask: true,

      setComputerUseEnabled: (enabled: boolean) => {
        if (!enabled) void get().cancelOpaTask();
        set({ computerUseEnabled: enabled });
      },
      setConsentAccepted: (accepted: boolean) => set({ consentAccepted: accepted }),
      addAllowedApp: (app: string) =>
        set((state) => {
          state.allowedApps.push(app);
        }),
      removeAllowedApp: (app: string) =>
        set((state) => {
          state.allowedApps = state.allowedApps.filter((a) => a !== app);
        }),
      addDeniedApp: (app: string) =>
        set((state) => {
          state.deniedApps.push(app);
        }),
      removeDeniedApp: (app: string) =>
        set((state) => {
          state.deniedApps = state.deniedApps.filter((a) => a !== app);
        }),
      setHideAppsOnTask: (hide: boolean) => set({ hideAppsOnTask: hide }),

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
        const { sessionId } = get();
        if (sessionId) {
          try {
            await invoke('computer_use_stop_session', { sessionId });
          } catch {
            // Best-effort cleanup
          }
        }
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
        void get().cancelOpaTask();
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
            activeOpaExecutionId: null,
            lastOpaResult: null,
          },
          undefined,
          'computerUse/reset',
        );
      },

      click: async (x, y) => {
        try {
          await invoke('computer_use_click', { x, y });
          get().logAction({
            action_type: 'click',
            coordinates: [x, y],
            text: null,
            key: null,
            timestamp: Math.floor(Date.now() / 1000),
          });
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/click/error',
          );
        }
      },

      moveMouse: async (x, y) => {
        try {
          await invoke('computer_use_move_mouse', { x, y });
          get().logAction({
            action_type: 'move_mouse',
            coordinates: [x, y],
            text: null,
            key: null,
            timestamp: Math.floor(Date.now() / 1000),
          });
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/moveMouse/error',
          );
        }
      },

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
          const session = await invoke<DesktopComputerUseSession>('computer_use_get_session', {
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
          const sessions = await invoke<DesktopComputerUseSession[]>('computer_use_list_sessions');
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

      zoomRegion: async (request) => {
        try {
          const result = await invoke<ZoomRegionResponse>('computer_use_zoom_region', {
            request,
          });
          set(
            (state) => {
              state.currentScreenshot = result.image_data;
              state.screenWidth = result.width;
              state.screenHeight = result.height;
            },
            undefined,
            'computerUse/zoomRegion',
          );
          return result;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'computerUse/zoomRegion/error',
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
          if (width > 100 || height > 100) return 2.0;
          if (width > 50 || height > 50) return 4.0;
          return 8.0;
        }
      },

      executeOpaTask: async (description, options) => {
        if (pendingOpaCancellation) await pendingOpaCancellation;
        if (get().activeOpaExecutionId || get().cancellingOpaExecutionId) {
          set(
            (state) => {
              state.error = state.cancellingOpaExecutionId
                ? 'The previous desktop-control action has not been confirmed stopped.'
                : 'Another desktop-control action is already running.';
            },
            undefined,
            'computerUse/executeOpa/already-running',
          );
          return null;
        }

        const executionId = options?.executionId ?? crypto.randomUUID();
        set(
          (state) => {
            state.isExecutingOpa = true;
            state.activeOpaExecutionId = executionId;
            state.error = null;
          },
          undefined,
          'computerUse/executeOpa/start',
        );
        const persistedModel =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(STORAGE_KEYS.COMPUTER_USE_MODEL)
            : null;
        const persistedProvider =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER)
            : null;
        const resolvedProvider = options?.provider ?? persistedProvider ?? null;
        const resolvedModel = options?.model ?? persistedModel ?? null;
        const executionMode = opaExecutionMode();
        const providerCrossesLocalBoundary =
          executionMode === 'local_only' &&
          resolvedProvider !== null &&
          !isLocalProvider(resolvedProvider);
        if (providerCrossesLocalBoundary) {
          toast.info(
            'Cloud vision model requires a BYOK continuation — using local models in Local mode',
          );
        }
        try {
          const rawResult = await invoke<unknown>('computer_use_execute_opa_task', {
            executionId,
            description,
            timeoutMs: options?.timeoutMs,
            maxActions: options?.maxActions,
            targetApplication: options?.targetApplication,
            successIndicators: options?.successIndicators,
            model: providerCrossesLocalBoundary ? null : resolvedModel,
            provider: providerCrossesLocalBoundary ? null : resolvedProvider,
            executionMode,
          });
          if (get().activeOpaExecutionId !== executionId) return null;
          const result = parseOpaTaskResult(rawResult);
          set(
            (state) => {
              state.lastOpaResult = result;
              state.isExecutingOpa = false;
              state.activeOpaExecutionId = null;
            },
            undefined,
            'computerUse/executeOpa/done',
          );
          return result;
        } catch (err) {
          if (get().activeOpaExecutionId !== executionId) return null;
          set(
            (state) => {
              state.error = String(err);
              state.isExecutingOpa = false;
              state.activeOpaExecutionId = null;
            },
            undefined,
            'computerUse/executeOpa/error',
          );
          return null;
        }
      },

      cancelOpaTask: async (requestedExecutionId) => {
        const state = get();
        if (
          pendingOpaCancellation &&
          state.cancellingOpaExecutionId !== null &&
          (requestedExecutionId === undefined ||
            requestedExecutionId === state.cancellingOpaExecutionId)
        ) {
          return pendingOpaCancellation;
        }
        const executionId = state.activeOpaExecutionId ?? state.cancellingOpaExecutionId;
        if (!executionId || (requestedExecutionId && requestedExecutionId !== executionId)) {
          return false;
        }

        if (state.activeOpaExecutionId === executionId) {
          set(
            (draft) => {
              draft.activeOpaExecutionId = null;
              draft.cancellingOpaExecutionId = executionId;
              draft.isExecutingOpa = false;
            },
            undefined,
            'computerUse/executeOpa/cancelling',
          );
        }

        const cancellation = invoke<unknown>('computer_use_cancel_opa_task', { executionId })
          .then((value) => {
            const cancelled = value === true;
            if (cancelled && get().cancellingOpaExecutionId === executionId) {
              set(
                (draft) => {
                  draft.cancellingOpaExecutionId = null;
                },
                undefined,
                'computerUse/executeOpa/cancelled',
              );
            } else if (!cancelled && get().cancellingOpaExecutionId === executionId) {
              set(
                (draft) => {
                  draft.error =
                    'Native desktop control did not acknowledge cancellation; new actions remain blocked.';
                },
                undefined,
                'computerUse/executeOpa/cancel-unacknowledged',
              );
            }
            return cancelled;
          })
          .catch((err) => {
            if (get().cancellingOpaExecutionId === executionId) {
              set(
                (draft) => {
                  draft.error = `Failed to stop desktop control: ${String(err)}`;
                },
                undefined,
                'computerUse/executeOpa/cancel-error',
              );
            }
            return false;
          })
          .finally(() => {
            if (pendingOpaCancellation === cancellation) pendingOpaCancellation = null;
          });
        pendingOpaCancellation = cancellation;
        return cancellation;
      },
    })),
    { name: 'ComputerUseStore', enabled: import.meta.env.DEV },
  ),
);

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
    listen<{ screenshot: { imageBase64: string } }>('agi:screenshot', (event) => {
      useComputerUseStore.setState({
        currentScreenshot: event.payload.screenshot.imageBase64,
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

export const selectComputerUseEnabled = (state: ComputerUseState) => state.computerUseEnabled;
export const selectConsentAccepted = (state: ComputerUseState) => state.consentAccepted;
export const selectAllowedApps = (state: ComputerUseState) => state.allowedApps;
export const selectDeniedApps = (state: ComputerUseState) => state.deniedApps;
export const selectHideAppsOnTask = (state: ComputerUseState) => state.hideAppsOnTask;

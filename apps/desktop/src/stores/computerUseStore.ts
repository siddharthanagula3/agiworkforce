import type { ToolApprovalRequest } from '@agiworkforce/types';
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

export type OpaCompletionReason =
  | { type: 'task_complete' }
  | { type: 'max_iterations_reached' }
  | { type: 'timeout' }
  | { type: 'too_many_failures'; failures: number }
  | { type: 'user_cancelled' }
  | { type: 'safety_blocked'; reason: string }
  | { type: 'not_making_progress' }
  | { type: 'confirmation_denied'; tool: string }
  | { type: 'confirmation_timed_out'; tool: string; seconds: number };

export type ExecutorTier = 'api' | 'ui' | 'browser' | 'visual';

export interface TierAssessment {
  tier: ExecutorTier;
  decline: { decline: string } & Record<string, unknown>;
}

export interface ActionRoutingRecord {
  sessionId: string;
  stepIndex: number | null;
  selected: ExecutorTier;
  driver: string;
  tool: string | null;
  declined: TierAssessment[];
}

/**
 * A step the task has stopped on. It holds until the request is answered, so
 * it outlives a blur, a re-render and a surface change; only an answer, an
 * expiry or a cancelled task clears it.
 */
export interface PausedConfirmation {
  sessionId: string;
  stepIndex: number;
  approval: ToolApprovalRequest;
}

export type ConfirmationOutcome = 'approved' | 'denied' | 'expired';

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
    case 'confirmation_denied':
      if (typeof reason['tool'] !== 'string' || reason['tool'].trim() === '') {
        throw new Error('Native desktop control returned an invalid declined tool.');
      }
      parsedReason = { type: reason['type'], tool: reason['tool'] };
      break;
    case 'confirmation_timed_out':
      if (typeof reason['tool'] !== 'string' || reason['tool'].trim() === '') {
        throw new Error('Native desktop control returned an invalid declined tool.');
      }
      if (!Number.isInteger(reason['seconds']) || Number(reason['seconds']) <= 0) {
        throw new Error('Native desktop control returned an invalid confirmation bound.');
      }
      parsedReason = {
        type: reason['type'],
        tool: reason['tool'],
        seconds: Number(reason['seconds']),
      };
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
    case 'confirmation_denied':
      return 'You declined this step, so desktop control stopped without running it.';
    case 'confirmation_timed_out':
      return `This step was not confirmed within ${reason.seconds} seconds, so desktop control stopped without running it.`;
  }
}

interface ControlStatePayload {
  taken_over: boolean;
}

interface ComputerUseState {
  isActive: boolean;
  takenOver: boolean;
  currentScreenshot: string | null;
  actionLog: DesktopComputerAction[];
  error: string | null;
  isExecutingOpa: boolean;
  activeOpaExecutionId: string | null;
  cancellingOpaExecutionId: string | null;
  lastOpaResult: OpaTaskResult | null;
  lastRouting: ActionRoutingRecord | null;
  pendingApproval: ToolApprovalRequest | null;
  pausedConfirmation: PausedConfirmation | null;
  isResolvingConfirmation: boolean;

  computerUseEnabled: boolean;
  consentAccepted: boolean;

  takeOver: () => Promise<void>;
  handBack: () => Promise<void>;
  stopComputerUse: () => Promise<void>;
  logAction: (action: DesktopComputerAction) => void;
  reset: () => void;

  setComputerUseEnabled: (enabled: boolean) => void;
  setConsentAccepted: (accepted: boolean) => void;
  revokeDesktopConsent: () => Promise<void>;
  clearPendingApproval: () => void;
  resolveConfirmation: (approved: boolean, rememberForSession?: boolean) => Promise<boolean>;

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
      takenOver: false,
      currentScreenshot: null,
      actionLog: [],
      error: null,
      isExecutingOpa: false,
      activeOpaExecutionId: null,
      cancellingOpaExecutionId: null,
      lastOpaResult: null,
      lastRouting: null,
      pendingApproval: null,
      pausedConfirmation: null,
      isResolvingConfirmation: false,

      computerUseEnabled: false,
      consentAccepted: false,

      setComputerUseEnabled: (enabled: boolean) => {
        if (!enabled) {
          void get().cancelOpaTask();
          void get().revokeDesktopConsent();
        }
        set(
          enabled
            ? { computerUseEnabled: true }
            : { computerUseEnabled: false, consentAccepted: false },
        );
      },
      setConsentAccepted: (accepted: boolean) => set({ consentAccepted: accepted }),

      clearPendingApproval: () =>
        set(
          { pendingApproval: null, pausedConfirmation: null, isResolvingConfirmation: false },
          undefined,
          'computerUse/clearPendingApproval',
        ),

      resolveConfirmation: async (approved, rememberForSession = false) => {
        const paused = get().pausedConfirmation;
        if (!paused || get().isResolvingConfirmation) return false;

        set({ isResolvingConfirmation: true }, undefined, 'computerUse/confirmation/resolving');
        try {
          await invoke('respond_tool_confirmation', {
            requestId: paused.approval.requestId,
            approved,
            rememberChoice: false,
            rememberForSession: rememberForSession && paused.approval.rememberable,
          });
          set(
            (state) => {
              state.isResolvingConfirmation = false;
              if (state.pausedConfirmation?.approval.requestId === paused.approval.requestId) {
                state.pausedConfirmation = null;
                state.pendingApproval = null;
              }
            },
            undefined,
            'computerUse/confirmation/resolved',
          );
          return true;
        } catch (error) {
          set(
            (state) => {
              state.isResolvingConfirmation = false;
              state.error = `Failed to answer the paused step: ${String(error)}`;
            },
            undefined,
            'computerUse/confirmation/error',
          );
          return false;
        }
      },

      revokeDesktopConsent: async () => {
        try {
          await invoke('computer_use_revoke_consent');
        } catch (error) {
          set(
            (state) => {
              state.error = `Failed to withdraw desktop control: ${String(error)}`;
            },
            undefined,
            'computerUse/revokeDesktopConsent/error',
          );
        }
      },

      takeOver: async () => {
        try {
          const control = await invoke<ControlStatePayload>('computer_use_take_over');
          set(
            (state) => {
              state.takenOver = control.taken_over;
              state.error = null;
            },
            undefined,
            'computerUse/takeOver',
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Screen control could not be taken over.';
          set(
            (state) => {
              state.error = message;
            },
            undefined,
            'computerUse/takeOver/error',
          );
          toast.error(message);
        }
      },

      handBack: async () => {
        try {
          const control = await invoke<ControlStatePayload>('computer_use_hand_back');
          set(
            (state) => {
              state.takenOver = control.taken_over;
            },
            undefined,
            'computerUse/handBack',
          );
        } catch (error) {
          const message =
            typeof error === 'string'
              ? error
              : error instanceof Error
                ? error.message
                : 'Screen control could not be handed back.';
          set(
            (state) => {
              state.error = message;
            },
            undefined,
            'computerUse/handBack/error',
          );
          toast.error(message);
        }
      },

      stopComputerUse: async () => {
        await get().takeOver();
        const stopped = await get().cancelOpaTask();
        if (stopped) {
          set(
            { pendingApproval: null, pausedConfirmation: null, isResolvingConfirmation: false },
            undefined,
            'computerUse/stop',
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

      reset: () => {
        void get().cancelOpaTask();
        set(
          {
            isActive: false,
            currentScreenshot: null,
            actionLog: [],
            error: null,
            isExecutingOpa: false,
            activeOpaExecutionId: null,
            lastOpaResult: null,
            lastRouting: null,
            pendingApproval: null,
            pausedConfirmation: null,
            isResolvingConfirmation: false,
          },
          undefined,
          'computerUse/reset',
        );
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
            'Cloud vision model requires a BYOK continuation, using local models in Local mode',
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

interface RoutingDecisionPayload {
  selected: ExecutorTier;
  driver: string;
  call: { tool: string; driver: string } | null;
  declined: TierAssessment[];
}

interface ConfirmationRequiredPayload {
  sessionId: string;
  stepIndex: number;
  approval: ToolApprovalRequest;
}

interface ConfirmationResolvedPayload {
  sessionId: string;
  stepIndex: number;
  outcome: ConfirmationOutcome;
}

/** Emitted by the Rust global shortcut, which has already taken the screen back. */
export const STOP_AGENTS_SHORTCUT_ACTION = 'stop_agents';

const ACTION_TYPES: Record<string, ActionType> = {
  click: 'click',
  double_click: 'double_click',
  triple_click: 'click',
  right_click: 'right_click',
  move_mouse: 'move_mouse',
  type: 'type',
  key_press: 'key_press',
  hotkey: 'key_press',
  screenshot: 'screenshot',
  scroll: 'scroll',
  zoom: 'zoom',
};

/**
 * The native loop reports a step as `{ action: { action: 'click', x, y } }`;
 * the vendor agent reports it as `{ action: 'click' }`. Anything else is not a
 * step the screen view can draw.
 */
export function parseCompletedAction(payload: unknown): DesktopComputerAction | null {
  if (!isRecord(payload)) return null;
  const raw = payload['action'];
  const step = isRecord(raw) ? raw : null;
  const name = step ? step['action'] : raw;
  if (typeof name !== 'string') return null;
  const actionType = ACTION_TYPES[name];
  if (!actionType) return null;

  const x = step?.['x'];
  const y = step?.['y'];
  const text = step?.['text'];
  const key = step?.['key'];
  return {
    action_type: actionType,
    coordinates: typeof x === 'number' && typeof y === 'number' ? [x, y] : null,
    text: typeof text === 'string' ? text : null,
    key: typeof key === 'string' ? key : null,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

async function stopFromShortcut(): Promise<void> {
  const store = useComputerUseStore.getState();
  const wasRunning = store.isExecutingOpa || store.pausedConfirmation !== null;
  await store.stopComputerUse();
  if (!useComputerUseStore.getState().takenOver) return;
  toast(wasRunning ? 'Desktop control stopped' : 'Screen control is yours', {
    description: 'Agents cannot use the pointer or keyboard until you hand control back.',
    action: {
      label: 'Hand back',
      onClick: () => void useComputerUseStore.getState().handBack(),
    },
  });
}

export function subscribeToComputerUseEvents(): () => void {
  const unlisteners: Promise<UnlistenFn>[] = [];

  unlisteners.push(
    listen<unknown>('computer_use:action_completed', (event) => {
      const action = parseCompletedAction(event.payload);
      if (action) useComputerUseStore.getState().logAction(action);
    }),
  );

  unlisteners.push(
    listen<string>('shortcut_action', (event) => {
      if (event.payload !== STOP_AGENTS_SHORTCUT_ACTION) return;
      void stopFromShortcut();
    }),
  );

  unlisteners.push(
    listen<{ screenshot: { imageBase64: string } }>('agi:screenshot', (event) => {
      useComputerUseStore.setState({
        currentScreenshot: event.payload.screenshot.imageBase64,
      });
    }),
  );

  unlisteners.push(
    listen<{ sessionId: string; stepIndex?: number | null; decision: RoutingDecisionPayload }>(
      'computer_use:action_routed',
      (event) => {
        const { sessionId, stepIndex, decision } = event.payload;
        useComputerUseStore.setState({
          lastRouting: {
            sessionId,
            stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
            selected: decision.selected,
            driver: decision.driver,
            tool: decision.call?.tool ?? null,
            declined: decision.declined,
          },
        });
      },
    ),
  );

  unlisteners.push(
    listen<ConfirmationRequiredPayload>('computer_use:confirmation_required', (event) => {
      const { sessionId, stepIndex, approval } = event.payload;
      useComputerUseStore.setState({
        pausedConfirmation: { sessionId, stepIndex, approval },
        pendingApproval: approval,
        isResolvingConfirmation: false,
      });
    }),
  );

  unlisteners.push(
    listen<ConfirmationResolvedPayload>('computer_use:confirmation_resolved', (event) => {
      const { stepIndex } = event.payload;
      useComputerUseStore.setState((state) =>
        state.pausedConfirmation?.stepIndex === stepIndex
          ? { pausedConfirmation: null, pendingApproval: null, isResolvingConfirmation: false }
          : state,
      );
    }),
  );

  unlisteners.push(
    listen<{ sessionId: string; approval: ToolApprovalRequest }>(
      'computer_use:approval_required',
      (event) => {
        useComputerUseStore.setState({ pendingApproval: event.payload.approval });
      },
    ),
  );

  unlisteners.push(
    listen('computer_use:session_started', () => {
      useComputerUseStore.setState({ isActive: true, actionLog: [] });
    }),
  );

  unlisteners.push(
    listen('computer_use:session_completed', () => {
      useComputerUseStore.setState({
        isActive: false,
        pausedConfirmation: null,
        pendingApproval: null,
        isResolvingConfirmation: false,
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

export const selectComputerUseEnabled = (state: ComputerUseState) => state.computerUseEnabled;
export const selectConsentAccepted = (state: ComputerUseState) => state.consentAccepted;

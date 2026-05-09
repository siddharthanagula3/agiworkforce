// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  CouncilResult,
  CouncilModel,
  CouncilMemberResponse,
  CouncilQueryOptions,
} from '../api/council';
import { councilQuery } from '../api/council';

export type CouncilStatus = 'idle' | 'querying' | 'done' | 'error';

export interface CouncilState {
  /** Whether the council panel is open */
  isOpen: boolean;
  /** Current query status */
  status: CouncilStatus;
  /** Active models participating in the council */
  activeModels: CouncilModel[];
  /** Latest council result */
  result: CouncilResult | null;
  /** Error message if the last query failed */
  error: string | null;
  /** History of past council results (last 10) */
  history: CouncilResult[];

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActiveModels: (models: CouncilModel[]) => void;
  startCouncil: (options: CouncilQueryOptions) => Promise<CouncilResult | null>;
  getConsensus: () => string | null;
  clearCouncil: () => void;
}

const MAX_HISTORY = 10;

export const useCouncilStore = create<CouncilState>()(
  immer((set, get) => ({
    isOpen: false,
    status: 'idle',
    activeModels: [],
    result: null,
    error: null,
    history: [],

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () =>
      set((state) => {
        state.isOpen = !state.isOpen;
      }),

    setActiveModels: (models) => set({ activeModels: models }),

    startCouncil: async (options) => {
      set({ status: 'querying', error: null, result: null });
      try {
        // Merge store-level active models if caller didn't specify
        const mergedOptions: CouncilQueryOptions = {
          ...options,
          models:
            options.models ?? (get().activeModels.length > 0 ? get().activeModels : undefined),
        };
        const councilResult = await councilQuery(mergedOptions);
        set((state) => {
          state.status = 'done';
          state.result = councilResult;
          state.error = null;
          // Prepend to history, cap at MAX_HISTORY
          state.history = [councilResult, ...state.history].slice(0, MAX_HISTORY);
        });
        return councilResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ status: 'error', error: message });
        return null;
      }
    },

    getConsensus: () => {
      const { result } = get();
      return result?.consensusSummary ?? null;
    },

    clearCouncil: () =>
      set({
        status: 'idle',
        result: null,
        error: null,
      }),
  })),
);

/** Selector: council responses from the latest result */
export const selectCouncilResponses = (state: CouncilState): CouncilMemberResponse[] =>
  state.result?.responses ?? [];

/** Selector: whether council is actively querying */
export const selectIsCouncilQuerying = (state: CouncilState): boolean =>
  state.status === 'querying';

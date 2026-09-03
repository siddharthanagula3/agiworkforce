import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface UIState {
  sidebarCollapsed: boolean;
}

export interface UIActions {
  setSidebarCollapsed: (collapsed: boolean) => void;

  reset: () => void;
}

export type UIStore = UIState & UIActions;

const INITIAL_STATE: UIState = {
  sidebarCollapsed: false,
};

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      immer((set, _get) => ({
        ...INITIAL_STATE,

        setSidebarCollapsed: (collapsed: boolean) =>
          set((state) => {
            state.sidebarCollapsed = collapsed;
          }),

        reset: () =>
          set((state) => {
            Object.assign(state, INITIAL_STATE);
          }),
      })),
      {
        name: 'agi-ui-store',
        version: 2,
        migrate: (persisted: unknown) => ({
          sidebarCollapsed:
            typeof (persisted as UIState | undefined)?.sidebarCollapsed === 'boolean'
              ? (persisted as UIState).sidebarCollapsed
              : INITIAL_STATE.sidebarCollapsed,
        }),
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      },
    ),
    {
      name: 'UI Store',
      enabled: enableDevtools,
    },
  ),
);

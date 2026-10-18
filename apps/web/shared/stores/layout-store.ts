/**
 * Sidebar collapse state for the chat shell.
 *
 * Theme, notifications and the settings modal have their own owners
 * (`ThemeContext`, `NotificationsSection`, `SettingsModalProvider`); they do
 * not belong here.
 *
 * Every member below must keep a production consumer. That is enforced by
 * `apps/web/__tests__/settings-store-fields-are-consumed.test.ts`, which reads
 * this file and fails on a member nothing references.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface UIState {
  sidebarCollapsed: boolean;

  /**
   * The AGI Work autonomy disclosure has been dismissed. Deliberately NOT in
   * `partialize` below: the disclosure names what a run may do on its own, so
   * it is owed once per session rather than silenced forever by one click.
   */
  agiWorkAutonomyNoticeDismissed: boolean;

  /**
   * The AGI Work task dock occupies the right slot. Deliberately NOT in
   * `partialize` below: the dock opens itself for each new run, so a persisted
   * "open" would reopen it over an unrelated conversation on the next load.
   */
  taskDockOpen: boolean;

  /**
   * The run whose open/closed verdict `taskDockOpen` records. A dock the user
   * closed stays closed for that run and opens again for the next one.
   */
  taskDockRunKey: string | null;
}

export interface UIActions {
  setSidebarCollapsed: (collapsed: boolean) => void;

  dismissAgiWorkAutonomyNotice: () => void;

  setTaskDockOpen: (open: boolean) => void;

  setTaskDockRunKey: (runKey: string | null) => void;

  /**
   * Sign-out cleanup verb. Invoked dynamically, `authentication-store.ts`
   * lists this module in `USER_SCOPED_STORE_MODULES` (:99) and calls the first
   * matching name in `STORE_RESET_METHODS` (:76) on every exported zustand
   * handle, so there is no literal `reset()` call site to grep for.
   */
  reset: () => void;
}

export type UIStore = UIState & UIActions;

const INITIAL_STATE: UIState = {
  sidebarCollapsed: false,
  agiWorkAutonomyNoticeDismissed: false,
  taskDockOpen: false,
  taskDockRunKey: null,
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

        dismissAgiWorkAutonomyNotice: () =>
          set((state) => {
            state.agiWorkAutonomyNoticeDismissed = true;
          }),

        setTaskDockOpen: (open: boolean) =>
          set((state) => {
            state.taskDockOpen = open;
          }),

        setTaskDockRunKey: (runKey: string | null) =>
          set((state) => {
            state.taskDockRunKey = runKey;
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
          agiWorkAutonomyNoticeDismissed: INITIAL_STATE.agiWorkAutonomyNoticeDismissed,
          taskDockOpen: INITIAL_STATE.taskDockOpen,
          taskDockRunKey: INITIAL_STATE.taskDockRunKey,
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

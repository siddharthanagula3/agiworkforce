/**
 * Sidebar collapse state for the chat shell.
 *
 * PP-24 (sibling of `web-settings-store`): this store used to declare ~20
 * further members, `sidebarOpen`, a five-key `modals` map, `theme`,
 * `chatInterface`, `dashboard` and `notifications`, with all of their setters.
 * plus six selector hooks (`useSidebar`, `useModals`, `useTheme`,
 * `useChatInterface`, `useDashboard`, `useNotifications`). Not one of them had
 * a production reader or a production writer: the only consumer of this module
 * anywhere in the app is `features/chat/pages/WebChatPage.tsx:451-452`, which
 * reads `sidebarCollapsed`/`setSidebarCollapsed` and nothing else. The rest
 * were exercised only by `layout-store.test.ts` and re-exported by
 * `shared/stores/index.ts`, a barrel no file imports.
 *
 * Three of them were also duplicates that gave a second answer to a settled
 * question: `theme` (the real one is `ThemeContext`, reached through
 * `useAppTheme`), `notifications` (the real ones are persisted server-side by
 * `NotificationsSection`), and `modals.settings` (the settings modal is owned
 * by `SettingsModalProvider`). They were persisted to localStorage under
 * `agi-ui-store`, so they looked settable and durable while changing nothing.
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
}

export interface UIActions {
  setSidebarCollapsed: (collapsed: boolean) => void;

  dismissAgiWorkAutonomyNotice: () => void;

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

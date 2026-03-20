/**
 * Hooks Store
 *
 * Manages the hooks system via Tauri commands. Hooks are event-driven scripts
 * that execute on lifecycle events (session start/end, tool use, step/goal
 * completion, approvals, etc.).
 *
 * Wires all 13 hooks_* Tauri commands to the frontend.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Hook event types (PascalCase per Rust serde). */
export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'ToolError'
  | 'StepStart'
  | 'StepCompleted'
  | 'StepError'
  | 'GoalStart'
  | 'GoalCompleted'
  | 'GoalError'
  | 'UserPromptSubmit'
  | 'ApprovalRequired'
  | 'ApprovalGranted'
  | 'ApprovalDenied';

/** Shape returned by hooks_list / hooks_add / hooks_update (Rust snake_case fields). */
export interface Hook {
  name: string;
  events: HookEventType[];
  priority: number;
  command: string;
  enabled: boolean;
  timeout_secs: number;
  env: Record<string, string>;
  working_dir: string | null;
  continue_on_error: boolean;
}

/** Hook execution stats (Rust snake_case fields). */
export interface HookStats {
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  average_execution_time_ms: number;
  last_execution: string | null;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface HooksState {
  hooks: Hook[];
  eventTypes: HookEventType[];
  configPath: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Lifecycle
  initialize: () => Promise<void>;
  reload: () => Promise<void>;

  // CRUD
  listHooks: () => Promise<Hook[]>;
  addHook: (hook: Hook) => Promise<string>;
  removeHook: (name: string) => Promise<string>;
  updateHook: (hook: Hook) => Promise<string>;
  toggleHook: (name: string, enabled: boolean) => Promise<string>;

  // Import / Export
  importHooks: (yaml: string) => Promise<string>;
  exportHooks: () => Promise<string>;

  // Metadata
  getConfigPath: () => Promise<string>;
  createExample: () => Promise<string>;
  getEventTypes: () => Promise<HookEventType[]>;
  getStats: (name: string) => Promise<HookStats | null>;
}

export const useHooksStore = create<HooksState>()(
  devtools(
    (set, get) => ({
      hooks: [],
      eventTypes: [],
      configPath: null,
      isInitialized: false,
      isLoading: false,
      error: null,

      // ── Lifecycle ──────────────────────────────────────────────────────

      initialize: async () => {
        if (get().isInitialized) return;
        set({ isLoading: true, error: null });
        try {
          await invoke<string>('hooks_initialize');
          set({ isInitialized: true });
          // Fetch hooks and event types after initialization
          await get().listHooks();
          await get().getEventTypes();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to initialize hooks' });
        } finally {
          set({ isLoading: false });
        }
      },

      reload: async () => {
        set({ isLoading: true, error: null });
        try {
          await invoke<string>('hooks_reload');
          await get().listHooks();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to reload hooks' });
        } finally {
          set({ isLoading: false });
        }
      },

      // ── CRUD ───────────────────────────────────────────────────────────

      listHooks: async () => {
        try {
          const hooks = await invoke<Hook[]>('hooks_list');
          set({ hooks });
          return hooks;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to list hooks' });
          return [];
        }
      },

      addHook: async (hook) => {
        try {
          const result = await invoke<string>('hooks_add', { hook });
          await get().listHooks();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to add hook';
          set({ error: message });
          throw err;
        }
      },

      removeHook: async (name) => {
        try {
          const result = await invoke<string>('hooks_remove', { name });
          await get().listHooks();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to remove hook';
          set({ error: message });
          throw err;
        }
      },

      updateHook: async (hook) => {
        try {
          const result = await invoke<string>('hooks_update', { hook });
          await get().listHooks();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to update hook';
          set({ error: message });
          throw err;
        }
      },

      toggleHook: async (name, enabled) => {
        try {
          const result = await invoke<string>('hooks_toggle', { name, enabled });
          await get().listHooks();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to toggle hook';
          set({ error: message });
          throw err;
        }
      },

      // ── Import / Export ────────────────────────────────────────────────

      importHooks: async (yaml) => {
        try {
          const result = await invoke<string>('hooks_import', { yaml });
          await get().listHooks();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to import hooks';
          set({ error: message });
          throw err;
        }
      },

      exportHooks: async () => {
        try {
          return await invoke<string>('hooks_export');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to export hooks';
          set({ error: message });
          throw err;
        }
      },

      // ── Metadata ───────────────────────────────────────────────────────

      getConfigPath: async () => {
        try {
          const path = await invoke<string>('hooks_get_config_path');
          set({ configPath: path });
          return path;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to get config path';
          set({ error: message });
          throw err;
        }
      },

      createExample: async () => {
        try {
          return await invoke<string>('hooks_create_example');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create example';
          set({ error: message });
          throw err;
        }
      },

      getEventTypes: async () => {
        try {
          const types = await invoke<HookEventType[]>('hooks_get_event_types');
          set({ eventTypes: types });
          return types;
        } catch {
          return [];
        }
      },

      getStats: async (name) => {
        try {
          return await invoke<HookStats | null>('hooks_get_stats', { name });
        } catch {
          return null;
        }
      },
    }),
    { name: 'hooks' },
  ),
);

/**
 * MCPAppRegistry
 *
 * Zustand-backed registry for MCP App definitions declared by tools.
 * Tools that want to render interactive UIs (charts, dashboards, forms)
 * register an McpAppDefinition here; the MCPAppRenderer then picks it up
 * from the chat stream.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a single built-in component slot in the MCP App.
 * Multiple components can be stacked vertically inside one app definition.
 */
export interface McpAppComponent {
  /** Component type — maps to BUILTIN_COMPONENTS in MCPAppComponents.tsx */
  type: 'chart' | 'table' | 'form' | 'markdown' | 'code';
  /** Component-specific configuration (chart series, form fields, …) */
  config: Record<string, unknown>;
}

/**
 * Full definition of an MCP App — declared by an MCP tool and registered
 * into the store so the renderer can look it up.
 */
export interface McpAppDefinition {
  /** Stable, unique identifier — e.g. "my-server::dashboard" */
  id: string;
  /** Human-readable label shown in the iframe header bar */
  name: string;
  /** Optional description surfaced in tool-browser and registry views */
  description?: string;
  /** Server that owns this app */
  server: string;
  /** Ordered list of component slots to render */
  components: McpAppComponent[];
  /** Minimum height (px) hint; the renderer may grow beyond this */
  minHeight?: number;
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

interface MCPAppRegistryState {
  /** All registered app definitions, keyed by app id */
  apps: Map<string, McpAppDefinition>;

  /**
   * Register or update an app definition.
   * Calling register() with an existing id overwrites the previous entry.
   */
  register: (app: McpAppDefinition) => void;

  /** Remove an app definition by id. No-op if the id is unknown. */
  unregister: (id: string) => void;

  /** Look up an app definition by id. Returns undefined if not found. */
  getApp: (id: string) => McpAppDefinition | undefined;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useMcpAppRegistry = create<MCPAppRegistryState>()(
  devtools(
    (set, get) => ({
      apps: new Map<string, McpAppDefinition>(),

      register: (app: McpAppDefinition) => {
        set(
          (state) => {
            const next = new Map(state.apps);
            next.set(app.id, app);
            return { apps: next };
          },
          false,
          'mcpAppRegistry/register',
        );
      },

      unregister: (id: string) => {
        set(
          (state) => {
            const next = new Map(state.apps);
            next.delete(id);
            return { apps: next };
          },
          false,
          'mcpAppRegistry/unregister',
        );
      },

      getApp: (id: string) => {
        return get().apps.get(id);
      },
    }),
    { name: 'MCPAppRegistry' },
  ),
);

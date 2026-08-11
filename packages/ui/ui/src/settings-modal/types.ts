/**
 * Shared types for the SettingsModal shell.
 * Pure TS: no React, no IO. Consumed by web and desktop surfaces.
 */

import type { SettingsNavKey } from '../settings-nav';

// ─── Section identity ─────────────────────────────────────────────────────────

/**
 * All sections the modal can display.
 * Web uses: general, account, privacy, billing, usage, capabilities,
 *           connectors, skills, plugins.
 * Desktop may add / omit sections via the activeKeys prop.
 */
export type SettingsSectionKey = SettingsNavKey | 'billing' | 'usage' | 'capabilities';

// ─── Connector contract (minimal shape needed by the shared shell) ─────────────

export interface SettingsConnector {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  actionCount: number;
  phase: number;
  /** Tailwind theme classes for the fallback tile. */
  iconBg: string;
  /** 1-2 char fallback text */
  iconText: string;
  exclusive?: boolean;
  /**
   * Whether THIS surface can actually complete a connect flow for the
   * connector. When false (or when the adapter has no connectConnector), the
   * connectors table renders `statusLabel` instead of a Connect button —
   * honesty rule: never show a Connect button that is known to fail.
   */
  canConnect?: boolean;
  /**
   * Muted status text for unconnected connectors whose connect flow is not
   * available on this surface (e.g. "Coming soon", "Not yet available on web").
   * Falls back to "Not connected" when omitted.
   */
  statusLabel?: string;
}

export interface ConnectedConnector {
  connectorId: string;
  connectedAt?: string;
  /**
   * Optional real health state for a connected connector. Only supply when a
   * genuine signal exists (e.g. an expired token detected server-side); the
   * table renders an amber warning for 'warning'. No signal = 'connected'.
   */
  status?: 'connected' | 'warning';
  /** Short label shown with the amber warning state (e.g. "Reconnect"). */
  warningLabel?: string;
}

// ─── Skill / Plugin contract ──────────────────────────────────────────────────

export interface SettingsSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  tab: 'prompts' | 'agents';
  /** Honest catalog lifecycle. Draft entries are visible but not executable. */
  statusLabel?: string;
  /** Authenticated first-party source download. Absence means no download is offered. */
  downloadHref?: string;
}

export interface SettingsPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Whether this user has durably installed the plugin. */
  installed?: boolean;
  /** Whether this surface has a real install path for the catalog entry. */
  installable?: boolean;
  /** One mutation is in flight for this plugin. */
  mutating?: boolean;
  /** Row-scoped mutation failure. */
  error?: string;
  /** Vendor/org name. Optional — only render when real data exists. */
  author?: string;
  /** Count of skills bundled by the plugin. Optional — real data only. */
  skillCount?: number;
  /** ISO timestamp of the plugin's last update. Optional — real data only. */
  updatedAt?: string;
  /** Honest catalogue status when an entry is discoverable but not installed. */
  statusLabel?: string;
  /** Optional surface-owned details route. Does not imply installability. */
  detailsHref?: string;
}

// ─── Custom connector input ───────────────────────────────────────────────────

/** Payload from the "Add custom connector" form (remote MCP server). */
export interface CustomConnectorInput {
  name: string;
  /** Remote MCP server URL. */
  url: string;
  /**
   * Optional bearer token forwarded only to surfaces that explicitly
   * advertise `customConnectorAuthTokenSupported`.
   */
  authToken?: string;
}

// ─── Data adapter interface (injected per surface) ────────────────────────────

/**
 * Surface-specific data adapter passed to SettingsModal.
 * Web supplies a next-router + fetch-backed implementation.
 * Desktop supplies a Tauri IPC-backed implementation.
 *
 * All callbacks are optional; missing ones silently no-op in the shared shell.
 */
export interface SettingsDataAdapter {
  /** Connector catalog (static list to display) */
  connectors?: SettingsConnector[];
  /** True while the surface is loading its authoritative connector catalog. */
  connectorsLoading?: boolean;
  /** Visible catalog-level failure. Per-connector mutation failures remain row-scoped. */
  connectorsError?: string | null;
  retryConnectors?: () => Promise<void> | void;
  /** Currently connected connector IDs + timestamps */
  connectedConnectors?: ConnectedConnector[];
  connectConnector?: (id: string) => Promise<void> | void;
  disconnectConnector?: (id: string) => Promise<void> | void;
  /**
   * Persist a user-supplied custom remote-MCP connector. Surfaces without
   * real persistence must throw an honest "not yet supported" Error (the
   * form surfaces the message) rather than faking success.
   */
  addCustomConnector?: (input: CustomConnectorInput) => Promise<void> | void;
  /**
   * Whether the surface can encrypt and persist a bearer token for a custom
   * remote MCP connector. The shared form hides the credential field unless
   * this is true, so native adapters cannot silently discard a secret.
   */
  customConnectorAuthTokenSupported?: boolean;
  /**
   * Surface-owned navigation for docs/catalog links. Native shells provide
   * this so a relative anchor never replaces the application webview.
   */
  openHref?: (href: string) => Promise<void> | void;

  skills?: SettingsSkill[];
  skillsLoading?: boolean;
  skillsError?: string | null;
  retrySkills?: () => Promise<void> | void;

  plugins?: SettingsPlugin[];
  pluginsLoading?: boolean;
  pluginsError?: string | null;
  retryPlugins?: () => Promise<void> | void;
  /** Discoverable plugins, kept separate from the installed `plugins` list. */
  pluginCatalog?: SettingsPlugin[];
  installPlugin?: (id: string) => Promise<void> | void;
  setPluginEnabled?: (id: string, enabled: boolean) => Promise<void> | void;
  removePlugin?: (id: string) => Promise<void> | void;
  /**
   * Plugin "Add" capabilities. Each item in the Plugins pane's Add dropdown
   * renders ONLY when its callback is supplied (surfaces without a real
   * marketplace/upload flow supply none, and the dropdown is omitted
   * entirely — no stubbed dead items).
   */
  onAddPluginMarketplace?: () => void;
  onUploadPlugin?: () => void;
}

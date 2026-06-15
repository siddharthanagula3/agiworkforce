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
  /** Tailwind gradient classes for the fallback tile: "from-red-500 to-red-600" */
  iconBg: string;
  /** 1-2 char fallback text */
  iconText: string;
  exclusive?: boolean;
}

export interface ConnectedConnector {
  connectorId: string;
  connectedAt?: string;
}

// ─── Skill / Plugin contract ──────────────────────────────────────────────────

export interface SettingsSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  tab: 'prompts' | 'agents';
}

export interface SettingsPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
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
  /** Currently connected connector IDs + timestamps */
  connectedConnectors?: ConnectedConnector[];
  connectConnector?: (id: string) => Promise<void> | void;
  disconnectConnector?: (id: string) => Promise<void> | void;

  skills?: SettingsSkill[];
  skillsLoading?: boolean;

  plugins?: SettingsPlugin[];
  pluginsLoading?: boolean;
}

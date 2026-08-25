import type { SettingsNavKey } from '../settings-nav';

export type SettingsSectionKey = SettingsNavKey | 'billing' | 'usage' | 'capabilities';

export interface SettingsConnector {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  actionCount: number;
  phase: number;
  iconBg: string;
  iconText: string;
  exclusive?: boolean;
  canConnect?: boolean;
  statusLabel?: string;
}

export interface ConnectedConnector {
  connectorId: string;
  connectedAt?: string;
  status?: 'connected' | 'warning';
  warningLabel?: string;
}

export interface SettingsSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  tab: 'prompts' | 'agents';
  statusLabel?: string;
  downloadHref?: string;
  /** From the skill's own SKILL.md frontmatter; absent renders as a dash. */
  version?: string;
}

export interface SettingsPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  installed?: boolean;
  installable?: boolean;
  mutating?: boolean;
  error?: string;
  author?: string;
  skillCount?: number;
  declaredSkills?: string[];
  requiredConnectors?: string[];
  updatedAt?: string;
  statusLabel?: string;
  detailsHref?: string;
}

export interface CustomConnectorInput {
  name: string;
  url: string;
  authToken?: string;
}

export interface SettingsDataAdapter {
  connectors?: SettingsConnector[];
  connectorsLoading?: boolean;
  connectorsError?: string | null;
  /**
   * A scoped, non-blocking notice for the connectors panel — e.g. one data
   * source behind the connector list (GitHub App installations) failed to
   * load while the rest loaded fine. Unlike `connectorsError`, this never
   * replaces the connector table; it renders alongside it.
   */
  connectorsNotice?: string | null;
  retryConnectors?: () => Promise<void> | void;
  connectedConnectors?: ConnectedConnector[];
  connectConnector?: (id: string) => Promise<void> | void;
  disconnectConnector?: (id: string) => Promise<void> | void;
  addCustomConnector?: (input: CustomConnectorInput) => Promise<void> | void;
  customConnectorAuthTokenSupported?: boolean;
  openHref?: (href: string) => Promise<void> | void;

  skills?: SettingsSkill[];
  skillsLoading?: boolean;
  skillsError?: string | null;
  retrySkills?: () => Promise<void> | void;

  plugins?: SettingsPlugin[];
  pluginsLoading?: boolean;
  pluginsError?: string | null;
  retryPlugins?: () => Promise<void> | void;
  pluginCatalog?: SettingsPlugin[];
  installPlugin?: (id: string) => Promise<void> | void;
  setPluginEnabled?: (id: string, enabled: boolean) => Promise<void> | void;
  removePlugin?: (id: string) => Promise<void> | void;
  onAddPluginMarketplace?: () => void;
  onUploadPlugin?: () => void;
}

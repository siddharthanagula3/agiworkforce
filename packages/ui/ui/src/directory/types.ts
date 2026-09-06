import type { ReactNode } from 'react';

export type DirectorySectionKey = 'skills' | 'connectors' | 'plugins';

export type DirectoryBadgeKind = 'first-party' | 'official' | 'verified' | 'community' | 'custom';

export type DirectorySortKey = 'popular' | 'installs' | 'updated' | 'name';

export type DirectoryConnectableMode =
  | 'connect'
  | 'api-key-form'
  | 'desktop-and-cli'
  | 'needs-setup';

export interface DirectoryToggle {
  id: string;
  label: string;
}

export interface DirectoryQuery {
  search: string;
  sourceId: string | null;
  selection: DirectoryFilterSelection;
  sort: DirectorySortKey;
  toggles: Readonly<Record<string, boolean>>;
}

export interface DirectoryFilterOption {
  value: string;
  label: string;
}

export interface DirectoryFilterGroup {
  id: string;
  label: string;
  options: DirectoryFilterOption[];
  exclusive?: boolean;
}

export type DirectoryFilterSelection = Readonly<Record<string, readonly string[]>>;

export interface DirectorySourceChip {
  id: string;
  label: string;
  heading?: string;
  removable?: boolean;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  slashName?: boolean;
  publisher?: string;
  description: string;
  brandId?: string;
  iconUrl?: string | null;
  monogram?: string;
  badges?: readonly DirectoryBadgeKind[];
  isNew?: boolean;
  installCount?: number;
  installed?: boolean;
  popular?: boolean;
  sourceId?: string;
  groupId?: string;
  updatedAt?: string;
  facets?: Readonly<Record<string, readonly string[]>>;
  installable?: boolean;
  editable?: boolean;
  connectableMode?: DirectoryConnectableMode;
  statusLabel?: string;
  installNotice?: string;
  mutating?: boolean;
  error?: string;
}

export interface DirectoryGroup {
  id: string;
  heading: string;
}

export interface DirectorySection {
  entries: readonly DirectoryEntry[];
  groups?: readonly DirectoryGroup[];
  installable?: boolean;
  loading?: boolean;
  error?: string | null;
  notice?: string | null;
  createLabel?: string;
  sources?: readonly DirectorySourceChip[];
  sourcesHeading?: string;
  filterGroups?: readonly DirectoryFilterGroup[];
  sortOptions?: readonly DirectorySortKey[];
  retry?: () => Promise<void> | void;
  noticeRetry?: () => Promise<void> | void;
  remote?: boolean;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  countLabel?: string;
  catalogHeading?: string;
  toggles?: readonly DirectoryToggle[];
  toggleDefaults?: Readonly<Record<string, boolean>>;
}

export interface DirectoryDetailFile {
  path: string;
  content?: string;
  previewable?: boolean;
  downloadHref?: string;
}

export interface DirectorySkillDetail {
  kind: 'skill';
  id: string;
  name: string;
  publisher?: string;
  description: string;
  license?: string;
  files: readonly DirectoryDetailFile[];
  readFile?: (path: string) => Promise<string>;
  editable?: boolean;
  installed?: boolean;
  href?: string;
}

export interface DirectoryConnectorDetail {
  kind: 'connector';
  id: string;
  name: string;
  summary: string;
  description?: string;
  badge?: DirectoryBadgeKind;
  brandId?: string;
  iconUrl?: string | null;
  monogram?: string;
  tools?: readonly string[];
  categories?: readonly string[];
  permissions?: readonly string[];
  publisher?: string;
  publisherUrl?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
  connectorUrl?: string | null;
  documentationUrl?: string | null;
  websiteUrl?: string | null;
  supportUrl?: string | null;
  privacyPolicyUrl?: string | null;
  repositoryUrl?: string | null;
  signInRequired?: boolean;
  addedAt?: string;
  listingNote?: string;
  related?: readonly DirectoryEntry[];
  termsHref?: string;
  connected?: boolean;
  connectable?: boolean;
  connectableMode?: DirectoryConnectableMode;
  setupNotice?: string;
  desktopHref?: string;
}

export interface DirectoryPluginMcpServer {
  name: string;
  transport: string;
}

export interface DirectoryPluginComponents {
  skills: readonly string[];
  commands: number;
  agents: number;
  hooks: boolean;
  mcpServers: readonly DirectoryPluginMcpServer[];
  lspServers: readonly string[];
}

export interface DirectoryPluginDetail {
  kind: 'plugin';
  id: string;
  name: string;
  publisher?: string;
  description: string;
  verified?: boolean;
  installCount?: number;
  version?: string;
  examplePrompts: readonly string[];
  components?: DirectoryPluginComponents;
  installCommand?: string | null;
  runtimeNote?: string | null;
  homepageUrl?: string | null;
  repositoryUrl?: string | null;
  marketplaceName?: string | null;
  marketplaceUrl?: string | null;
  worksWith?: readonly string[];
  installed?: boolean;
  installable?: boolean;
  availabilityNote?: string;
  href?: string;
}

export type DirectoryDetail =
  | DirectorySkillDetail
  | DirectoryConnectorDetail
  | DirectoryPluginDetail;

export interface DirectoryMarketplaceInput {
  repositoryUrl: string;
  ref?: string;
}

export interface DirectoryMarketplaceEntry {
  id: string;
  name: string;
  description: string;
}

export interface DirectoryMarketplaceResult {
  id: string;
  name: string;
  entries: readonly DirectoryMarketplaceEntry[];
}

export interface DirectoryAdapter {
  sections: readonly DirectorySectionKey[];
  skills?: DirectorySection;
  connectors?: DirectorySection;
  plugins?: DirectorySection;
  loadSection?: (section: DirectorySectionKey) => Promise<void> | void;
  queryEntries?: (section: DirectorySectionKey, query: DirectoryQuery) => Promise<void> | void;
  loadMore?: (section: DirectorySectionKey) => Promise<void> | void;
  loadDetail?: (section: DirectorySectionKey, id: string) => Promise<DirectoryDetail | null>;
  install?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  uninstall?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  openSettings?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  createEntry?: (section: DirectorySectionKey) => void;
  renderDetailFooter?: (
    section: DirectorySectionKey,
    id: string,
    detail: DirectoryDetail,
  ) => ReactNode;
  requestCredentials?: (section: DirectorySectionKey, id: string) => void;
  renderCredentialForm?: (section: DirectorySectionKey, id: string) => ReactNode;
  copyLink?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  openHref?: (href: string) => Promise<void> | void;
  copyValue?: (value: string) => Promise<void> | void;
  downloadSkillFile?: (skillId: string, path: string) => Promise<void> | void;
  addMarketplace?: (input: DirectoryMarketplaceInput) => Promise<DirectoryMarketplaceResult>;
  removeMarketplace?: (id: string) => Promise<void>;
  browseMarketplaceSources?: () => Promise<void> | void;
}

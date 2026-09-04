export type DirectorySectionKey = 'skills' | 'connectors' | 'plugins';

export type DirectoryBadgeKind = 'agi' | 'partner' | 'verified' | 'community' | 'yours';

export type DirectorySortKey = 'popular' | 'updated' | 'name';

export interface DirectoryFilterOption {
  value: string;
  label: string;
}

export interface DirectoryFilterGroup {
  id: string;
  label: string;
  options: DirectoryFilterOption[];
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
  iconUrl?: string | null;
  monogram?: string;
  badges?: readonly DirectoryBadgeKind[];
  isNew?: boolean;
  installCount?: number;
  installed?: boolean;
  popular?: boolean;
  sourceId?: string;
  updatedAt?: string;
  facets?: Readonly<Record<string, readonly string[]>>;
  mutating?: boolean;
  error?: string;
}

export interface DirectorySection {
  entries: readonly DirectoryEntry[];
  installable?: boolean;
  loading?: boolean;
  error?: string | null;
  notice?: string | null;
  sources?: readonly DirectorySourceChip[];
  sourcesHeading?: string;
  filterGroups?: readonly DirectoryFilterGroup[];
  sortOptions?: readonly DirectorySortKey[];
  retry?: () => Promise<void> | void;
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
  supportUrl?: string | null;
  privacyPolicyUrl?: string | null;
  connected?: boolean;
  connectable?: boolean;
}

export interface DirectoryPluginDetail {
  kind: 'plugin';
  id: string;
  name: string;
  publisher?: string;
  description: string;
  sourceUrl?: string | null;
  examplePrompts: readonly string[];
  installed?: boolean;
  installable?: boolean;
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
  loadDetail?: (section: DirectorySectionKey, id: string) => Promise<DirectoryDetail | null>;
  install?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  uninstall?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  openSettings?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  copyLink?: (section: DirectorySectionKey, id: string) => Promise<void> | void;
  openHref?: (href: string) => Promise<void> | void;
  copyValue?: (value: string) => Promise<void> | void;
  downloadSkillFile?: (skillId: string, path: string) => Promise<void> | void;
  addMarketplace?: (input: DirectoryMarketplaceInput) => Promise<DirectoryMarketplaceResult>;
  removeMarketplace?: (id: string) => Promise<void>;
  browseMarketplaceSources?: () => Promise<void> | void;
}

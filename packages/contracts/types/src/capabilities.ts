import type { SourceSurface, SyncedAppSurface } from './suite-contracts';

export type PlatformCapability =
  | 'canChat'
  | 'canUseImages'
  | 'canUploadFiles'
  | 'canUseVoice'
  | 'canUseMarketplace'
  | 'canUseBilling'
  | 'canUseCloudModels'
  | 'canUseCloudExecution'
  // ── Web + Desktop (cloud tools) ─────────────────────────────────────────────
  | 'canUseWebSearch'
  | 'canUseDeepResearch'
  | 'canUseConnectors'
  | 'canUsePlugins'
  | 'canUseSkills'
  // ── Desktop-only (local machine) ────────────────────────────────────────────
  | 'canUseWorkingDirectory'
  | 'canUseFileSystem'
  | 'canRunLocalCode'
  | 'canUseTerminal'
  | 'canUseLocalDatabase'
  | 'canTakeScreenshot'
  | 'canUseClipboard'
  | 'canUseBrowserAutomation'
  | 'canUseDesktopAutomation'
  | 'canUseLocalMcp'
  | 'canUseLocalModels'
  | 'canUseNativeIntegrations'
  // ── Mobile-only (device) ────────────────────────────────────────────────────
  | 'canUseCamera'
  | 'canUsePhotos'
  | 'canUseNotifications';

type CapabilityRow = Readonly<Record<PlatformCapability, boolean>>;

const WEB: CapabilityRow = {
  canChat: true,
  canUseImages: true,
  canUploadFiles: true,
  canUseVoice: true,
  canUseMarketplace: true,
  canUseBilling: true,
  canUseCloudModels: true,
  canUseCloudExecution: true,
  canUseWebSearch: true,
  canUseDeepResearch: true,
  canUseConnectors: true,
  canUsePlugins: true,
  canUseSkills: true,
  canUseWorkingDirectory: false,
  canUseFileSystem: false,
  canRunLocalCode: false,
  canUseTerminal: false,
  canUseLocalDatabase: false,
  canTakeScreenshot: false,
  canUseClipboard: false,
  canUseBrowserAutomation: false,
  canUseDesktopAutomation: false,
  canUseLocalMcp: false,
  canUseLocalModels: false,
  canUseNativeIntegrations: false,
  canUseCamera: false,
  canUsePhotos: false,
  canUseNotifications: false, // SPEC-SILENT for web; web push not shipped — false matches current
};

const DESKTOP: CapabilityRow = {
  canChat: true,
  canUseImages: true,
  canUploadFiles: true,
  canUseVoice: true,
  canUseMarketplace: true,
  canUseBilling: true,
  canUseCloudModels: true,
  canUseCloudExecution: true,
  canUseWebSearch: true,
  canUseDeepResearch: true,
  canUseConnectors: true,
  canUsePlugins: true,
  canUseSkills: true,
  canUseWorkingDirectory: true,
  canUseFileSystem: true,
  canRunLocalCode: true,
  canUseTerminal: true,
  canUseLocalDatabase: true,
  canTakeScreenshot: true,
  canUseClipboard: true,
  canUseBrowserAutomation: true,
  canUseDesktopAutomation: true,
  canUseLocalMcp: true,
  canUseLocalModels: true,
  canUseNativeIntegrations: true,
  canUseCamera: false,
  canUsePhotos: false,
  canUseNotifications: true, // desktop has native notifications
};

const MOBILE: CapabilityRow = {
  canChat: true,
  canUseImages: true,
  canUploadFiles: true, // "File picker"
  canUseVoice: true,
  canUseMarketplace: true,
  canUseBilling: true,
  canUseCloudModels: true,
  canUseCloudExecution: true,
  canUseWebSearch: true,
  canUseDeepResearch: true,
  canUseConnectors: true,
  canUsePlugins: false, // SPEC-SILENT · current: not surfaced in mobile composer
  canUseSkills: false, // SPEC-SILENT · current: not surfaced in mobile composer
  canUseWorkingDirectory: false,
  canUseFileSystem: false,
  canRunLocalCode: false,
  canUseTerminal: false,
  canUseLocalDatabase: false,
  canTakeScreenshot: false,
  canUseClipboard: false,
  canUseBrowserAutomation: false,
  canUseDesktopAutomation: false,
  canUseLocalMcp: false,
  canUseLocalModels: false,
  canUseNativeIntegrations: false,
  canUseCamera: true,
  canUsePhotos: true,
  canUseNotifications: true,
};

export const PLATFORM_CAPABILITIES: Readonly<Record<SyncedAppSurface, CapabilityRow>> =
  Object.freeze({
    web: WEB,
    desktop: DESKTOP,
    mobile: MOBILE,
  });

export function isCapabilityEnabled(
  platform: SyncedAppSurface,
  capability: PlatformCapability,
): boolean {
  return PLATFORM_CAPABILITIES[platform]?.[capability] ?? false;
}

export function getPlatformCapabilities(platform: SyncedAppSurface): CapabilityRow {
  return PLATFORM_CAPABILITIES[platform] ?? WEB;
}

export const ALL_PLATFORM_CAPABILITIES = Object.keys(WEB) as readonly PlatformCapability[];

export type CapabilityDomain =
  | 'core'
  | 'media'
  | 'input'
  | 'execution'
  | 'filesystem'
  | 'automation'
  | 'models'
  | 'networking'
  | 'developer'
  | 'commerce'
  | 'system';

export interface CapabilityPermissions {
  requiresConfirmation?: boolean;
  destructive?: boolean;
  dangerous?: boolean;
  backgroundExecution?: boolean;
  longRunning?: boolean;
}

export interface CapabilityMetadata {
  domain: CapabilityDomain;
  permissions?: CapabilityPermissions;
}

export const CAPABILITY_METADATA: Readonly<Record<PlatformCapability, CapabilityMetadata>> =
  Object.freeze({
    canChat: { domain: 'core' },
    canUploadFiles: { domain: 'core' },
    canUseImages: { domain: 'media' },
    canUseVoice: { domain: 'input' },
    canUseCamera: { domain: 'input' },
    canUsePhotos: { domain: 'input' },
    canUseClipboard: { domain: 'input' },
    canTakeScreenshot: { domain: 'input', permissions: { requiresConfirmation: true } },
    canUseNotifications: { domain: 'system' },
    canUseNativeIntegrations: { domain: 'system' },
    canUseMarketplace: { domain: 'commerce' },
    canUseBilling: { domain: 'commerce' },
    canUseCloudModels: { domain: 'models' },
    canUseLocalModels: { domain: 'models' },
    canUseCloudExecution: { domain: 'execution' },
    canRunLocalCode: {
      domain: 'execution',
      permissions: { dangerous: true, requiresConfirmation: true },
    },
    canUseWorkingDirectory: { domain: 'filesystem', permissions: { requiresConfirmation: true } },
    canUseFileSystem: {
      domain: 'filesystem',
      permissions: { requiresConfirmation: true, destructive: true },
    },
    canUseBrowserAutomation: {
      domain: 'automation',
      permissions: { dangerous: true, requiresConfirmation: true, longRunning: true },
    },
    canUseDesktopAutomation: {
      domain: 'automation',
      permissions: { dangerous: true, requiresConfirmation: true },
    },
    canUseWebSearch: { domain: 'networking' },
    canUseDeepResearch: {
      domain: 'networking',
      permissions: { longRunning: true, backgroundExecution: true },
    },
    canUseConnectors: { domain: 'networking' },
    canUseTerminal: {
      domain: 'developer',
      permissions: { dangerous: true, destructive: true, requiresConfirmation: true },
    },
    canUseLocalDatabase: {
      domain: 'developer',
      permissions: { dangerous: true, destructive: true, requiresConfirmation: true },
    },
    canUseLocalMcp: { domain: 'developer' },
    canUsePlugins: { domain: 'developer' },
    canUseSkills: { domain: 'developer' },
  });

export function getCapabilityMetadata(capability: PlatformCapability): CapabilityMetadata {
  return CAPABILITY_METADATA[capability];
}

export function getCapabilitiesByDomain(domain: CapabilityDomain): PlatformCapability[] {
  return ALL_PLATFORM_CAPABILITIES.filter((cap) => CAPABILITY_METADATA[cap].domain === domain);
}

export function capabilityRequiresConfirmation(capability: PlatformCapability): boolean {
  return CAPABILITY_METADATA[capability].permissions?.requiresConfirmation ?? false;
}

export type DiscoverableSurfaceCapability = 'managed-plugins' | 'browser-control' | 'computer-use';

export interface SurfaceCapabilityAvailabilityDescriptor {
  label: string;
  description: string;
  availability: Readonly<Record<SourceSurface, boolean>>;
}

export interface SurfaceCapabilityAvailabilityPresentation {
  id: DiscoverableSurfaceCapability;
  label: string;
  description: string;
  available: boolean;
  statusLabel: 'Available' | 'Unavailable in this context';
  availableSurfaceLabels: readonly string[];
  tooltip: string;
}

const SOURCE_SURFACE_AVAILABILITY_LABELS: Readonly<Record<SourceSurface, string>> = Object.freeze({
  web: 'Web',
  desktop: 'Desktop app',
  mobile: 'Mobile app',
  cli: 'AGI CLI',
  vscode: 'VS Code extension',
  chrome: 'Chrome extension',
});

export const DISCOVERABLE_SURFACE_CAPABILITIES: Readonly<
  Record<DiscoverableSurfaceCapability, SurfaceCapabilityAvailabilityDescriptor>
> = Object.freeze({
  'managed-plugins': {
    label: 'Managed Cloud plugins',
    description: 'Install account-scoped tools from the Cloud directory.',
    availability: Object.freeze({
      web: isCapabilityEnabled('web', 'canUsePlugins'),
      desktop: isCapabilityEnabled('desktop', 'canUsePlugins'),
      mobile: isCapabilityEnabled('mobile', 'canUsePlugins'),
      cli: false,
      vscode: false,
      chrome: false,
    }),
  },
  'browser-control': {
    label: 'Browser control',
    description: 'Inspect and operate live browser tabs with explicit permission.',
    availability: Object.freeze({
      web: false,
      desktop: isCapabilityEnabled('desktop', 'canUseBrowserAutomation'),
      mobile: false,
      cli: false,
      vscode: false,
      chrome: true,
    }),
  },
  'computer-use': {
    label: 'Computer use',
    description: 'Operate browser pages with screenshot-guided actions and confirmations.',
    availability: Object.freeze({
      web: false,
      desktop: isCapabilityEnabled('desktop', 'canUseDesktopAutomation'),
      mobile: false,
      cli: false,
      vscode: false,
      chrome: true,
    }),
  },
});

export const ALL_DISCOVERABLE_SURFACE_CAPABILITIES = Object.freeze(
  Object.keys(DISCOVERABLE_SURFACE_CAPABILITIES) as DiscoverableSurfaceCapability[],
);

function formatSurfaceList(labels: readonly string[]): string {
  if (labels.length === 0) return 'No product surface';
  if (labels.length === 1) return labels[0] ?? 'No product surface';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function getSurfaceCapabilityAvailability(
  capability: DiscoverableSurfaceCapability,
  surface: SourceSurface,
): SurfaceCapabilityAvailabilityPresentation {
  const descriptor = DISCOVERABLE_SURFACE_CAPABILITIES[capability];
  const availableSurfaceLabels = (Object.keys(descriptor.availability) as SourceSurface[]).flatMap(
    (candidate) =>
      descriptor.availability[candidate] ? [SOURCE_SURFACE_AVAILABILITY_LABELS[candidate]] : [],
  );
  const available = descriptor.availability[surface];
  const availabilitySummary = formatSurfaceList(availableSurfaceLabels);

  return {
    id: capability,
    label: descriptor.label,
    description: descriptor.description,
    available,
    statusLabel: available ? 'Available' : 'Unavailable in this context',
    availableSurfaceLabels,
    tooltip: available
      ? `Available in ${SOURCE_SURFACE_AVAILABILITY_LABELS[surface]}.`
      : `Available in ${availabilitySummary}.`,
  };
}

/**
 * Platform capability matrix — the SINGLE SOURCE OF TRUTH for which user-facing
 * capabilities each app SURFACE (web / desktop / mobile) exposes.
 *
 * This is the PLATFORM axis ONLY. It is deliberately orthogonal to:
 *   - MODEL capabilities  (does the *selected model* support vision / code-exec /
 *     web-search) — see `model-catalog` (`codeExecution`, `vision`, ...).
 *   - MODEL-ENVIRONMENT availability (is the E2B / local-runtime environment
 *     configured) — see `evaluateModelEnvironment`.
 *   - FEATURE flags / rollout gates (e.g. mobile `FEATURES.webSearch`).
 *
 * Layering: a UI action should FIRST ask `isCapabilityEnabled(platform, cap)` to
 * decide whether to RENDER AT ALL on this surface, and only then apply the
 * narrower model / environment / feature gates to decide whether it is currently
 * usable. Shared UI must consume this matrix (via the per-surface
 * CapabilityProvider) instead of probing browser APIs (e.g. the File System
 * Access API exists in Chrome but "working directory" is a *desktop product*
 * capability) or branching on `platform === 'desktop'`.
 *
 * Source of truth for the values is the product capability spec:
 *   Web      — cloud only.
 *   Desktop  — everything Web has, PLUS local-machine capabilities (superset).
 *   Mobile   — chat/images/voice/camera/photos/file-picker/marketplace/billing/
 *              notifications; NO desktop-local capabilities.
 *
 * Cells the product spec leaves UNSPECIFIED are set to MATCH CURRENT SHIPPED
 * BEHAVIOR (not inferred) and tagged `SPEC-SILENT` for founder confirmation.
 */
import type { SourceSurface, SyncedAppSurface } from './suite-contracts';

export type PlatformCapability =
  // ── Universal (cloud) — every synced surface ────────────────────────────────
  | 'canChat'
  | 'canUseImages'
  | 'canUploadFiles' // web "File upload" · mobile "File picker"
  | 'canUseVoice'
  | 'canUseMarketplace'
  | 'canUseBilling'
  | 'canUseCloudModels'
  | 'canUseCloudExecution' // cloud code execution (E2B); NOT local run-code
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
  // Universal cloud
  canChat: true,
  canUseImages: true,
  canUploadFiles: true,
  canUseVoice: true,
  canUseMarketplace: true,
  canUseBilling: true,
  canUseCloudModels: true,
  canUseCloudExecution: true,
  // Web + Desktop cloud tools
  canUseWebSearch: true,
  canUseDeepResearch: true,
  canUseConnectors: true,
  canUsePlugins: true,
  canUseSkills: true,
  // Desktop-only (local machine) — MUST be absent on web
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
  // Mobile-only device
  canUseCamera: false,
  canUsePhotos: false,
  canUseNotifications: false, // SPEC-SILENT for web; web push not shipped — false matches current
};

const DESKTOP: CapabilityRow = {
  // Desktop is a SUPERSET of web.
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
  // Desktop-only local-machine capabilities
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
  // Device capabilities — SPEC-SILENT for desktop; not surfaced today → false
  canUseCamera: false,
  canUsePhotos: false,
  canUseNotifications: true, // desktop has native notifications
};

const MOBILE: CapabilityRow = {
  // Universal cloud
  canChat: true,
  canUseImages: true,
  canUploadFiles: true, // "File picker"
  canUseVoice: true,
  canUseMarketplace: true,
  canUseBilling: true,
  canUseCloudModels: true,
  canUseCloudExecution: true,
  // Cloud tools — SPEC-SILENT on mobile's product "Includes" list. The matrix
  // declares PLATFORM capability (mobile's AddToChatSheet HAS these affordances);
  // the v1 FEATURE flags then gate runtime availability ON TOP (the intended
  // layering). As of 2026-08-06 `FEATURES.webSearch`, `research`, and
  // `connectors` are all TRUE in apps/mobile/lib/v1FeatureFlags.ts — the older
  // note here claiming they were off pending "AGI Cloud invite access" was stale
  // (Managed Cloud went open public alpha 2026-06-27; there is no invite gate).
  // Runtime availability now turns on the per-account capability handshake from
  // `/api/me?surface=mobile` and the selected model's own capabilities, not on
  // these flags.
  canUseWebSearch: true,
  canUseDeepResearch: true,
  canUseConnectors: true,
  canUsePlugins: false, // SPEC-SILENT · current: not surfaced in mobile composer
  canUseSkills: false, // SPEC-SILENT · current: not surfaced in mobile composer
  // Desktop-only — explicitly MUST NOT appear on mobile
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
  // Mobile device capabilities
  canUseCamera: true,
  canUsePhotos: true,
  canUseNotifications: true,
};

/**
 * The platform → capability truth table. Frozen so it can be relied on as a
 * constant single source of truth across all surfaces (and non-React contexts
 * such as the CLI).
 */
export const PLATFORM_CAPABILITIES: Readonly<Record<SyncedAppSurface, CapabilityRow>> =
  Object.freeze({
    web: WEB,
    desktop: DESKTOP,
    mobile: MOBILE,
  });

/** Does `platform` expose `capability`? The one function UI capability-gates on. */
export function isCapabilityEnabled(
  platform: SyncedAppSurface,
  capability: PlatformCapability,
): boolean {
  return PLATFORM_CAPABILITIES[platform]?.[capability] ?? false;
}

/** The full capability row for a platform (e.g. to build a context value once). */
export function getPlatformCapabilities(platform: SyncedAppSurface): CapabilityRow {
  return PLATFORM_CAPABILITIES[platform] ?? WEB;
}

/** All capability keys (handy for tests / exhaustive iteration). */
export const ALL_PLATFORM_CAPABILITIES = Object.keys(WEB) as readonly PlatformCapability[];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIVE metadata: domains + permission descriptors.
//
// This layer is purely ADDITIVE — it annotates the existing `can*` keys, it does
// NOT rename them or change `isCapabilityEnabled`. The flat boolean matrix above
// remains the platform-gating source of truth. This metadata exists so the
// capability layer can grow toward agent autonomy (confirmation prompts, danger
// classification, background/long-running scheduling) WITHOUT a model migration.
// A full resource-based rename (canCaptureScreen, canReadFilesystem/Write/Watch,
// graduated ask/allow/deny) is deliberately deferred until a concrete capability
// needs semantics the boolean cannot express — see the architecture review.
// ─────────────────────────────────────────────────────────────────────────────

/** Resource/feature domain a capability belongs to (for grouping + governance). */
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

/**
 * Runtime-permission descriptor for a capability. Consumed by future agent
 * autonomy: whether an action needs explicit user confirmation, is destructive,
 * is generally dangerous, runs in the background, or is long-running. Today this
 * is metadata only (no enforcement) — the foundation, not the mechanism.
 */
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

/** Per-capability domain + permission metadata. Every key in the matrix has one. */
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

/** Metadata (domain + permissions) for a capability. */
export function getCapabilityMetadata(capability: PlatformCapability): CapabilityMetadata {
  return CAPABILITY_METADATA[capability];
}

/** All capabilities in a domain (e.g. to render a settings/governance group). */
export function getCapabilitiesByDomain(domain: CapabilityDomain): PlatformCapability[] {
  return ALL_PLATFORM_CAPABILITIES.filter((cap) => CAPABILITY_METADATA[cap].domain === domain);
}

/** Whether a capability needs explicit user confirmation before an agent runs it. */
export function capabilityRequiresConfirmation(capability: PlatformCapability): boolean {
  return CAPABILITY_METADATA[capability].permissions?.requiresConfirmation ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-surface capability discovery.
//
// The boolean platform matrix above remains the runtime gate for synced apps.
// This smaller registry serves a different purpose: product surfaces can keep
// notable capabilities discoverable while truthfully showing that they run
// somewhere else. Developer surfaces use the canonical SourceSurface names
// (`chrome` and `vscode`) internally; user-facing labels spell those out as the
// Chrome and VS Code extensions.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Builds honest availability copy for capability lists and settings surfaces.
 * Unsupported capabilities remain discoverable without rendering a fake
 * enabled control or requiring each app to invent its own surface labels.
 */
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

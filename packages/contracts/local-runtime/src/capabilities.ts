/**
 * Permission categories for the privileged local runtime.
 *
 * Every category defaults to denied. A grant is always scoped: to a workspace
 * root, to an application, to a site, or to a single session. Nothing here
 * grants anything on its own; `PermissionDecision` records what the user chose
 * and the runtime enforces it before dispatch.
 */

import {
  ALL_PLATFORM_CAPABILITIES,
  surfaceCapabilityGrant,
  type CapabilityLayerGrant,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';

export const DESKTOP_CAPABILITIES = [
  'filesystem.read',
  'filesystem.write',
  'shell.execute',
  'git.read',
  'git.write',
  'git.destructive',
  'browser.site',
  'browser.cdp',
  'screen.capture',
  'computer.use',
  'application.control',
  'clipboard.read',
  'clipboard.monitor',
  'microphone',
  'simulator.ios',
  'emulator.android',
  'mcp.local',
  'local.inference',
  'host.remote',
  'task.scheduled',
] as const;

export type DesktopCapability = (typeof DESKTOP_CAPABILITIES)[number];

export function isDesktopCapability(value: string): value is DesktopCapability {
  return (DESKTOP_CAPABILITIES as readonly string[]).includes(value);
}

export type PermissionScopeKind = 'workspace' | 'application' | 'site' | 'global';

export interface PermissionScope {
  kind: PermissionScopeKind;
  /** Workspace root id, bundle/executable id, or site origin. Absent for `global`. */
  target?: string;
}

export type PermissionGrantDuration = 'once' | 'session' | 'always';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionDecision {
  capability: DesktopCapability;
  scope: PermissionScope;
  state: Exclude<PermissionState, 'prompt'>;
  duration: PermissionGrantDuration;
  decidedAtMs: number;
}

export interface PermissionRequest {
  capability: DesktopCapability;
  scope: PermissionScope;
  /** Human-readable reason shown in the prompt. */
  reason: string;
}

/**
 * Capabilities whose blast radius warrants a stronger prompt than the ordinary
 * allow/deny card, and which never accept an `always` grant silently.
 */
export const HIGH_RISK_CAPABILITIES: readonly DesktopCapability[] = [
  'shell.execute',
  'git.destructive',
  'computer.use',
  'application.control',
  'clipboard.monitor',
  'browser.cdp',
  'host.remote',
];

export function isHighRiskCapability(capability: DesktopCapability): boolean {
  return HIGH_RISK_CAPABILITIES.includes(capability);
}

export function permissionScopeKey(scope: PermissionScope): string {
  return scope.target ? `${scope.kind}:${scope.target}` : scope.kind;
}

export function permissionKey(capability: DesktopCapability, scope: PermissionScope): string {
  return `${capability}@${permissionScopeKey(scope)}`;
}

/**
 * The one place the runtime's permission vocabulary meets the product's
 * capability vocabulary. A capability with no product counterpart maps to
 * `null` rather than being invented on either side.
 */
export const DESKTOP_CAPABILITY_PLATFORM_MAPPING: Readonly<
  Record<DesktopCapability, PlatformCapability | null>
> = Object.freeze({
  'filesystem.read': 'canUseFileSystem',
  'filesystem.write': 'canUseFileSystem',
  'shell.execute': 'canUseTerminal',
  'git.read': 'canUseWorkingDirectory',
  'git.write': 'canUseWorkingDirectory',
  'git.destructive': 'canUseWorkingDirectory',
  'browser.site': 'canUseBrowserAutomation',
  'browser.cdp': 'canUseBrowserAutomation',
  'screen.capture': 'canTakeScreenshot',
  'computer.use': 'canUseDesktopAutomation',
  'application.control': 'canUseNativeIntegrations',
  'clipboard.read': 'canUseClipboard',
  'clipboard.monitor': 'canUseClipboard',
  microphone: 'canUseVoice',
  'simulator.ios': 'canRunLocalCode',
  'emulator.android': 'canRunLocalCode',
  'mcp.local': 'canUseLocalMcp',
  'local.inference': 'canUseLocalModels',
  'host.remote': null,
  'task.scheduled': null,
});

export function platformCapabilityFor(capability: DesktopCapability): PlatformCapability | null {
  return DESKTOP_CAPABILITY_PLATFORM_MAPPING[capability];
}

export function desktopCapabilitiesFor(
  capability: PlatformCapability,
): readonly DesktopCapability[] {
  return DESKTOP_CAPABILITIES.filter(
    (candidate) => DESKTOP_CAPABILITY_PLATFORM_MAPPING[candidate] === capability,
  );
}

export const LOCAL_RUNTIME_GRANT_SOURCE = 'local-runtime';

/**
 * The surface-layer grant the renderer hands `capability-handshake`. A product
 * capability survives only when the platform row allows it AND a runtime
 * permission behind it is granted, so a revoked grant closes it at the source.
 */
export function localRuntimeCapabilityGrant(
  surface: SyncedAppSurface,
  granted: readonly DesktopCapability[],
): CapabilityLayerGrant {
  const grantedSet = new Set(granted);
  const surfaceGrant = surfaceCapabilityGrant(surface);
  const capabilities = new Set<PlatformCapability>();

  for (const capability of ALL_PLATFORM_CAPABILITIES) {
    if (!surfaceGrant.has(capability)) continue;
    const required = desktopCapabilitiesFor(capability);
    if (required.length === 0 || required.some((entry) => grantedSet.has(entry))) {
      capabilities.add(capability);
    }
  }

  return { layer: 'surface', sourceId: LOCAL_RUNTIME_GRANT_SOURCE, granted: capabilities };
}

/** The latest decision per capability wins, so a revocation closes an earlier grant. */
export function grantedDesktopCapabilities(
  decisions: readonly PermissionDecision[],
): readonly DesktopCapability[] {
  const latest = new Map<DesktopCapability, PermissionDecision>();
  for (const decision of decisions) {
    const current = latest.get(decision.capability);
    if (!current || decision.decidedAtMs >= current.decidedAtMs) {
      latest.set(decision.capability, decision);
    }
  }
  return DESKTOP_CAPABILITIES.filter((capability) => latest.get(capability)?.state === 'granted');
}

/**
 * What a surface can do, as two manifests that meet rather than one guess.
 * The server publishes what the account is entitled to; the local host
 * publishes what the machine in front of the user can actually do. A client
 * combines them and never decides either half for itself.
 *
 * @module surface-capability-manifest
 */

import { ALL_PLATFORM_CAPABILITIES, type PlatformCapability } from './capabilities';
import {
  CAPABILITY_ENABLED,
  describeCapabilityState,
  isCapabilityState,
  missingCapabilityRemedy,
  type CapabilityDenialRemedy,
  type CapabilityState,
  type CapabilityStateExplanation,
} from './reason-codes';

export const SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION = 2;

/**
 * The oldest schema this reader still understands. A manifest older than this
 * is refused rather than half-read; a manifest newer than the reader is read
 * for the capabilities it recognises and no further.
 */
export const SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION = 1;

export const CAPABILITY_MANIFEST_ORIGINS = ['server', 'host'] as const;

export type CapabilityManifestOrigin = (typeof CAPABILITY_MANIFEST_ORIGINS)[number];

export interface CapabilityAvailability {
  state: CapabilityState;
  remedy?: CapabilityDenialRemedy;
  /** Working, but not at full strength. Carries the state that describes why. */
  degraded?: boolean;
}

export interface SurfaceCapabilityManifest {
  schemaVersion: number;
  origin: CapabilityManifestOrigin;
  sourceId: string;
  issuedAt: string;
  capabilities: Readonly<Partial<Record<PlatformCapability, CapabilityAvailability>>>;
}

export interface CapabilityManifestRejection {
  ok: false;
  reason: 'schema_too_old' | 'unreadable';
  detail: string;
}

export type CapabilityManifestRead =
  | { ok: true; manifest: SurfaceCapabilityManifest; unknownCapabilities: readonly string[] }
  | CapabilityManifestRejection;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads a manifest a different build may have written. An unknown capability
 * id is dropped and reported rather than treated as a grant, so an older
 * client meeting a newer server degrades to what it understands.
 */
export function readSurfaceCapabilityManifest(raw: unknown): CapabilityManifestRead {
  if (!isRecord(raw)) return { ok: false, reason: 'unreadable', detail: 'not an object' };
  const { schemaVersion, origin, sourceId, issuedAt, capabilities } = raw;

  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return { ok: false, reason: 'unreadable', detail: 'schemaVersion is not an integer' };
  }
  if (schemaVersion < SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema_too_old',
      detail: `schema ${schemaVersion} predates ${SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION}`,
    };
  }
  if (!(CAPABILITY_MANIFEST_ORIGINS as readonly unknown[]).includes(origin)) {
    return { ok: false, reason: 'unreadable', detail: `unknown origin ${String(origin)}` };
  }
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, reason: 'unreadable', detail: 'sourceId is missing' };
  }
  if (typeof issuedAt !== 'string' || Number.isNaN(Date.parse(issuedAt))) {
    return { ok: false, reason: 'unreadable', detail: 'issuedAt is not a timestamp' };
  }
  if (!isRecord(capabilities)) {
    return { ok: false, reason: 'unreadable', detail: 'capabilities is not an object' };
  }

  const known: Partial<Record<PlatformCapability, CapabilityAvailability>> = {};
  const unknownCapabilities: string[] = [];

  for (const [id, entry] of Object.entries(capabilities)) {
    if (!(ALL_PLATFORM_CAPABILITIES as readonly string[]).includes(id)) {
      unknownCapabilities.push(id);
      continue;
    }
    if (!isRecord(entry)) {
      unknownCapabilities.push(id);
      continue;
    }
    const state = entry['state'];
    if (typeof state !== 'string' || !isCapabilityState(state)) {
      unknownCapabilities.push(id);
      continue;
    }
    const remedy = entry['remedy'];
    known[id as PlatformCapability] = {
      state,
      ...(isRecord(remedy) ? { remedy: remedy as CapabilityDenialRemedy } : {}),
      ...(entry['degraded'] === true ? { degraded: true } : {}),
    };
  }

  return {
    ok: true,
    manifest: {
      schemaVersion,
      origin: origin as CapabilityManifestOrigin,
      sourceId,
      issuedAt,
      capabilities: known,
    },
    unknownCapabilities,
  };
}

export interface CombinedCapability extends CapabilityAvailability {
  capabilityId: PlatformCapability;
  decidedBy: CapabilityManifestOrigin;
}

export interface CombinedCapabilityManifest {
  schemaVersion: number;
  sources: Readonly<Record<CapabilityManifestOrigin, string>>;
  combinedAt: string;
  capabilities: Readonly<Record<PlatformCapability, CombinedCapability>>;
}

function unavailable(origin: CapabilityManifestOrigin): CapabilityAvailability {
  return { state: origin === 'server' ? 'unsupported_by_route' : 'unsupported_by_surface' };
}

/**
 * Both halves have to say yes. A capability either manifest leaves out is
 * unavailable with that manifest's own reason, never available by default.
 */
export function combineSurfaceCapabilityManifests(
  server: SurfaceCapabilityManifest,
  host: SurfaceCapabilityManifest,
  combinedAt: string = new Date().toISOString(),
): CombinedCapabilityManifest {
  const capabilities = {} as Record<PlatformCapability, CombinedCapability>;

  for (const capabilityId of ALL_PLATFORM_CAPABILITIES) {
    const fromServer = server.capabilities[capabilityId] ?? unavailable('server');
    const fromHost = host.capabilities[capabilityId] ?? unavailable('host');
    const denying =
      fromServer.state !== CAPABILITY_ENABLED
        ? ({ origin: 'server', entry: fromServer } as const)
        : fromHost.state !== CAPABILITY_ENABLED
          ? ({ origin: 'host', entry: fromHost } as const)
          : null;

    if (denying !== null) {
      capabilities[capabilityId] = {
        capabilityId,
        decidedBy: denying.origin,
        ...denying.entry,
      };
      continue;
    }

    const degraded = fromServer.degraded === true || fromHost.degraded === true;
    capabilities[capabilityId] = {
      capabilityId,
      decidedBy: fromServer.degraded === true ? 'server' : 'host',
      state: CAPABILITY_ENABLED,
      ...(degraded ? { degraded: true } : {}),
    };
  }

  return {
    schemaVersion: Math.min(server.schemaVersion, host.schemaVersion),
    sources: { server: server.sourceId, host: host.sourceId },
    combinedAt,
    capabilities,
  };
}

export interface CapabilityPresentation extends CapabilityStateExplanation {
  capabilityId: PlatformCapability;
  available: boolean;
  degraded: boolean;
  origin: CapabilityManifestOrigin;
  /** The remedy field this state promises and does not carry, if any. */
  missingRemedy: ReturnType<typeof missingCapabilityRemedy>;
}

export function presentCapability(
  combined: CombinedCapabilityManifest,
  capabilityId: PlatformCapability,
): CapabilityPresentation {
  const entry = combined.capabilities[capabilityId];
  const explanation = describeCapabilityState(entry.state, { remedy: entry.remedy });
  return {
    ...explanation,
    capabilityId,
    available: entry.state === CAPABILITY_ENABLED,
    degraded: entry.degraded === true,
    origin: entry.decidedBy,
    missingRemedy:
      entry.state === CAPABILITY_ENABLED
        ? null
        : missingCapabilityRemedy(entry.state, entry.remedy),
  };
}

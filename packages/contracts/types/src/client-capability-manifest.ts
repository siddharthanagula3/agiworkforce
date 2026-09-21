/**
 * What the build in front of the user implements, published by the client.
 *
 * `surface-capability-manifest.ts` carries the two manifests the *server* and
 * the *host machine* publish. Neither says what the client build can render,
 * which is the half that decides whether a newer server may send a block kind
 * or a capability at all. A client that never states its version is assumed
 * current, and a reader that assumes is a reader that breaks an old build.
 *
 * Everything here is additive by construction: an unknown capability, an
 * unknown block kind and an unknown field are reported rather than dropped,
 * so a newer client meeting an older server loses a feature and not a session.
 *
 * @module client-capability-manifest
 */

import { ALL_PLATFORM_CAPABILITIES, type PlatformCapability } from './capabilities';
import { MESSAGE_KINDS, type MessageKind } from './conversation';
import type { SourceSurface } from './suite-contracts';
import { compareVersion, partitionKnownFields, type VersionRange } from './version-registry';

export const CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION = 1;

/**
 * The oldest manifest shape this reader still understands. A manifest below it
 * is refused rather than half read; one above it is read for the fields this
 * build knows and no further.
 */
export const CLIENT_CAPABILITY_MANIFEST_SCHEMA_RANGE: VersionRange = Object.freeze({
  current: CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  minReadable: 1,
});

export const CLIENT_MANIFEST_FIELDS = [
  'schemaVersion',
  'surface',
  'clientVersion',
  'apiContractVersion',
  'capabilities',
  'renderableBlocks',
] as const;

export type ClientManifestField = (typeof CLIENT_MANIFEST_FIELDS)[number];

export interface ClientCapabilityManifest {
  schemaVersion: number;
  surface: SourceSurface;
  /** The build the user is running, which is not the shape it speaks. */
  clientVersion: string;
  /** The dated API contract this build was written against. */
  apiContractVersion: string;
  capabilities: readonly PlatformCapability[];
  renderableBlocks: readonly MessageKind[];
}

export interface ClientCapabilityManifestRead {
  manifest: ClientCapabilityManifest;
  /** Capabilities this build names that this reader has never heard of. */
  unknownCapabilities: readonly string[];
  /** Block kinds this build claims to render that this reader does not define. */
  unknownBlocks: readonly string[];
  /** Fields a newer client added, kept so they can be logged rather than acted on. */
  unknownFields: readonly string[];
}

export type ClientCapabilityManifestRejection = {
  reason: 'schema_too_old' | 'schema_too_new' | 'unreadable';
  detail: string;
};

export type ClientCapabilityManifestResult =
  | ({ ok: true } & ClientCapabilityManifestRead)
  | ({ ok: false } & ClientCapabilityManifestRejection);

const SURFACES: readonly SourceSurface[] = ['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMembers(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function isSourceSurface(value: unknown): value is SourceSurface {
  return typeof value === 'string' && (SURFACES as readonly string[]).includes(value);
}

/**
 * Reads a manifest a client published. The unknown members come back beside
 * the known ones because dropping them silently is what makes a later
 * "the client said it could do that" impossible to answer.
 */
export function readClientCapabilityManifest(payload: unknown): ClientCapabilityManifestResult {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'unreadable', detail: 'manifest is not an object' };
  }

  const schemaVersion = payload['schemaVersion'];
  if (typeof schemaVersion !== 'number') {
    return { ok: false, reason: 'unreadable', detail: 'manifest carries no schemaVersion' };
  }

  const readable = compareVersion(CLIENT_CAPABILITY_MANIFEST_SCHEMA_RANGE, schemaVersion);
  if (readable === 'too_old') {
    return {
      ok: false,
      reason: 'schema_too_old',
      detail: `manifest schema ${schemaVersion} is below the floor ${CLIENT_CAPABILITY_MANIFEST_SCHEMA_RANGE.minReadable}`,
    };
  }
  if (readable === 'too_new') {
    return {
      ok: false,
      reason: 'schema_too_new',
      detail: `manifest schema ${schemaVersion} is newer than ${CLIENT_CAPABILITY_MANIFEST_SCHEMA_RANGE.current}`,
    };
  }

  const surface = payload['surface'];
  if (!isSourceSurface(surface)) {
    return { ok: false, reason: 'unreadable', detail: 'manifest names no known surface' };
  }

  const clientVersion = payload['clientVersion'];
  if (typeof clientVersion !== 'string' || clientVersion.trim().length === 0) {
    return { ok: false, reason: 'unreadable', detail: 'manifest carries no clientVersion' };
  }

  const apiContractVersion = payload['apiContractVersion'];
  if (typeof apiContractVersion !== 'string' || apiContractVersion.trim().length === 0) {
    return { ok: false, reason: 'unreadable', detail: 'manifest carries no apiContractVersion' };
  }

  const { unknown: unknownFields } = partitionKnownFields(payload, CLIENT_MANIFEST_FIELDS);

  const claimedCapabilities = stringMembers(payload['capabilities']);
  const capabilities = claimedCapabilities.filter((entry): entry is PlatformCapability =>
    (ALL_PLATFORM_CAPABILITIES as readonly string[]).includes(entry),
  );
  const unknownCapabilities = claimedCapabilities.filter(
    (entry) => !(ALL_PLATFORM_CAPABILITIES as readonly string[]).includes(entry),
  );

  const claimedBlocks = stringMembers(payload['renderableBlocks']);
  const renderableBlocks = claimedBlocks.filter((entry): entry is MessageKind =>
    (MESSAGE_KINDS as readonly string[]).includes(entry),
  );
  const unknownBlocks = claimedBlocks.filter(
    (entry) => !(MESSAGE_KINDS as readonly string[]).includes(entry),
  );

  return {
    ok: true,
    manifest: {
      schemaVersion,
      surface,
      clientVersion,
      apiContractVersion,
      capabilities,
      renderableBlocks,
    },
    unknownCapabilities,
    unknownBlocks,
    unknownFields,
  };
}

export interface ServerVersionAdvertisement {
  /** The newest contract this deployment speaks. */
  latest: string;
  /** The oldest contract it still answers without complaint. */
  minimumSupported: string;
  /** Below this it refuses, because half answering is worse than refusing. */
  unsupportedBelow: string;
}

export const CLIENT_UPGRADE_STATES = [
  'current',
  'upgrade_optional',
  'upgrade_required',
  'unsupported',
] as const;

export type ClientUpgradeState = (typeof CLIENT_UPGRADE_STATES)[number];

export interface ClientUpgradeDecision {
  state: ClientUpgradeState;
  /** What the client must move to, absent only when it is already current. */
  target?: string;
  /** True when the client may keep working as it is. */
  usable: boolean;
}

/**
 * Where a client sits against what the server advertises. Dated contract
 * versions compare lexicographically, which is the whole reason they are
 * dates: an older client is literally an earlier string.
 */
export function resolveClientUpgrade(
  advertisement: ServerVersionAdvertisement,
  apiContractVersion: string,
): ClientUpgradeDecision {
  if (apiContractVersion < advertisement.unsupportedBelow) {
    return { state: 'unsupported', target: advertisement.latest, usable: false };
  }
  if (apiContractVersion < advertisement.minimumSupported) {
    return { state: 'upgrade_required', target: advertisement.minimumSupported, usable: false };
  }
  if (apiContractVersion < advertisement.latest) {
    return { state: 'upgrade_optional', target: advertisement.latest, usable: true };
  }
  return { state: 'current', usable: true };
}

export interface DegradedFeature {
  name: string;
  /** What the user sees instead, never nothing. */
  fallback: 'hidden' | 'read_only' | 'server_rendered';
}

/**
 * A capability the server offers that this client cannot render is hidden or
 * degraded, never sent and left to fail. A client that renders an unknown
 * block as an empty bubble has told the user their message vanished.
 */
export function degradeUnsupported(
  offered: readonly string[],
  manifest: ClientCapabilityManifest,
): readonly DegradedFeature[] {
  const supported = new Set<string>([...manifest.capabilities, ...manifest.renderableBlocks]);
  return offered
    .filter((name) => !supported.has(name))
    .map((name) => ({
      name,
      fallback: (MESSAGE_KINDS as readonly string[]).includes(name) ? 'server_rendered' : 'hidden',
    }));
}

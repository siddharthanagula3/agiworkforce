/**
 * Whether a feature has been released to a caller, as one object.
 *
 * `feature-registry.json` says what a feature *is* and which gates guard it.
 * `model-catalog.ts` owns how finished a capability is, how far the build
 * carrying it was handed out and who may reach it. Nothing joined the two, so
 * "is this released here" was answered separately by a flag row, a maturity
 * field and a client version check, and three answers cannot be reconciled
 * after the fact.
 *
 * A release refusal names the layer that refused, because a user told only
 * "unavailable" has no next step and support has nothing to look at.
 *
 * @module feature-release
 */

import { featureDefinition, type FeatureId } from './feature-registry';
import {
  channelCarriesMaturity,
  maturityAdmitsAvailability,
  RELEASE_AVAILABILITY_DEFAULT,
  RELEASE_CHANNEL_DEFAULT,
  type FeatureMaturity,
  type ReleaseAvailability,
  type ReleaseChannel,
} from './model-catalog';

export const FEATURE_RELEASE_BLOCKERS = [
  'unknown_feature',
  'channel_too_wide',
  'availability_too_wide',
  'client_too_old',
  'backend_too_old',
  'floor_unresolved',
  'override_disabled',
  'override_expired',
] as const;

export type FeatureReleaseBlocker = (typeof FEATURE_RELEASE_BLOCKERS)[number];

/**
 * A row that overrides the registry for one subject. `expiresAt` is not
 * decoration: an override with no end date is a permanent fork of the product
 * that nobody remembers taking.
 */
export interface FeatureReleaseOverride {
  enabled: boolean;
  variant: string | null;
  expiresAt: string | null;
}

export interface FeatureRelease {
  feature: FeatureId;
  maturity: FeatureMaturity;
  channel: ReleaseChannel;
  availability: ReleaseAvailability;
  /** The variant the caller is on, from an override or the default build. */
  variant: string | null;
  released: boolean;
  /** Every layer that refused, in the order they were asked. */
  blockers: readonly FeatureReleaseBlocker[];
  minClientVersion: string | null;
  minBackendVersion: string | null;
}

export interface ResolveFeatureReleaseInput {
  feature: FeatureId;
  channel?: ReleaseChannel;
  availability?: ReleaseAvailability;
  /** The build asking, so a feature that needs a newer client says so. */
  clientVersion?: string | null;
  backendVersion?: string | null;
  /**
   * The registry stores a symbol name for a floor so no version is copied into
   * JSON. The caller passes the value that symbol holds; a floor nothing
   * resolves blocks the release rather than comparing a name to a number.
   */
  floors?: Readonly<Record<string, string>>;
  override?: FeatureReleaseOverride | null;
  now?: Date;
}

const VERSION_LITERAL = /^\d+(?:\.\d+)*$/;

function comparableVersion(value: string): number[] {
  return value.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function resolveFloor(
  declared: string,
  floors: Readonly<Record<string, string>> | undefined,
): string | null {
  if (VERSION_LITERAL.test(declared)) return declared;
  const resolved = floors?.[declared];
  return resolved !== undefined && VERSION_LITERAL.test(resolved) ? resolved : null;
}

/** True when `candidate` is at least `floor`, comparing part by part. */
export function versionAtLeast(candidate: string | null | undefined, floor: string): boolean {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) return false;
  const left = comparableVersion(candidate);
  const right = comparableVersion(floor);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export function resolveFeatureRelease(input: ResolveFeatureReleaseInput): FeatureRelease {
  const definition = featureDefinition(input.feature);
  const channel = input.channel ?? RELEASE_CHANNEL_DEFAULT;
  const availability = input.availability ?? RELEASE_AVAILABILITY_DEFAULT;
  const blockers: FeatureReleaseBlocker[] = [];

  if (definition === null) {
    return {
      feature: input.feature,
      maturity: 'experimental',
      channel,
      availability,
      variant: null,
      released: false,
      blockers: ['unknown_feature'],
      minClientVersion: null,
      minBackendVersion: null,
    };
  }

  const { maturity, minClientVersion, minBackendVersion } = definition;

  if (!channelCarriesMaturity(channel, maturity)) blockers.push('channel_too_wide');
  if (!maturityAdmitsAvailability(maturity, availability)) blockers.push('availability_too_wide');
  for (const [declared, version, blocker] of [
    [minClientVersion, input.clientVersion, 'client_too_old'],
    [minBackendVersion, input.backendVersion, 'backend_too_old'],
  ] as const) {
    if (declared === null) continue;
    const floor = resolveFloor(declared, input.floors);
    if (floor === null) {
      blockers.push('floor_unresolved');
      continue;
    }
    if (!versionAtLeast(version, floor)) blockers.push(blocker);
  }

  const override = input.override ?? null;
  if (override !== null) {
    const now = input.now ?? new Date();
    if (override.expiresAt !== null && new Date(override.expiresAt) <= now) {
      blockers.push('override_expired');
    } else if (!override.enabled) {
      blockers.push('override_disabled');
    }
  }

  return {
    feature: input.feature,
    maturity,
    channel,
    availability,
    variant: override?.variant ?? null,
    released: blockers.length === 0,
    blockers,
    minClientVersion,
    minBackendVersion,
  };
}

/**
 * Everything that is versioned independently of the build it ships in. An app
 * version answers "which download is this" and nothing else: a stored row, a
 * replayed tool call and a plugin manifest each outlive the build that wrote
 * them, so each carries its own.
 *
 * `scripts/check-version-registry.mjs` resolves every entry against the file
 * that carries it, so a renamed or deleted version constant fails.
 *
 * @module version-registry
 */

export const VERSIONED_ARTIFACTS = [
  'database-schema',
  'api',
  'contracts',
  'event-schemas',
  'sync-protocol',
  'tool-schema',
  'mcp-integration',
  'model-registry',
  'prompt-registry',
  'policy-schema',
  'entitlement-schema',
  'artifact-runtime',
  'plugin-manifest',
  'skill-manifest',
  'connector-manifest',
] as const;

export type VersionedArtifact = (typeof VERSIONED_ARTIFACTS)[number];

export function isVersionedArtifact(value: string): value is VersionedArtifact {
  return (VERSIONED_ARTIFACTS as readonly string[]).includes(value);
}

export const VERSION_COMPATIBILITY = ['readable', 'too_old', 'too_new'] as const;

export type VersionCompatibility = (typeof VERSION_COMPATIBILITY)[number];

export interface VersionRange {
  /** What this build writes. */
  current: number;
  /** The oldest shape this build still reads. */
  minReadable: number;
}

/**
 * A payload older than the floor is refused rather than half read, and one
 * newer than this build is refused rather than guessed at. Tolerating unknown
 * *fields* inside a readable version is safe; tolerating an unknown *version*
 * is how a client acts on a shape whose rules it has never seen.
 */
export function compareVersion(range: VersionRange, payloadVersion: number): VersionCompatibility {
  if (!Number.isInteger(payloadVersion)) return 'too_old';
  if (payloadVersion < range.minReadable) return 'too_old';
  if (payloadVersion > range.current) return 'too_new';
  return 'readable';
}

export function isReadableVersion(range: VersionRange, payloadVersion: number): boolean {
  return compareVersion(range, payloadVersion) === 'readable';
}

export interface UnknownFieldReport<Known extends string> {
  known: Partial<Record<Known, unknown>>;
  unknown: readonly string[];
}

/**
 * An additive change is a field a reader has never seen. Keeping it out of the
 * known set and reporting it is what lets the next version add one without a
 * bump; silently accepting it as a grant is what makes that unsafe.
 */
export function partitionKnownFields<Known extends string>(
  payload: Readonly<Record<string, unknown>>,
  knownFields: readonly Known[],
): UnknownFieldReport<Known> {
  const known: Partial<Record<Known, unknown>> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if ((knownFields as readonly string[]).includes(key)) {
      known[key as Known] = value;
      continue;
    }
    unknown.push(key);
  }
  return { known, unknown };
}

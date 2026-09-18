/**
 * @file Which region a workspace's data is pinned to, and what "pinned" resolves to.
 *
 * Residency is not one setting. A workspace that must stay in the European
 * Union needs its rows, its objects, its logs, its keys and the inference it
 * dispatches to all stay there, and each of those is a different piece of
 * infrastructure with a different name. This file is the single registry of
 * which names a region is made of, so a caller asks the region rather than
 * assembling the answer from five env vars of its own.
 *
 * WHAT THIS IS NOT: provisioning. A region is only real once every piece it
 * names exists, and nothing here creates any of them. `resolveDataRegion`
 * answers `provisioned: false` with the list of what is missing, and callers
 * fail closed on that answer rather than quietly serving the home region. That
 * is the difference between residency and a preference: a workspace that asked
 * for the EU and is served from the US has been lied to, so it is refused
 * instead.
 *
 * Only `us` is provisioned today. `eu` is declared here so region selection can
 * be written and tested against two regions before either the second Neon
 * project, the EU-jurisdiction bucket, or the EU inference transports exist;
 * standing the infrastructure up is a founder action against real vendor
 * accounts and no code here can substitute for it.
 *
 * Every piece of a region comes from an env var whose NAME is derived from the
 * region id, never from a literal read of `process.env` in the surface. That is
 * what lets a third region be added by declaring it here plus setting its vars,
 * and it is why this registry lives in a contracts package rather than in the
 * web app.
 */

import { NON_US_VENDOR_TRANSPORTS } from './transport-residency';

export type DataRegionId = 'us' | 'eu';

export const DATA_REGION_IDS = Object.freeze(['us', 'eu'] as const);

/**
 * The region a workspace is in when nobody has chosen one, and the only region
 * provisioned today. An organization row with a null `data_region` is in it.
 */
export const DEFAULT_DATA_REGION: DataRegionId = 'us';

/**
 * How a region decides which inference transports it may dispatch to.
 *
 * `exclude` is the United States position and the one the product already
 * takes: everything in the catalog is reachable except the transports
 * `transport-residency.ts` places outside the country. `allow` is the position
 * any other region has to take, because a transport whose processing location
 * is UNPUBLISHED cannot be assumed to sit inside that region; only transports
 * named explicitly are admitted, so an empty set means no inference at all
 * rather than all of it.
 */
export type InferenceRouteSetMode = 'exclude' | 'allow';

export interface InferenceRouteSet {
  mode: InferenceRouteSetMode;
  transports: ReadonlySet<string>;
}

export interface DataRegionDefinition {
  id: DataRegionId;
  label: string;
  /** The legal territory the region's infrastructure must sit inside. */
  jurisdiction: string;
  /**
   * The jurisdiction an object-storage bucket has to be CREATED under. An
   * auto-region bucket that happens to hold its objects in the right place is
   * not residency: the provider may move them. `null` means the home region,
   * where the existing single-bucket configuration already applies.
   */
  objectStorageJurisdiction: string | null;
  inferenceRouteSetMode: InferenceRouteSetMode;
}

export const DATA_REGIONS: Readonly<Record<DataRegionId, DataRegionDefinition>> = Object.freeze({
  us: Object.freeze({
    id: 'us',
    label: 'United States',
    jurisdiction: 'US',
    objectStorageJurisdiction: null,
    inferenceRouteSetMode: 'exclude',
  }),
  eu: Object.freeze({
    id: 'eu',
    label: 'European Union',
    jurisdiction: 'EU',
    objectStorageJurisdiction: 'eu',
    inferenceRouteSetMode: 'allow',
  }),
});

export type DataRegionFacet =
  | 'databaseUrl'
  | 'objectStorageEndpoint'
  | 'objectStorageBucket'
  | 'logDestination'
  | 'keyManagementRegion'
  | 'inferenceTransports';

const FACET_ENV_SUFFIX: Readonly<Record<DataRegionFacet, string>> = Object.freeze({
  databaseUrl: 'DATABASE_URL',
  objectStorageEndpoint: 'OBJECT_STORAGE_ENDPOINT',
  objectStorageBucket: 'OBJECT_STORAGE_BUCKET',
  logDestination: 'LOG_DESTINATION',
  keyManagementRegion: 'KMS_REGION',
  inferenceTransports: 'INFERENCE_TRANSPORTS',
});

const ENV_PREFIX = 'AGI_DATA_REGION';

export function dataRegionEnvName(region: DataRegionId, facet: DataRegionFacet): string {
  return `${ENV_PREFIX}_${region.toUpperCase()}_${FACET_ENV_SUFFIX[facet]}`;
}

export function dataRegionEnvNames(region: DataRegionId): readonly string[] {
  return (Object.keys(FACET_ENV_SUFFIX) as DataRegionFacet[]).map((facet) =>
    dataRegionEnvName(region, facet),
  );
}

export interface DataRegionRuntime {
  region: DataRegionId;
  definition: DataRegionDefinition;
  databaseUrl: string;
  objectStorageEndpoint: string;
  objectStorageBucket: string;
  logDestination: string;
  keyManagementRegion: string;
  inferenceRouteSet: InferenceRouteSet;
}

export type DataRegionResolution =
  | { provisioned: true; runtime: DataRegionRuntime }
  | { provisioned: false; region: DataRegionId; missing: readonly string[] };

export type EnvironmentRecord = Record<string, string | undefined>;

function read(env: EnvironmentRecord, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTransports(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

export function isDataRegionId(value: unknown): value is DataRegionId {
  return typeof value === 'string' && (DATA_REGION_IDS as readonly string[]).includes(value);
}

/**
 * Reads a stored or requested region, answering `null` for anything this build
 * does not declare. A row written by an older build naming a region that has
 * since been withdrawn must not resolve to the home region by accident, so the
 * caller decides what `null` means rather than this function guessing.
 */
export function normaliseDataRegion(value: string | null | undefined): DataRegionId | null {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return isDataRegionId(lowered) ? lowered : null;
}

/**
 * The home region's facets come from the deployment's existing configuration,
 * so it is provisioned as soon as the app has a database at all. Any other
 * region has to name every one of its own.
 */
function homeRegionRuntime(env: EnvironmentRecord): DataRegionResolution {
  const definition = DATA_REGIONS[DEFAULT_DATA_REGION];
  const databaseUrl =
    read(env, dataRegionEnvName(DEFAULT_DATA_REGION, 'databaseUrl')) ??
    read(env, 'AGI_DATABASE_URL') ??
    read(env, 'DATABASE_URL');
  if (!databaseUrl) {
    return {
      provisioned: false,
      region: DEFAULT_DATA_REGION,
      missing: [dataRegionEnvName(DEFAULT_DATA_REGION, 'databaseUrl')],
    };
  }
  return {
    provisioned: true,
    runtime: {
      region: DEFAULT_DATA_REGION,
      definition,
      databaseUrl,
      objectStorageEndpoint:
        read(env, dataRegionEnvName(DEFAULT_DATA_REGION, 'objectStorageEndpoint')) ??
        read(env, 'OBJECT_STORAGE_ENDPOINT') ??
        '',
      objectStorageBucket:
        read(env, dataRegionEnvName(DEFAULT_DATA_REGION, 'objectStorageBucket')) ??
        read(env, 'OBJECT_STORAGE_PRIVATE_BUCKET') ??
        '',
      logDestination:
        read(env, dataRegionEnvName(DEFAULT_DATA_REGION, 'logDestination')) ?? 'stdout',
      keyManagementRegion:
        read(env, dataRegionEnvName(DEFAULT_DATA_REGION, 'keyManagementRegion')) ?? '',
      inferenceRouteSet: {
        mode: definition.inferenceRouteSetMode,
        transports: new Set(NON_US_VENDOR_TRANSPORTS),
      },
    },
  };
}

/**
 * Resolves one region into the concrete infrastructure it names, or the list of
 * env vars that would have to be set for it to exist.
 *
 * A non-home region is all-or-nothing on purpose. A workspace pinned to the EU
 * whose logs still ship to the home destination is not in the EU, and a partial
 * answer here would let a caller believe otherwise.
 */
export function resolveDataRegion(
  region: DataRegionId,
  env: EnvironmentRecord,
): DataRegionResolution {
  if (region === DEFAULT_DATA_REGION) return homeRegionRuntime(env);

  const definition = DATA_REGIONS[region];
  const values = new Map<DataRegionFacet, string>();
  const missing: string[] = [];
  for (const facet of Object.keys(FACET_ENV_SUFFIX) as DataRegionFacet[]) {
    const name = dataRegionEnvName(region, facet);
    const value = read(env, name);
    if (value === undefined) missing.push(name);
    else values.set(facet, value);
  }
  if (missing.length > 0) return { provisioned: false, region, missing };

  const transports = parseTransports(values.get('inferenceTransports'));
  if (definition.inferenceRouteSetMode === 'allow' && transports.size === 0) {
    return {
      provisioned: false,
      region,
      missing: [dataRegionEnvName(region, 'inferenceTransports')],
    };
  }

  return {
    provisioned: true,
    runtime: {
      region,
      definition,
      databaseUrl: values.get('databaseUrl') as string,
      objectStorageEndpoint: values.get('objectStorageEndpoint') as string,
      objectStorageBucket: values.get('objectStorageBucket') as string,
      logDestination: values.get('logDestination') as string,
      keyManagementRegion: values.get('keyManagementRegion') as string,
      inferenceRouteSet: { mode: definition.inferenceRouteSetMode, transports },
    },
  };
}

export function configuredDataRegions(env: EnvironmentRecord): readonly DataRegionId[] {
  return DATA_REGION_IDS.filter((region) => resolveDataRegion(region, env).provisioned);
}

export class DataRegionUnavailableError extends Error {
  readonly region: string;
  readonly missing: readonly string[];

  constructor(region: string, missing: readonly string[]) {
    super(
      `Data region "${region}" is not provisioned; ${missing.join(', ')} ${
        missing.length === 1 ? 'is' : 'are'
      } unset. Requests for this workspace are refused rather than served from another region.`,
    );
    this.name = 'DataRegionUnavailableError';
    this.region = region;
    this.missing = missing;
  }
}

/**
 * The region a request runs in, or a throw. Never a silent fallback: falling
 * back is the one failure mode residency exists to prevent.
 *
 * An absent pin is the home region, which is what an organization that has
 * never chosen one means. A pin naming a region this build does not declare is
 * refused, not defaulted: the row was written by something that believed the
 * region existed, and serving it from the home region would be the silent
 * relocation the pin was set to prevent.
 */
export function selectDataRegion(
  requested: string | null | undefined,
  env: EnvironmentRecord,
): DataRegionRuntime {
  const pinned = typeof requested === 'string' ? requested.trim() : '';
  const region = pinned === '' ? DEFAULT_DATA_REGION : normaliseDataRegion(pinned);
  if (region === null) {
    throw new DataRegionUnavailableError(pinned, [
      `a declared region id (${DATA_REGION_IDS.join(', ')})`,
    ]);
  }
  const resolution = resolveDataRegion(region, env);
  if (!resolution.provisioned) {
    throw new DataRegionUnavailableError(resolution.region, resolution.missing);
  }
  return resolution.runtime;
}

/**
 * `purpose` names what was about to move in the refusal and decides nothing.
 * There is no degraded answer: work is served from its region or refused.
 */
export type CrossRegionRoutingDecision =
  | { allowed: true; region: DataRegionId }
  | { allowed: false; origin: DataRegionId; executing: DataRegionId; reason: string };

export function crossRegionRoutingDecision(input: {
  origin: DataRegionId;
  executing: DataRegionId;
  purpose: string;
}): CrossRegionRoutingDecision {
  if (input.origin === input.executing) return { allowed: true, region: input.origin };
  return {
    allowed: false,
    origin: input.origin,
    executing: input.executing,
    reason:
      `${input.purpose} originated in data region "${input.origin}" and cannot be carried out in ` +
      `"${input.executing}". Residency is not a preference: the work waits for its own region.`,
  };
}

export class CrossRegionRoutingRefusedError extends Error {
  readonly origin: DataRegionId;
  readonly executing: DataRegionId;

  constructor(decision: Extract<CrossRegionRoutingDecision, { allowed: false }>) {
    super(decision.reason);
    this.name = 'CrossRegionRoutingRefusedError';
    this.origin = decision.origin;
    this.executing = decision.executing;
  }
}

export function assertSameDataRegion(input: {
  origin: DataRegionId;
  executing: DataRegionId;
  purpose: string;
}): void {
  const decision = crossRegionRoutingDecision(input);
  if (decision.allowed) return;
  throw new CrossRegionRoutingRefusedError(decision);
}

export function inferenceRouteSetAdmits(routeSet: InferenceRouteSet, transport: string): boolean {
  return routeSet.mode === 'exclude'
    ? !routeSet.transports.has(transport)
    : routeSet.transports.has(transport);
}

/**
 * The transports a region refuses, as the exclusion set the routing request
 * already speaks. An `allow` region needs the catalog's transports to subtract
 * its allowlist from, which is why the known set is a parameter rather than
 * something this file pretends to know.
 */
export function excludedTransportsFor(
  routeSet: InferenceRouteSet,
  knownTransports: Iterable<string>,
): ReadonlySet<string> {
  if (routeSet.mode === 'exclude') return new Set(routeSet.transports);
  const excluded = new Set<string>();
  for (const transport of knownTransports) {
    if (!routeSet.transports.has(transport)) excluded.add(transport);
  }
  return excluded;
}

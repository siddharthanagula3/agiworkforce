import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  CMEK_PROVIDER_IDS,
  CmekProviderUnconfiguredError,
  CustomerKeyRevokedError,
  CustomerKeyUnavailableError,
  createCustomerKeyRingResolver,
  createLocalCmekProvider,
  platformTenantKeyRing,
  resolveOrganizationKeyRing,
  type CmekKeyDescriptor,
  type CmekKeyStatus,
  type CmekProvider,
  type CmekProviderId,
  type CmekProviderRegistry,
  type CustomerKeyRingResolver,
  type KeyRingPrincipal,
  type OrganizationKeyRecord,
  type OrganizationKeyRing,
} from '@/lib/crypto/cmek';
import {
  assertRewrapComplete,
  runKeyRewrap,
  validateCmekSetup,
  type CmekSetupValidation,
  type RewrapOutcome,
  type RewrapStore,
} from '@/lib/crypto/cmek-lifecycle';
import { createKmsProviderRegistry } from '@/lib/crypto/kms-providers';
import {
  WORKSPACE_SEALED_STORES,
  workspaceRewrapStores,
} from '@/lib/crypto/connector-secret-reseal';
import {
  assertCustomerKeyRegion,
  keyManagementRegions,
  readOrganizationRegion,
} from './data-region';
import {
  SUPPORT_ACCESS_SCOPES,
  assertSupportAccess,
  type SupportAccessScope,
} from './support-access-service';

/**
 * The platform root every workspace without its own key is derived from. It is
 * the key ring that already exists, read per tenant rather than shared.
 */
export const PLATFORM_TENANT_KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';

const LOCAL_ROOT_ENV = 'AGI_CMEK_LOCAL_ROOT';

interface KeyRow {
  organization_id: string;
  provider: string;
  key_uri: string;
  key_region: string;
  status: string;
  key_version: string;
  wrapped_data_key: string;
  retired_keys: unknown;
  last_rotated_at: string | Date | null;
  revoked_at: string | Date | null;
}

function isProviderId(value: string): value is CmekProviderId {
  return (CMEK_PROVIDER_IDS as readonly string[]).includes(value);
}

function isKeyStatus(value: string): value is CmekKeyStatus {
  return value === 'active' || value === 'rotating' || value === 'revoked';
}

function parseRetired(raw: unknown): { version: string; wrapped: string }[] {
  const entries = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!Array.isArray(entries)) return [];
  const out: { version: string; wrapped: string }[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { version, wrapped } = entry as Record<string, unknown>;
    if (typeof version === 'string' && typeof wrapped === 'string') out.push({ version, wrapped });
  }
  return out;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toRecord(row: KeyRow): OrganizationKeyRecord {
  if (!isProviderId(row.provider) || !isKeyStatus(row.status)) {
    throw new Error(
      `organization_encryption_keys row for ${row.organization_id} names provider ` +
        `"${row.provider}" and status "${row.status}", which this build cannot resolve.`,
    );
  }
  const descriptor: CmekKeyDescriptor = {
    provider: row.provider,
    keyUri: row.key_uri,
    region: row.key_region,
  };
  return {
    organizationId: row.organization_id,
    descriptor,
    status: row.status,
    active: { version: row.key_version, wrapped: row.wrapped_data_key },
    retired: parseRetired(row.retired_keys),
  };
}

export async function readOrganizationKeyRecord(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationKeyRecord | null> {
  const rows = await db.query<KeyRow>(
    `select organization_id, provider, key_uri, key_region, status, key_version,
            wrapped_data_key, retired_keys, last_rotated_at, revoked_at
       from public.organization_encryption_keys
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  const row = rows[0];
  return row ? toRecord(row) : null;
}

/**
 * The KMS clients this deployment can actually talk to. A vendor whose
 * credentials are absent is absent from the registry, so a workspace whose key
 * lives there is refused at resolution rather than served from somewhere else.
 */
export function buildCmekProviderRegistry(
  env: Record<string, string | undefined> = process.env,
): CmekProviderRegistry {
  const registry: CmekProviderRegistry = { ...createKmsProviderRegistry({ env }) };
  const localRoot = env[LOCAL_ROOT_ENV]?.trim();
  if (localRoot && env['NODE_ENV'] !== 'production') {
    registry.local = createLocalCmekProvider(Buffer.from(localRoot, 'hex'), {
      nodeEnv: env['NODE_ENV'] ?? 'development',
    });
  }
  return registry;
}

let resolverRegistry: CmekProviderRegistry | null = null;
let resolveCustomerRing: CustomerKeyRingResolver | null = null;

function customerRingResolver(registry: CmekProviderRegistry): CustomerKeyRingResolver {
  if (!resolveCustomerRing || resolverRegistry !== registry) {
    resolverRegistry = registry;
    resolveCustomerRing = createCustomerKeyRingResolver(registry);
  }
  return resolveCustomerRing;
}

/**
 * Forgets one workspace's unwrapped data keys now. Without this a revocation
 * would keep serving plaintext until the resolver's cache window lapsed.
 */
function forgetCustomerKeyMaterial(record: OrganizationKeyRecord | null): void {
  if (record) resolveCustomerRing?.invalidate(record);
}

/**
 * Asks the customer's KMS directly rather than through the ring cache, so a key
 * the customer disabled on their side reads as unavailable on the next status
 * call instead of at the end of the cache window. A failed probe also drops the
 * cached material, which is what makes the serving path stop using it.
 */
async function probeCustomerKey(
  registry: CmekProviderRegistry,
  record: OrganizationKeyRecord,
): Promise<void> {
  if (record.status === 'revoked') throw new CustomerKeyRevokedError(record.organizationId);
  const client = registry[record.descriptor.provider];
  if (!client) throw new CmekProviderUnconfiguredError(record.descriptor.provider);
  try {
    await client.unwrapDataKey(record.descriptor, record.active.wrapped);
  } catch (error) {
    forgetCustomerKeyMaterial(record);
    throw new CustomerKeyUnavailableError(record.organizationId, record.descriptor.provider, error);
  }
}

export interface OrganizationKeyRingOptions {
  registry?: CmekProviderRegistry;
  env?: Record<string, string | undefined>;
  principal?: KeyRingPrincipal;
}

function isSupportScope(value: string): value is SupportAccessScope {
  return (SUPPORT_ACCESS_SCOPES as readonly string[]).includes(value);
}

/**
 * The ring one workspace's data is sealed under. Throws for a workspace whose
 * customer key is revoked or unreachable; never substitutes the platform key
 * for one, which is the whole guarantee customer-managed keys sell.
 */
export async function organizationKeyRing(
  db: DatabaseAdapter,
  organizationId: string,
  options: OrganizationKeyRingOptions = {},
): Promise<OrganizationKeyRing> {
  const registry = options.registry ?? buildCmekProviderRegistry(options.env);
  return resolveOrganizationKeyRing(
    organizationId,
    {
      loadRecord: (id) => readOrganizationKeyRecord(db, id),
      resolveCustomerRing: customerRingResolver(registry),
      platformEnvName: PLATFORM_TENANT_KEY_ENV,
      assertSupportAccess: async (orgId, principal) => {
        if (!isSupportScope(principal.scope)) {
          throw new Error(
            `"${principal.scope}" is not a break-glass scope, so no grant can cover this read.`,
          );
        }
        await assertSupportAccess({
          db,
          organizationId: orgId,
          actorUserId: principal.userId,
          scope: principal.scope,
        });
      },
      ...(options.env ? { env: options.env } : {}),
    },
    options.principal ?? { kind: 'tenant' },
  );
}

export type OrganizationKeyAvailability =
  | { state: 'platform_derived'; keyId: string }
  | { state: 'platform_unconfigured' }
  | { state: 'customer_managed'; descriptor: CmekKeyDescriptor; keyVersion: string }
  | { state: 'revoked' }
  | { state: 'unavailable'; descriptor: CmekKeyDescriptor; reason: string };

export interface OrganizationKeyStatus {
  availability: OrganizationKeyAvailability;
  status: CmekKeyStatus | null;
  lastRotatedAt: string | null;
  revokedAt: string | null;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * What to show an administrator, without throwing at them. Everything that
 * refuses a request is reported here as a refusal rather than smoothed over:
 * an unreachable customer key is the difference between a workspace that works
 * and one that does not, so its posture row has to say so.
 */
export async function readOrganizationKeyStatus(
  db: DatabaseAdapter,
  organizationId: string,
  options: OrganizationKeyRingOptions = {},
): Promise<OrganizationKeyStatus> {
  const record = await readOrganizationKeyRecord(db, organizationId);
  if (!record) {
    const platform = { status: null, lastRotatedAt: null, revokedAt: null };
    try {
      const ring = platformTenantKeyRing(
        PLATFORM_TENANT_KEY_ENV,
        organizationId,
        options.env ? { env: options.env } : {},
      );
      return { ...platform, availability: { state: 'platform_derived', keyId: ring.active.id } };
    } catch (error) {
      logger.error({ organizationId, error }, 'Platform tenant key ring is unavailable');
      return { ...platform, availability: { state: 'platform_unconfigured' } };
    }
  }

  const rows = await db.query<Pick<KeyRow, 'last_rotated_at' | 'revoked_at'>>(
    `select last_rotated_at, revoked_at
       from public.organization_encryption_keys
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  const row = rows[0] ?? null;
  const meta = {
    status: record.status,
    lastRotatedAt: row ? toIso(row.last_rotated_at) : null,
    revokedAt: row ? toIso(row.revoked_at) : null,
  };

  const registry = options.registry ?? buildCmekProviderRegistry(options.env);
  try {
    await probeCustomerKey(registry, record);
    return {
      ...meta,
      availability: {
        state: 'customer_managed',
        descriptor: record.descriptor,
        keyVersion: record.active.version,
      },
    };
  } catch (error) {
    if (error instanceof CustomerKeyRevokedError) {
      return { ...meta, availability: { state: 'revoked' } };
    }
    if (
      error instanceof CustomerKeyUnavailableError ||
      error instanceof CmekProviderUnconfiguredError
    ) {
      logger.error(
        { organizationId, provider: record.descriptor.provider },
        'Customer-managed key could not be resolved',
      );
      return {
        ...meta,
        availability: {
          state: 'unavailable',
          descriptor: record.descriptor,
          reason:
            error instanceof CmekProviderUnconfiguredError
              ? 'no client configured for this key provider'
              : 'the key could not be used',
        },
      };
    }
    throw error;
  }
}

export interface ProvisionOrganizationKeyInput {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  descriptor: CmekKeyDescriptor;
  provider: CmekProvider;
  keyVersion: string;
  env?: Record<string, string | undefined>;
}

/**
 * An EU-pinned workspace whose key lives in a US KMS is not out of reach of a
 * US legal process, so the association is refused here rather than in review.
 */
async function assertKeyRegionAdmitted(
  db: DatabaseAdapter,
  organizationId: string,
  descriptor: CmekKeyDescriptor,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const region = await readOrganizationRegion(db, organizationId, env);
  assertCustomerKeyRegion(region.effective, descriptor.region, env);
}

export interface PlatformSealedCount {
  store: string;
  rows: number;
}

/**
 * What this workspace has sealed under the platform-derived ring. Enrolling a
 * key of its own moves every read onto that key, and nothing opens these rows
 * again, so the count is a gate on enrolment rather than a report.
 */
export async function countPlatformSealedRows(
  db: DatabaseAdapter,
  organizationId: string,
  env?: Record<string, string | undefined>,
): Promise<readonly PlatformSealedCount[]> {
  const ring = platformTenantKeyRing(
    PLATFORM_TENANT_KEY_ENV,
    organizationId,
    env ? { env } : undefined,
  );
  const versions = [ring.active.id, ...ring.retired.map((key) => key.id)];
  const counts: PlatformSealedCount[] = [];
  for (const store of workspaceRewrapStores(db, organizationId)) {
    let rows = 0;
    for (const version of versions) rows += await store.countSealedUnder(version);
    if (rows > 0) counts.push({ store: store.name, rows });
  }
  return counts;
}

export async function provisionOrganizationKey(
  input: ProvisionOrganizationKeyInput,
): Promise<{ keyVersion: string }> {
  await assertKeyRegionAdmitted(input.db, input.organizationId, input.descriptor, input.env);
  // Enrolment switches every read onto the customer ring. Rows still sealed
  // under the platform ring have no path across, so they are the gate.
  const stranded = await countPlatformSealedRows(input.db, input.organizationId, input.env);
  if (stranded.length > 0) {
    throw new Error(
      `Workspace ${input.organizationId} still holds ` +
        `${stranded.map((entry) => `${entry.rows} row(s) in ${entry.store}`).join(', ')} sealed ` +
        'under the platform key. Enrolling a key of its own moves every read onto that key and ' +
        'those rows would never open again, so the association is refused until they are cleared.',
    );
  }
  const { wrapped } = await input.provider.generateDataKey(input.descriptor);
  await input.db.execute(
    `insert into public.organization_encryption_keys
       (organization_id, provider, key_uri, key_region, status, key_version,
        wrapped_data_key, retired_keys, created_by_user_id)
     values ($1, $2, $3, $4, 'active', $5, $6, '[]'::jsonb, $7)
     on conflict (organization_id) do update
       set provider = excluded.provider,
           key_uri = excluded.key_uri,
           key_region = excluded.key_region,
           status = 'active',
           key_version = excluded.key_version,
           wrapped_data_key = excluded.wrapped_data_key,
           revoked_at = null`,
    [
      input.organizationId,
      input.descriptor.provider,
      input.descriptor.keyUri,
      input.descriptor.region,
      input.keyVersion,
      wrapped,
      input.actorUserId,
    ],
  );
  await recordAuditEvent({
    eventType: 'encryption_key_provisioned',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      keyProvider: input.descriptor.provider,
      region: input.descriptor.region,
      keyVersion: input.keyVersion,
    },
  });
  return { keyVersion: input.keyVersion };
}

export interface RotateOrganizationKeyInput extends ProvisionOrganizationKeyInput {
  record: OrganizationKeyRecord;
}

/**
 * Rotation retires the previous wrapped key rather than dropping it, so a
 * ciphertext sealed a second ago still opens while a re-encryption sweep works
 * through the rows. The trail names the version, never the material.
 */
export async function rotateOrganizationKey(
  input: RotateOrganizationKeyInput,
): Promise<{ keyVersion: string; retiredVersions: string[] }> {
  if (input.record.status === 'revoked') {
    throw new CustomerKeyRevokedError(input.organizationId);
  }
  await assertKeyRegionAdmitted(input.db, input.organizationId, input.descriptor, input.env);
  const { wrapped } = await input.provider.generateDataKey(input.descriptor);
  const retired = [input.record.active, ...input.record.retired];
  await input.db.execute(
    `update public.organization_encryption_keys
        set key_version = $2,
            wrapped_data_key = $3,
            retired_keys = $4::jsonb,
            status = 'active',
            last_rotated_at = now()
      where organization_id = $1`,
    [input.organizationId, input.keyVersion, wrapped, JSON.stringify(retired)],
  );
  await recordAuditEvent({
    eventType: 'encryption_key_rotated',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      keyProvider: input.descriptor.provider,
      keyVersion: input.keyVersion,
      count: retired.length,
    },
  });
  return { keyVersion: input.keyVersion, retiredVersions: retired.map((key) => key.version) };
}

export interface RevokeOrganizationKeyInput {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  reason: string;
}

/**
 * Revocation is recorded, not deleted. After it this product refuses to open
 * anything sealed for the workspace, and the row is what lets the trail say
 * which key version that was true of.
 */
export async function revokeOrganizationKey(
  input: RevokeOrganizationKeyInput,
): Promise<{ revoked: boolean }> {
  // Read only so the cache purge below can be precise. A row this build cannot
  // parse must not be able to stop a revocation.
  const before = await readOrganizationKeyRecord(input.db, input.organizationId).catch(() => null);
  const rows = await input.db.query<{ key_version: string }>(
    `update public.organization_encryption_keys
        set status = 'revoked',
            revoked_at = now()
      where organization_id = $1
        and status <> 'revoked'
      returning key_version`,
    [input.organizationId],
  );
  const row = rows[0];
  if (!row) return { revoked: false };
  // Before the audit write: a revocation that waited on the audit round trip
  // would keep serving cached plaintext for the length of it.
  forgetCustomerKeyMaterial(before);
  await recordAuditEvent({
    eventType: 'encryption_key_revoked',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'critical',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      keyVersion: row.key_version,
      reason: input.reason,
    },
  });
  return { revoked: true };
}

/**
 * The pre-activation gate: run the customer's key before anything is sealed
 * under it. Nothing is written, so a workspace can fix its grant and try again
 * without a half-provisioned association in the table.
 */
export async function validateOrganizationKeySetup(
  db: DatabaseAdapter,
  organizationId: string,
  descriptor: CmekKeyDescriptor,
  options: OrganizationKeyRingOptions = {},
): Promise<CmekSetupValidation> {
  const env = options.env ?? process.env;
  const registry = options.registry ?? buildCmekProviderRegistry(options.env);
  const region = await readOrganizationRegion(db, organizationId, env);
  return validateCmekSetup({
    descriptor,
    registry,
    admittedRegions: keyManagementRegions(region.effective, env),
  });
}

export type KeyRewrapState = 'pending' | 'running' | 'complete' | 'failed';

export interface KeyRewrapRun {
  organizationId: string;
  fromVersion: string;
  toVersion: string;
  state: KeyRewrapState;
  scanned: number;
  resealed: number;
  remaining: number;
  failureCount: number;
  /** The sealed stores the run walked, which is what it is evidence for. */
  coveredStores: readonly string[];
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface RewrapRunRow {
  organization_id: string;
  from_key_version: string;
  to_key_version: string;
  state: string;
  scanned: number | string;
  resealed: number | string;
  remaining: number | string;
  failure_count: number | string;
  covered_stores: unknown;
  last_error: string | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}

function isRewrapState(value: string): value is KeyRewrapState {
  return value === 'pending' || value === 'running' || value === 'complete' || value === 'failed';
}

function toRewrapRun(row: RewrapRunRow): KeyRewrapRun {
  if (!isRewrapState(row.state)) {
    throw new Error(
      `organization_key_rewrap_runs row for ${row.organization_id} names state "${row.state}", ` +
        'which this build cannot resolve.',
    );
  }
  return {
    organizationId: row.organization_id,
    fromVersion: row.from_key_version,
    toVersion: row.to_key_version,
    state: row.state,
    scanned: Number(row.scanned),
    resealed: Number(row.resealed),
    remaining: Number(row.remaining),
    failureCount: Number(row.failure_count),
    coveredStores: Array.isArray(row.covered_stores)
      ? row.covered_stores.filter((entry): entry is string => typeof entry === 'string')
      : [],
    lastError: row.last_error,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
  };
}

export async function readKeyRewrapRun(
  db: DatabaseAdapter,
  organizationId: string,
  fromVersion: string,
): Promise<KeyRewrapRun | null> {
  const rows = await db.query<RewrapRunRow>(
    `select organization_id, from_key_version, to_key_version, state, scanned, resealed,
            remaining, failure_count, covered_stores, last_error, started_at, completed_at
       from public.organization_key_rewrap_runs
      where organization_id = $1
        and from_key_version = $2
      order by started_at desc
      limit 1`,
    [organizationId, fromVersion],
  );
  const row = rows[0];
  return row ? toRewrapRun(row) : null;
}

export interface RunOrganizationKeyRewrapInput {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  fromVersion: string;
  /** Defaults to every store the sealed-store registry declares. */
  stores?: readonly RewrapStore[];
  registry?: CmekProviderRegistry;
  env?: Record<string, string | undefined>;
}

/**
 * Moves a workspace's ciphertext off a retired key version and records what it
 * moved. The row it writes is the only thing retireOrganizationKeyVersion will
 * accept as evidence, and its schema refuses a completion that still has a
 * remainder, so an interrupted run cannot be filed as a finished one.
 */
export async function runOrganizationKeyRewrap(
  input: RunOrganizationKeyRewrapInput,
): Promise<RewrapOutcome> {
  const record = await readOrganizationKeyRecord(input.db, input.organizationId);
  if (!record) {
    throw new Error(
      `Workspace ${input.organizationId} manages no key of its own, so there is nothing to rewrap.`,
    );
  }
  if (record.status === 'revoked') throw new CustomerKeyRevokedError(input.organizationId);

  const registry = input.registry ?? buildCmekProviderRegistry(input.env);
  const ring = await customerRingResolver(registry)(record);
  const toVersion = record.active.version;
  const stores = input.stores ?? workspaceRewrapStores(input.db, input.organizationId);
  const coveredStores = stores.map((store) => store.name);

  await input.db.execute(
    `insert into public.organization_key_rewrap_runs
       (organization_id, from_key_version, to_key_version, state, started_by_user_id,
        covered_stores)
     values ($1, $2, $3, 'running', $4, $5::text[])
     on conflict (organization_id, from_key_version, to_key_version) do update
       set state = 'running',
           last_error = null,
           completed_at = null,
           started_at = now(),
           started_by_user_id = excluded.started_by_user_id,
           covered_stores = excluded.covered_stores`,
    [input.organizationId, input.fromVersion, toVersion, input.actorUserId, coveredStores],
  );

  let outcome: RewrapOutcome;
  try {
    outcome = await runKeyRewrap({
      ring,
      fromVersion: input.fromVersion,
      stores,
    });
  } catch (error) {
    await input.db.execute(
      `update public.organization_key_rewrap_runs
          set state = 'failed', last_error = $4, completed_at = null
        where organization_id = $1 and from_key_version = $2 and to_key_version = $3`,
      [
        input.organizationId,
        input.fromVersion,
        toVersion,
        error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
      ],
    );
    throw error;
  }

  const firstFailure = outcome.failures[0];
  await input.db.execute(
    `update public.organization_key_rewrap_runs
        set state = $4,
            scanned = $5,
            resealed = $6,
            remaining = $7,
            failure_count = $8,
            last_error = $9,
            completed_at = case when $4 = 'complete' then now() else null end
      where organization_id = $1 and from_key_version = $2 and to_key_version = $3`,
    [
      input.organizationId,
      input.fromVersion,
      toVersion,
      outcome.complete ? 'complete' : 'failed',
      outcome.scanned,
      outcome.resealed,
      outcome.remaining,
      outcome.failures.length,
      firstFailure ? `${firstFailure.store}/${firstFailure.id}: ${firstFailure.reason}` : null,
    ],
  );

  await recordAuditEvent({
    eventType: 'encryption_key_rotated',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      status: outcome.complete ? 'rewrapped' : 'rewrap_incomplete',
      keyVersion: outcome.fromVersion,
      version: outcome.toVersion,
      count: outcome.resealed,
    },
  });

  return outcome;
}

export interface RetireOrganizationKeyVersionInput {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  keyVersion: string;
  reason: string;
}

/**
 * Drops a version out of the ring, which is the moment anything still sealed
 * under it becomes unreadable for good. Gated on a complete rewrap onto the
 * key that is active right now, never on the operator's assurance.
 */
export async function retireOrganizationKeyVersion(
  input: RetireOrganizationKeyVersionInput,
): Promise<{ retainedVersions: string[] }> {
  const record = await readOrganizationKeyRecord(input.db, input.organizationId);
  if (!record) {
    throw new Error(`Workspace ${input.organizationId} manages no key of its own.`);
  }
  if (record.active.version === input.keyVersion) {
    throw new Error(
      `Key version "${input.keyVersion}" is the active one. Rotate onto a new version before ` +
        'retiring it, or nothing could be sealed at all.',
    );
  }
  if (!record.retired.some((key) => key.version === input.keyVersion)) {
    throw new Error(
      `Key version "${input.keyVersion}" is not in this workspace's ring, so there is nothing ` +
        'to retire.',
    );
  }

  const run = await readKeyRewrapRun(input.db, input.organizationId, input.keyVersion);
  if (!run) {
    throw new Error(
      `No rewrap has moved workspace ${input.organizationId}'s ciphertext off key version ` +
        `"${input.keyVersion}". Dropping it now would make that data unreadable for good.`,
    );
  }
  if (run.toVersion !== record.active.version) {
    throw new Error(
      `The rewrap off "${input.keyVersion}" targeted "${run.toVersion}" and the active version ` +
        `is now "${record.active.version}". Rewrap onto the current key before retiring.`,
    );
  }
  const uncovered = WORKSPACE_SEALED_STORES.map((store) => `${store.table}.${store.column}`).filter(
    (name) => !run.coveredStores.includes(name),
  );
  if (uncovered.length > 0) {
    throw new Error(
      `The rewrap off "${input.keyVersion}" never walked ${uncovered.join(', ')}, so nothing ` +
        'establishes that those rows moved. Run the rewrap over every sealed store before ' +
        'retiring the version, or what is still on it becomes unreadable for good.',
    );
  }
  assertRewrapComplete({
    fromVersion: run.fromVersion,
    toVersion: run.toVersion,
    scanned: run.scanned,
    resealed: run.resealed,
    remaining: run.remaining,
    complete: run.state === 'complete',
    failures: [],
  });

  const retained = record.retired.filter((key) => key.version !== input.keyVersion);
  await input.db.execute(
    `update public.organization_encryption_keys
        set retired_keys = $2::jsonb
      where organization_id = $1`,
    [input.organizationId, JSON.stringify(retained)],
  );
  forgetCustomerKeyMaterial(record);

  await recordAuditEvent({
    eventType: 'encryption_key_rotated',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'critical',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      status: 'retired',
      keyVersion: input.keyVersion,
      version: record.active.version,
      count: retained.length,
      reason: input.reason,
    },
  });

  return { retainedVersions: retained.map((key) => key.version) };
}

export interface ReplaceOrganizationKeyInput extends ProvisionOrganizationKeyInput {
  record: OrganizationKeyRecord;
}

/**
 * Moving a workspace onto a different key resource, which rotation does not do:
 * rotation asks the same key for a new data key, replacement changes the key,
 * and with it the vendor and region the association points at. The previous
 * version stays in the ring until a rewrap lets it be retired.
 */
export async function replaceOrganizationKey(
  input: ReplaceOrganizationKeyInput,
): Promise<{ keyVersion: string; previousVersion: string }> {
  if (input.record.status === 'revoked') {
    throw new CustomerKeyRevokedError(input.organizationId);
  }
  const previous = input.record.descriptor;
  if (
    previous.provider === input.descriptor.provider &&
    previous.keyUri === input.descriptor.keyUri &&
    previous.region === input.descriptor.region
  ) {
    throw new Error(
      'Replacement names the key the workspace already uses. Rotate it instead, which asks the ' +
        'same key for a new data key.',
    );
  }
  if (input.record.active.version === input.keyVersion) {
    throw new Error(`Key version "${input.keyVersion}" is already the active one.`);
  }
  await assertKeyRegionAdmitted(input.db, input.organizationId, input.descriptor, input.env);

  const { wrapped } = await input.provider.generateDataKey(input.descriptor);
  const retained = [input.record.active, ...input.record.retired];
  await input.db.execute(
    `update public.organization_encryption_keys
        set provider = $2,
            key_uri = $3,
            key_region = $4,
            key_version = $5,
            wrapped_data_key = $6,
            retired_keys = $7::jsonb,
            status = 'active',
            last_rotated_at = now()
      where organization_id = $1`,
    [
      input.organizationId,
      input.descriptor.provider,
      input.descriptor.keyUri,
      input.descriptor.region,
      input.keyVersion,
      wrapped,
      JSON.stringify(retained),
    ],
  );
  forgetCustomerKeyMaterial(input.record);

  await recordAuditEvent({
    eventType: 'encryption_key_rotated',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'critical',
    detail: {
      resourceType: 'encryption_key',
      resourceId: input.organizationId,
      status: 'replaced',
      keyProvider: input.descriptor.provider,
      region: input.descriptor.region,
      previousRegion: previous.region,
      keyVersion: input.keyVersion,
      version: input.record.active.version,
      count: retained.length,
    },
  });

  return { keyVersion: input.keyVersion, previousVersion: input.record.active.version };
}

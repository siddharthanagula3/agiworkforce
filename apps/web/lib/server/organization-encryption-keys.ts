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
  type OrganizationKeyRecord,
  type OrganizationKeyRing,
} from '@/lib/crypto/cmek';

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
 * The KMS clients this deployment can actually talk to.
 *
 * Empty for both real providers: reaching a customer's AWS or GCP key needs
 * credentials for an account this deployment does not hold, and inventing a
 * client that cannot connect would turn a provisioning gap into a runtime
 * mystery. The local double is built only outside production, where it exists
 * so every path below, the refusals included, runs without a vendor.
 */
export function buildCmekProviderRegistry(
  env: Record<string, string | undefined> = process.env,
): CmekProviderRegistry {
  const registry: CmekProviderRegistry = {};
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

export interface OrganizationKeyRingOptions {
  registry?: CmekProviderRegistry;
  env?: Record<string, string | undefined>;
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
  return resolveOrganizationKeyRing(organizationId, {
    loadRecord: (id) => readOrganizationKeyRecord(db, id),
    resolveCustomerRing: customerRingResolver(registry),
    platformEnvName: PLATFORM_TENANT_KEY_ENV,
    ...(options.env ? { env: options.env } : {}),
  });
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
    await customerRingResolver(registry)(record);
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
}

export async function provisionOrganizationKey(
  input: ProvisionOrganizationKeyInput,
): Promise<{ keyVersion: string }> {
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

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import {
  createKmsKeyProvider,
  resolveTenantKeyRing,
  envKeyProvider,
  type KeyRing,
  type LoadKeyRingOptions,
} from './envelope';

/**
 * @file Customer-managed encryption keys: the org owns the key, we own neither.
 *
 * Two layers. The customer holds a key-encryption key (KEK) in their own AWS or
 * GCP KMS; we never see its material. That KEK wraps a per-organization data
 * key (DEK), and the wrapped DEK is what this database stores. Opening anything
 * for that organization therefore requires the customer's KMS to answer, which
 * is the entire point: revoking our grant on the KEK ends our ability to read
 * their data without us having to be trusted to delete anything.
 *
 * WHAT IS NOT BUILT HERE: provisioning. `AwsKmsProvider` and `GcpKmsProvider`
 * are the interface only; standing up a real key, a cross-account grant and the
 * credentials to assume it is a founder action against real vendor accounts.
 * `createLocalCmekProvider` is a test double that implements the same interface
 * against local material, so every behaviour below, including the fail-closed
 * ones, is exercised without either vendor.
 *
 * Tenants without CMEK keep the path they have always had: the platform root
 * key with an HKDF derivation per organization, which binds a tenant's
 * ciphertext to that tenant without a second vendor in the request path.
 */

export const CMEK_PROVIDER_IDS = Object.freeze(['aws_kms', 'gcp_kms', 'local'] as const);

export type CmekProviderId = (typeof CMEK_PROVIDER_IDS)[number];

export type CmekKeyStatus = 'active' | 'rotating' | 'revoked';

export interface CmekKeyDescriptor {
  provider: CmekProviderId;
  /** The key's own name in the customer's KMS: an ARN, or a GCP resource path. */
  keyUri: string;
  region: string;
}

export interface CmekWrappedKey {
  version: string;
  wrapped: string;
}

/**
 * One organization's key association, as the row holds it. Kept structural
 * rather than importing the row type so this module stays testable without a
 * database and usable from a rotation script.
 */
export interface OrganizationKeyRecord {
  organizationId: string;
  descriptor: CmekKeyDescriptor;
  status: CmekKeyStatus;
  active: CmekWrappedKey;
  retired: readonly CmekWrappedKey[];
}

export interface CmekProvider {
  readonly id: CmekProviderId;
  generateDataKey(descriptor: CmekKeyDescriptor): Promise<{ wrapped: string; plaintext: Buffer }>;
  unwrapDataKey(descriptor: CmekKeyDescriptor, wrapped: string): Promise<Buffer>;
}

export class CustomerKeyUnavailableError extends Error {
  readonly organizationId: string;
  readonly provider: CmekProviderId;

  constructor(organizationId: string, provider: CmekProviderId, cause?: unknown) {
    super(
      `The encryption key this workspace manages in its own ${provider} could not be used. ` +
        'Requests that need it are refused rather than served with a platform key.',
    );
    this.name = 'CustomerKeyUnavailableError';
    this.organizationId = organizationId;
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

export class CustomerKeyRevokedError extends Error {
  readonly organizationId: string;

  constructor(organizationId: string) {
    super(
      'This workspace revoked its customer-managed encryption key. Data sealed under it stays ' +
        'sealed; restore the key in your KMS and reactivate it to read it again.',
    );
    this.name = 'CustomerKeyRevokedError';
    this.organizationId = organizationId;
  }
}

export class CmekProviderUnconfiguredError extends Error {
  constructor(provider: CmekProviderId) {
    super(
      `No client is configured for the "${provider}" key provider. Provisioning it needs ` +
        'credentials for the customer’s own account, which this deployment does not hold.',
    );
    this.name = 'CmekProviderUnconfiguredError';
  }
}

const DATA_KEY_LENGTH = 32;
const LOCAL_WRAP_IV_LENGTH = 12;
const LOCAL_WRAP_TAG_LENGTH = 16;
const LOCAL_WRAP_ALGORITHM = 'aes-256-gcm';

/**
 * A double for a customer KMS, not a KMS.
 *
 * It wraps with AES-256-GCM under a root held in this process, so it proves the
 * interface, the caching, the rotation and every refusal path without either
 * vendor. It cannot provide what a real KMS provides, which is that the key
 * lives somewhere this deployment cannot reach, so it refuses to be built for a
 * production deployment at all.
 */
export function createLocalCmekProvider(
  root: Buffer,
  options: { nodeEnv?: string; failFor?: (keyUri: string) => Error | null } = {},
): CmekProvider {
  const nodeEnv = options.nodeEnv ?? process.env['NODE_ENV'];
  if (nodeEnv === 'production') {
    throw new Error(
      'createLocalCmekProvider is a test double and holds the key in this process. ' +
        'A production deployment must use a provider backed by the customer’s own KMS.',
    );
  }
  if (root.length !== DATA_KEY_LENGTH) {
    throw new Error(`Local CMEK root must be ${DATA_KEY_LENGTH} bytes, got ${root.length}`);
  }

  function kekFor(descriptor: CmekKeyDescriptor): Buffer {
    return Buffer.from(
      hkdfSync(
        'sha256',
        root,
        Buffer.from(descriptor.region, 'utf8'),
        Buffer.from(descriptor.keyUri, 'utf8'),
        DATA_KEY_LENGTH,
      ),
    );
  }

  function assertReachable(descriptor: CmekKeyDescriptor): void {
    const failure = options.failFor?.(descriptor.keyUri);
    if (failure) throw failure;
  }

  return {
    id: 'local',
    async generateDataKey(descriptor) {
      assertReachable(descriptor);
      const plaintext = randomBytes(DATA_KEY_LENGTH);
      const iv = randomBytes(LOCAL_WRAP_IV_LENGTH);
      const cipher = createCipheriv(LOCAL_WRAP_ALGORITHM, kekFor(descriptor), iv, {
        authTagLength: LOCAL_WRAP_TAG_LENGTH,
      });
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {
        plaintext,
        wrapped: Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64'),
      };
    },
    async unwrapDataKey(descriptor, wrapped) {
      assertReachable(descriptor);
      const raw = Buffer.from(wrapped, 'base64');
      if (raw.length <= LOCAL_WRAP_IV_LENGTH + LOCAL_WRAP_TAG_LENGTH) {
        throw new Error('Wrapped data key is shorter than its IV and auth tag');
      }
      const decipher = createDecipheriv(
        LOCAL_WRAP_ALGORITHM,
        kekFor(descriptor),
        raw.subarray(0, LOCAL_WRAP_IV_LENGTH),
        { authTagLength: LOCAL_WRAP_TAG_LENGTH },
      );
      decipher.setAuthTag(raw.subarray(raw.length - LOCAL_WRAP_TAG_LENGTH));
      return Buffer.concat([
        decipher.update(raw.subarray(LOCAL_WRAP_IV_LENGTH, raw.length - LOCAL_WRAP_TAG_LENGTH)),
        decipher.final(),
      ]);
    },
  };
}

export type CmekProviderRegistry = Partial<Record<CmekProviderId, CmekProvider>>;

export interface CustomerKeyRingOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

const CMEK_ENV_NAME = 'AGI_CMEK_DATA_KEY';

/**
 * Resolves the ring one organization's ciphertext is sealed under.
 *
 * Every refusal is a refusal. A revoked association, an unreachable KMS, a key
 * the customer disabled, and a provider this deployment has no client for all
 * end the call; none of them fall through to the platform root, because a
 * silent fall-through would mean data the customer believes only they can
 * unlock is readable without them.
 */
export type CustomerKeyRingResolver = (record: OrganizationKeyRecord) => Promise<KeyRing>;

export function createCustomerKeyRingResolver(
  registry: CmekProviderRegistry,
  options: CustomerKeyRingOptions = {},
): CustomerKeyRingResolver {
  const providers = new Map<string, ReturnType<typeof createKmsKeyProvider>>();

  function keyProviderFor(descriptor: CmekKeyDescriptor) {
    const cacheKey = `${descriptor.provider}|${descriptor.region}|${descriptor.keyUri}`;
    const existing = providers.get(cacheKey);
    if (existing) return existing;
    const client = registry[descriptor.provider];
    if (!client) throw new CmekProviderUnconfiguredError(descriptor.provider);
    const created = createKmsKeyProvider(
      (wrapped) => client.unwrapDataKey(descriptor, wrapped),
      options,
    );
    providers.set(cacheKey, created);
    return created;
  }

  return async function resolve(record: OrganizationKeyRecord): Promise<KeyRing> {
    if (record.status === 'revoked') throw new CustomerKeyRevokedError(record.organizationId);
    const provider = keyProviderFor(record.descriptor);
    try {
      const ring = await provider.resolveKeyRing(CMEK_ENV_NAME, {
        env: wrappedKeyEnv(record),
      });
      return { active: ring.active, retired: ring.retired };
    } catch (error) {
      if (error instanceof CmekProviderUnconfiguredError) throw error;
      throw new CustomerKeyUnavailableError(
        record.organizationId,
        record.descriptor.provider,
        error,
      );
    }
  };
}

const WRAPPED_KEY_RE = /^[A-Za-z0-9+/=_-]+$/;

function assertWrapped(value: string, label: string): string {
  if (!WRAPPED_KEY_RE.test(value)) {
    throw new Error(`${label} is not a base64 wrapped key`);
  }
  return value;
}

function wrappedKeyEnv(record: OrganizationKeyRecord): Record<string, string> {
  const env: Record<string, string> = {
    [CMEK_ENV_NAME]: assertWrapped(record.active.wrapped, 'Active wrapped data key'),
    [`${CMEK_ENV_NAME}_ID`]: record.active.version,
  };
  if (record.retired.length > 0) {
    env[`${CMEK_ENV_NAME}_RETIRED`] = record.retired
      .map((key) => `${key.version}:${assertWrapped(key.wrapped, 'Retired wrapped data key')}`)
      .join(',');
  }
  return env;
}

/**
 * The ring for a tenant that has not brought its own key: the platform root,
 * derived per organization so one tenant's ciphertext never opens under
 * another's. This is the path every workspace is on today and it stays.
 */
export function platformTenantKeyRing(
  envName: string,
  organizationId: string,
  options?: LoadKeyRingOptions,
): KeyRing {
  return resolveTenantKeyRing(envKeyProvider, envName, organizationId, options);
}

export interface OrganizationKeyRingDeps {
  loadRecord: (organizationId: string) => Promise<OrganizationKeyRecord | null>;
  resolveCustomerRing: (record: OrganizationKeyRecord) => Promise<KeyRing>;
  platformEnvName: string;
  env?: Record<string, string | undefined>;
}

export type OrganizationKeySource = 'customer_managed' | 'platform_derived';

export interface OrganizationKeyRing {
  ring: KeyRing;
  source: OrganizationKeySource;
  descriptor: CmekKeyDescriptor | null;
  keyVersion: string;
}

export async function resolveOrganizationKeyRing(
  organizationId: string,
  deps: OrganizationKeyRingDeps,
): Promise<OrganizationKeyRing> {
  const record = await deps.loadRecord(organizationId);
  if (!record) {
    const ring = platformTenantKeyRing(deps.platformEnvName, organizationId, {
      ...(deps.env ? { env: deps.env } : {}),
    });
    return {
      ring,
      source: 'platform_derived',
      descriptor: null,
      keyVersion: ring.active.id,
    };
  }
  const ring = await deps.resolveCustomerRing(record);
  return {
    ring,
    source: 'customer_managed',
    descriptor: record.descriptor,
    keyVersion: record.active.version,
  };
}

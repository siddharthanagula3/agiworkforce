import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_CODE_BUILT_IN_ENVIRONMENT,
  CLOUD_CODE_ENVIRONMENT_LIMITS,
  type CloudCodeEnvironment,
  type CloudCodeNetworkAccess,
  type CreateCloudCodeEnvironmentInput,
  type UpdateCloudCodeEnvironmentInput,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { InvalidExtraEgressHostsError, normalizeExtraEgressHosts } from '@/lib/e2b/egress-hosts';

export interface CloudCodeEnvironmentOwner {
  userId: string;
  organizationId: string | null;
}

export const CLOUD_CODE_ENVIRONMENT_NAME_TAKEN = 'You already have an environment with this name.';
export const CLOUD_CODE_ENVIRONMENT_LIMIT_REACHED = `You can keep up to ${CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount} environments. Delete one to add another.`;
export const CLOUD_CODE_ENVIRONMENT_NOT_FOUND = 'Environment not found';
export const CLOUD_CODE_ENVIRONMENT_REQUEST_REUSED =
  'requestId was already used for an environment in another workspace';
export const CLOUD_CODE_ENVIRONMENT_FULL_NETWORK_UNACKNOWLEDGED =
  'Full internet access requires explicit acknowledgement of unrestricted egress';

export class CloudCodeEnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudCodeEnvironmentValidationError';
  }
}

export class CloudCodeEnvironmentNotFoundError extends Error {
  constructor() {
    super(CLOUD_CODE_ENVIRONMENT_NOT_FOUND);
    this.name = 'CloudCodeEnvironmentNotFoundError';
  }
}

export class CloudCodeEnvironmentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudCodeEnvironmentConflictError';
  }
}

export function rethrowCloudCodeEnvironmentError(error: unknown): never {
  if (error instanceof CloudCodeEnvironmentValidationError) {
    throw createError.validation(error.message);
  }
  if (error instanceof CloudCodeEnvironmentNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeEnvironmentConflictError) throw createError.conflict(error.message);
  throw error;
}

interface EnvironmentRow {
  id: string;
  name: string;
  network_access: CloudCodeNetworkAccess;
  extra_hosts: string[] | null;
  allow_package_managers: boolean;
  setup_script: string;
  env_var_names: string[] | null;
  is_default: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

const ENVIRONMENT_COLUMNS = `id, name, network_access, extra_hosts, allow_package_managers,
  setup_script, env_var_names, is_default, created_at, updated_at`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';
const NAME_INDEX = 'cloud_code_environments_owner_name_key';
const REQUEST_KEY = 'cloud_code_environments_request_key';

function isoTime(value: string | Date): string {
  return new Date(value).toISOString();
}

export function mapCloudCodeEnvironment(row: EnvironmentRow): CloudCodeEnvironment {
  return {
    id: row.id,
    name: row.name,
    networkAccess: row.network_access,
    extraHosts: row.extra_hosts ?? [],
    allowPackageManagers: row.allow_package_managers,
    setupScript: row.setup_script,
    variableNames: row.env_var_names ?? [],
    isDefault: row.is_default,
    createdAt: isoTime(row.created_at),
    updatedAt: isoTime(row.updated_at),
  };
}

function ownerSql(owner: CloudCodeEnvironmentOwner, startIndex: number) {
  return {
    clause: `user_id = $${startIndex} and organization_id is not distinct from $${startIndex + 1}`,
    params: [owner.userId, owner.organizationId] as [string, string | null],
  };
}

function ownerLockKey(owner: CloudCodeEnvironmentOwner): string {
  return `${owner.organizationId ?? '-'}:${owner.userId}`;
}

function validateName(value: string): string {
  const name = value.trim();
  if (!name || name.length > CLOUD_CODE_ENVIRONMENT_LIMITS.name || name.includes('\0')) {
    throw new CloudCodeEnvironmentValidationError(
      `Name must be 1-${CLOUD_CODE_ENVIRONMENT_LIMITS.name} characters`,
    );
  }
  if (name.toLowerCase() === CLOUD_CODE_BUILT_IN_ENVIRONMENT.name.toLowerCase()) {
    throw new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_NAME_TAKEN);
  }
  return name;
}

function validateExtraHosts(value: unknown): string[] {
  try {
    return normalizeExtraEgressHosts(value);
  } catch (error) {
    if (error instanceof InvalidExtraEgressHostsError) {
      throw new CloudCodeEnvironmentValidationError(error.message);
    }
    throw error;
  }
}

function validateSetupScript(value: string): string {
  if (value.includes('\0')) {
    throw new CloudCodeEnvironmentValidationError('The setup script must be plain text');
  }
  if (Buffer.byteLength(value, 'utf8') > CLOUD_CODE_ENVIRONMENT_LIMITS.setupScriptBytes) {
    throw new CloudCodeEnvironmentValidationError(
      `The setup script can be at most ${CLOUD_CODE_ENVIRONMENT_LIMITS.setupScriptBytes / 1024} KB`,
    );
  }
  return value;
}

function assertFullNetworkAcknowledged(
  networkAccess: CloudCodeNetworkAccess | undefined,
  acknowledged: boolean | undefined,
): void {
  if (networkAccess === 'full' && acknowledged !== true) {
    throw new CloudCodeEnvironmentValidationError(
      CLOUD_CODE_ENVIRONMENT_FULL_NETWORK_UNACKNOWLEDGED,
    );
  }
}

function uniqueViolation(error: unknown): { constraint: unknown } | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return code === UNIQUE_VIOLATION ? { constraint } : null;
}

async function withOwnerLock<T>(
  db: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  work: (tx: DatabaseAdapter) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:cloud-code-environments:' || $1, 0))`,
        [ownerLockKey(owner)],
      );
      return work(tx);
    });
  } catch (error) {
    const violation = uniqueViolation(error);
    if (violation?.constraint === REQUEST_KEY) {
      throw new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_REQUEST_REUSED);
    }
    if (violation && (violation.constraint === undefined || violation.constraint === NAME_INDEX)) {
      throw new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_NAME_TAKEN);
    }
    throw error;
  }
}

async function assertNameIsFree(
  tx: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  name: string,
  exceptId: string | null,
): Promise<void> {
  const scoped = ownerSql(owner, 1);
  const rows = await tx.query<{ id: string }>(
    `select id
       from cloud_code_environments
      where ${scoped.clause}
        and lower(name) = lower($3)
        and id is distinct from $4
      limit 1`,
    [...scoped.params, name, exceptId],
  );
  if (rows[0]) throw new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_NAME_TAKEN);
}

async function clearDefault(
  tx: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  exceptId: string | null,
): Promise<void> {
  const scoped = ownerSql(owner, 1);
  await tx.query(
    `update cloud_code_environments
        set is_default = false
      where ${scoped.clause}
        and is_default
        and id is distinct from $3`,
    [...scoped.params, exceptId],
  );
}

export async function listCloudCodeEnvironments(
  db: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
): Promise<CloudCodeEnvironment[]> {
  const scoped = ownerSql(owner, 1);
  const rows = await db.query<EnvironmentRow>(
    `select ${ENVIRONMENT_COLUMNS}
       from cloud_code_environments
      where ${scoped.clause}
      order by lower(name), created_at
      limit ${CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount}`,
    scoped.params,
  );
  return rows.map(mapCloudCodeEnvironment);
}

export interface CreatedCloudCodeEnvironment {
  environment: CloudCodeEnvironment;
  reused: boolean;
}

export async function createCloudCodeEnvironment(
  db: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  input: CreateCloudCodeEnvironmentInput,
): Promise<CreatedCloudCodeEnvironment> {
  const name = validateName(input.name);
  assertFullNetworkAcknowledged(input.networkAccess, input.fullNetworkAcknowledged);
  const extraHosts = validateExtraHosts(input.extraHosts);
  const setupScript = validateSetupScript(input.setupScript ?? '');
  const isDefault = input.isDefault === true;

  return withOwnerLock(db, owner, async (tx) => {
    const scoped = ownerSql(owner, 1);
    const existing = await tx.query<EnvironmentRow>(
      `select ${ENVIRONMENT_COLUMNS}
         from cloud_code_environments
        where ${scoped.clause} and request_id = $3
        limit 1`,
      [...scoped.params, input.requestId],
    );
    if (existing[0]) {
      return { environment: mapCloudCodeEnvironment(existing[0]), reused: true };
    }

    const counted = await tx.query<{ total: number | string }>(
      `select count(*) as total
         from cloud_code_environments
        where ${scoped.clause}`,
      scoped.params,
    );
    if (Number(counted[0]?.total ?? 0) >= CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount) {
      throw new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_LIMIT_REACHED);
    }
    await assertNameIsFree(tx, owner, name, null);
    if (isDefault) await clearDefault(tx, owner, null);

    const rows = await tx.query<EnvironmentRow>(
      `insert into cloud_code_environments
         (user_id, organization_id, request_id, name, network_access, extra_hosts,
          allow_package_managers, setup_script, is_default)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${ENVIRONMENT_COLUMNS}`,
      [
        owner.userId,
        owner.organizationId,
        input.requestId,
        name,
        input.networkAccess,
        extraHosts,
        input.allowPackageManagers ?? true,
        setupScript,
        isDefault,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('The environment insert returned no row');
    return { environment: mapCloudCodeEnvironment(row), reused: false };
  });
}

export async function updateCloudCodeEnvironment(
  db: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  environmentId: string,
  changes: UpdateCloudCodeEnvironmentInput,
): Promise<CloudCodeEnvironment> {
  if (!UUID_RE.test(environmentId)) throw new CloudCodeEnvironmentNotFoundError();
  const name = changes.name === undefined ? undefined : validateName(changes.name);
  assertFullNetworkAcknowledged(changes.networkAccess, changes.fullNetworkAcknowledged);
  const extraHosts =
    changes.extraHosts === undefined ? undefined : validateExtraHosts(changes.extraHosts);
  const setupScript =
    changes.setupScript === undefined ? undefined : validateSetupScript(changes.setupScript);

  return withOwnerLock(db, owner, async (tx) => {
    const scoped = ownerSql(owner, 2);
    const current = await tx.query<{ id: string }>(
      `select id
         from cloud_code_environments
        where id = $1 and ${scoped.clause}
        limit 1
        for update`,
      [environmentId, ...scoped.params],
    );
    if (!current[0]) throw new CloudCodeEnvironmentNotFoundError();
    if (name !== undefined) await assertNameIsFree(tx, owner, name, environmentId);
    if (changes.isDefault === true) await clearDefault(tx, owner, environmentId);

    const rows = await tx.query<EnvironmentRow>(
      `update cloud_code_environments
          set name = coalesce($4, name),
              network_access = coalesce($5, network_access),
              extra_hosts = coalesce($6::text[], extra_hosts),
              allow_package_managers = coalesce($7, allow_package_managers),
              setup_script = coalesce($8, setup_script),
              is_default = coalesce($9, is_default)
        where id = $1 and ${scoped.clause}
        returning ${ENVIRONMENT_COLUMNS}`,
      [
        environmentId,
        ...scoped.params,
        name ?? null,
        changes.networkAccess ?? null,
        extraHosts ?? null,
        changes.allowPackageManagers ?? null,
        setupScript ?? null,
        changes.isDefault ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new CloudCodeEnvironmentNotFoundError();
    return mapCloudCodeEnvironment(row);
  });
}

export async function deleteCloudCodeEnvironment(
  db: DatabaseAdapter,
  owner: CloudCodeEnvironmentOwner,
  environmentId: string,
): Promise<void> {
  if (!UUID_RE.test(environmentId)) throw new CloudCodeEnvironmentNotFoundError();
  const scoped = ownerSql(owner, 2);
  const rows = await db.query<{ id: string }>(
    `delete from cloud_code_environments
      where id = $1 and ${scoped.clause}
      returning id`,
    [environmentId, ...scoped.params],
  );
  if (!rows[0]) throw new CloudCodeEnvironmentNotFoundError();
}

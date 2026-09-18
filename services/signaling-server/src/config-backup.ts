import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CONFIG_BACKUP_RETENTION } from './constants.js';
import { releaseIdentity, type ReleaseIdentity, type ServiceEnvironment } from './release.js';

export interface ConfigVariable {
  name: string;
  required: boolean;
  secret: boolean;
  present: boolean;
  /** Set only for non-secret variables. A secret is identified by its digest. */
  value?: string;
  digest?: string;
}

export interface ConfigBackup {
  capturedAt: string;
  deployment: ReleaseIdentity;
  variables: ConfigVariable[];
  missingRequired: string[];
}

interface ConfigVariableSpec {
  name: string;
  required: boolean;
  secret: boolean;
}

/**
 * Every variable the deployed service reads. A variable that is absent here is
 * absent from the backup, so adding one to the code without adding it here is
 * the one way a restore can come back incomplete.
 */
export const CONFIG_VARIABLES: readonly ConfigVariableSpec[] = [
  { name: 'NODE_ENV', required: true, secret: false },
  { name: 'SIGNALING_HOST', required: false, secret: false },
  { name: 'PORT', required: false, secret: false },
  { name: 'SIGNALING_PORT', required: false, secret: false },
  { name: 'SIGNALING_WS_PATH', required: false, secret: false },
  { name: 'SIGNALING_HTTP_URL', required: false, secret: false },
  { name: 'SIGNALING_WS_URL', required: false, secret: false },
  { name: 'SIGNALING_CANONICAL_URL', required: true, secret: false },
  { name: 'SIGNALING_FAILOVER_URLS', required: false, secret: false },
  { name: 'ALLOWED_ORIGINS', required: true, secret: false },
  { name: 'TRUST_PROXY', required: false, secret: false },
  { name: 'TRUSTED_PROXY_HOPS', required: false, secret: false },
  { name: 'LOG_LEVEL', required: false, secret: false },
  { name: 'SIGNALING_REQUIRE_PAIR_TOKEN', required: false, secret: false },
  { name: 'SIGNALING_PAIRING_TTL', required: false, secret: false },
  { name: 'ENABLE_HSTS', required: false, secret: false },
  { name: 'HSTS_MAX_AGE', required: false, secret: false },
  { name: 'HSTS_INCLUDE_SUBDOMAINS', required: false, secret: false },
  { name: 'HSTS_PRELOAD', required: false, secret: false },
  { name: 'WS_CONNECTION_LIMIT', required: false, secret: false },
  { name: 'WS_MESSAGE_LIMIT', required: false, secret: false },
  { name: 'WS_RATE_LIMIT_WINDOW_MS', required: false, secret: false },
  { name: 'WS_BLACKLIST_DURATION_MS', required: false, secret: false },
  { name: 'WS_BLACKLIST_THRESHOLD', required: false, secret: false },
  { name: 'MAX_AUTH_FAILURES', required: false, secret: false },
  { name: 'AUTH_LOCKOUT_DURATION_MS', required: false, secret: false },
  { name: 'AUTH_FAILURE_WINDOW_MS', required: false, secret: false },
  { name: 'SIGNALING_CONFIG_BACKUP_DIR', required: false, secret: false },
  { name: 'NEON_DATABASE_URL', required: true, secret: true },
  { name: 'SIGNALING_INTERNAL_SECRET', required: true, secret: true },
  { name: 'ADMIN_API_KEY', required: false, secret: true },
];

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * A restorable record of the deployed configuration. Secret values are replaced
 * by a truncated digest: enough to prove a restored value matches what was
 * running, never enough to reconstruct it.
 */
export function buildConfigBackup(
  env: ServiceEnvironment = process.env,
  now: Date = new Date(),
): ConfigBackup {
  const variables: ConfigVariable[] = CONFIG_VARIABLES.map((spec) => {
    const raw = env[spec.name]?.trim();
    const present = raw !== undefined && raw.length > 0;
    const variable: ConfigVariable = {
      name: spec.name,
      required: spec.required,
      secret: spec.secret,
      present,
    };
    if (!present) return variable;
    if (spec.secret) {
      variable.digest = digest(raw);
    } else {
      variable.value = raw;
    }
    return variable;
  });

  return {
    capturedAt: now.toISOString(),
    deployment: releaseIdentity(env),
    variables,
    missingRequired: variables
      .filter((variable) => variable.required && !variable.present)
      .map((variable) => variable.name),
  };
}

export function configBackupDrift(previous: ConfigBackup, current: ConfigBackup): string[] {
  const before = new Map(previous.variables.map((variable) => [variable.name, variable]));
  const drift: string[] = [];
  for (const variable of current.variables) {
    const prior = before.get(variable.name);
    if (!prior) {
      drift.push(variable.name);
      continue;
    }
    if (prior.present !== variable.present) {
      drift.push(variable.name);
      continue;
    }
    if (prior.value !== variable.value || prior.digest !== variable.digest) {
      drift.push(variable.name);
    }
  }
  for (const name of before.keys()) {
    if (!current.variables.some((variable) => variable.name === name)) drift.push(name);
  }
  return drift.sort();
}

const BACKUP_FILE_PREFIX = 'config-backup-';
const BACKUP_FILE_SUFFIX = '.json';

async function listBackups(directory: string): Promise<string[]> {
  const entries = await readdir(directory).catch(() => [] as string[]);
  return entries
    .filter((name) => name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX))
    .sort();
}

export async function readLatestConfigBackup(directory: string): Promise<ConfigBackup | null> {
  const files = await listBackups(directory);
  const latest = files.length > 0 ? files[files.length - 1] : undefined;
  if (!latest) return null;
  try {
    return JSON.parse(await readFile(path.join(directory, latest), 'utf8')) as ConfigBackup;
  } catch {
    return null;
  }
}

export interface PersistedConfigBackup {
  file: string;
  backup: ConfigBackup;
  drift: string[];
}

/**
 * Writes one snapshot per start and keeps the last few, so a deploy that
 * changed a variable leaves a record of what the previous one was running.
 */
export async function persistConfigBackup(
  directory: string,
  env: ServiceEnvironment = process.env,
  now: Date = new Date(),
): Promise<PersistedConfigBackup> {
  const previous = await readLatestConfigBackup(directory);
  const backup = buildConfigBackup(env, now);
  await mkdir(directory, { recursive: true });
  const file = path.join(
    directory,
    `${BACKUP_FILE_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}${BACKUP_FILE_SUFFIX}`,
  );
  await writeFile(file, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });

  const files = await listBackups(directory);
  for (const stale of files.slice(0, Math.max(0, files.length - CONFIG_BACKUP_RETENTION))) {
    await rm(path.join(directory, stale), { force: true });
  }

  return { file, backup, drift: previous ? configBackupDrift(previous, backup) : [] };
}

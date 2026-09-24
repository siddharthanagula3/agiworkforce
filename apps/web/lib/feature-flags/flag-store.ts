import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

import { readFeatureFlagConfig } from './flag-config';
import {
  FlagRuleSchema,
  type FlagDefinition,
  type FlagDefinitionInput,
  type FlagOverride,
  type FlagOverrideInput,
} from './flag-definition';

const DEFINITION_CACHE_TTL_MS = readFeatureFlagConfig().definitionCacheTtlMs;

interface DefinitionRow {
  key: string;
  description: string;
  kill_switch: boolean;
  variants: string[];
  default_variant: string;
  rules: unknown;
  expires_at: string | Date | null;
  maturity: FlagDefinitionInput['maturity'] | null;
  release_channel: FlagDefinitionInput['channel'] | null;
  availability: FlagDefinitionInput['availability'] | null;
  owner_name: string | null;
  archived_at: string | Date | null;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
}

interface OverrideRow {
  flag_name: string;
  user_id: string | null;
  organization_id: string | null;
  variant: string | null;
  enabled: boolean;
  expires_at: string | Date | null;
}

const StoredRulesSchema = z.array(FlagRuleSchema);

function isoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDefinition(row: DefinitionRow): FlagDefinition | null {
  const rules = StoredRulesSchema.safeParse(row.rules);
  if (!rules.success) {
    logger.error(
      { flagKey: row.key, issues: rules.error.issues.length },
      '[feature-flags] stored rules do not parse; the flag is left out of evaluation',
    );
    return null;
  }
  return {
    key: row.key,
    description: row.description,
    killSwitch: row.kill_switch,
    variants: row.variants,
    defaultVariant: row.default_variant,
    rules: rules.data,
    expiresAt: isoOrNull(row.expires_at),
    ...(row.maturity === null ? {} : { maturity: row.maturity }),
    ...(row.release_channel === null ? {} : { channel: row.release_channel }),
    ...(row.availability === null ? {} : { availability: row.availability }),
    ...(row.owner_name === null ? {} : { owner: row.owner_name }),
    archivedAt: isoOrNull(row.archived_at),
    version: row.version,
    createdAt: isoOrNull(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function toOverride(row: OverrideRow): FlagOverride {
  const variant = row.variant ?? (row.enabled ? 'on' : 'off');
  return row.organization_id
    ? {
        flagKey: row.flag_name,
        subject: 'workspace',
        subjectId: row.organization_id,
        variant,
        expiresAt: isoOrNull(row.expires_at),
      }
    : {
        flagKey: row.flag_name,
        subject: 'user',
        subjectId: row.user_id ?? '',
        variant,
        expiresAt: isoOrNull(row.expires_at),
      };
}

const DEFINITION_COLUMNS = `key, description, kill_switch, variants, default_variant, rules,
  expires_at, maturity, release_channel, availability, owner_name, archived_at, version,
  created_at, updated_at`;

let cachedDefinitions: { definitions: readonly FlagDefinition[]; expiresAtMs: number } | null =
  null;
let inFlightDefinitions: Promise<readonly FlagDefinition[]> | null = null;

export function resetFlagDefinitionCache(): void {
  cachedDefinitions = null;
  inFlightDefinitions = null;
}

export async function listFlagDefinitions(
  options: { includeArchived?: boolean } = {},
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition[]> {
  const rows = await db.query<DefinitionRow>(
    `select ${DEFINITION_COLUMNS}
       from public.feature_flag_definitions
      where $1::boolean or archived_at is null
      order by key asc`,
    [options.includeArchived === true],
  );
  return rows.map(toDefinition).filter((definition): definition is FlagDefinition => !!definition);
}

/**
 * Active definitions for the request path. Cached briefly per process, and an
 * unreadable table yields no flags rather than an error: every consumer treats
 * an absent flag as its safe default, so a store outage degrades to the
 * behaviour that shipped before the flag existed.
 */
export async function getActiveFlagDefinitions(
  nowMs: number = Date.now(),
): Promise<readonly FlagDefinition[]> {
  if (cachedDefinitions && cachedDefinitions.expiresAtMs > nowMs) {
    return cachedDefinitions.definitions;
  }
  // One read per expiry, taken with no await before it: concurrent requests
  // share it instead of each querying the table at once.
  inFlightDefinitions ??= readActiveFlagDefinitions(nowMs).finally(() => {
    inFlightDefinitions = null;
  });
  return inFlightDefinitions;
}

async function readActiveFlagDefinitions(nowMs: number): Promise<readonly FlagDefinition[]> {
  try {
    const definitions = await listFlagDefinitions();
    cachedDefinitions = { definitions, expiresAtMs: nowMs + DEFINITION_CACHE_TTL_MS };
    return definitions;
  } catch (error) {
    logger.error({ error }, '[feature-flags] definitions unreadable; evaluating no flags');
    return [];
  }
}

export async function getSubjectOverrides(
  userId: string,
  workspaceId: string | null,
  flagKeys: readonly string[],
): Promise<FlagOverride[]> {
  if (flagKeys.length === 0) return [];
  try {
    const rows = await getNeonDb().query<OverrideRow>(
      `select flag_name, user_id, organization_id, variant, enabled, expires_at
         from public.feature_flags
        where flag_name = any($3::text[])
          and (user_id = $1 or ($2::uuid is not null and organization_id = $2::uuid))
          and (expires_at is null or expires_at > now())`,
      [userId, workspaceId, flagKeys],
    );
    return rows.map(toOverride);
  } catch (error) {
    logger.error({ error }, '[feature-flags] overrides unreadable; evaluating rules only');
    return [];
  }
}

export async function getFlagDefinition(
  key: string,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `select ${DEFINITION_COLUMNS} from public.feature_flag_definitions where key = $1`,
    [key],
  );
  return row ? toDefinition(row) : null;
}

export async function insertFlagDefinition(
  input: FlagDefinitionInput,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `insert into public.feature_flag_definitions
       (key, description, kill_switch, variants, default_variant, rules, expires_at,
        maturity, release_channel, availability, owner_name)
     values ($1, $2, $3, $4::text[], $5, $6::jsonb, $7, $8, $9, $10, $11)
     on conflict (key) do nothing
     returning ${DEFINITION_COLUMNS}`,
    [
      input.key,
      input.description,
      input.killSwitch,
      input.variants,
      input.defaultVariant,
      JSON.stringify(input.rules),
      input.expiresAt,
      input.maturity ?? null,
      input.channel ?? null,
      input.availability ?? null,
      input.owner ?? null,
    ],
  );
  resetFlagDefinitionCache();
  return row ? toDefinition(row) : null;
}

/**
 * The definition an operator action needs in place before it can write an
 * override against it. Creating it is idempotent, so the first lockdown of a
 * fresh deployment does not fail for want of a flag nobody created by hand.
 */
export async function ensureFlagDefinition(
  input: FlagDefinitionInput,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const existing = await getFlagDefinition(input.key, db);
  if (existing) {
    return existing.archivedAt === null ? existing : restoreFlagDefinition(input.key, db);
  }
  return (await insertFlagDefinition(input, db)) ?? getFlagDefinition(input.key, db);
}

export async function updateFlagDefinition(
  input: FlagDefinitionInput,
  expectedVersion: number,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `update public.feature_flag_definitions
        set description = $2, kill_switch = $3, variants = $4::text[], default_variant = $5,
            rules = $6::jsonb, expires_at = $7, maturity = $8, release_channel = $9,
            availability = $10, owner_name = $11, version = version + 1, updated_at = now()
      where key = $1 and version = $12 and archived_at is null
      returning ${DEFINITION_COLUMNS}`,
    [
      input.key,
      input.description,
      input.killSwitch,
      input.variants,
      input.defaultVariant,
      JSON.stringify(input.rules),
      input.expiresAt,
      input.maturity ?? null,
      input.channel ?? null,
      input.availability ?? null,
      input.owner ?? null,
      expectedVersion,
    ],
  );
  resetFlagDefinitionCache();
  return row ? toDefinition(row) : null;
}

export async function setFlagKillSwitch(
  key: string,
  killSwitch: boolean,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `update public.feature_flag_definitions
        set kill_switch = $2, version = version + 1, updated_at = now()
      where key = $1 and archived_at is null
      returning ${DEFINITION_COLUMNS}`,
    [key, killSwitch],
  );
  resetFlagDefinitionCache();
  return row ? toDefinition(row) : null;
}

export async function archiveFlagDefinition(
  key: string,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `update public.feature_flag_definitions
        set archived_at = now(), version = version + 1, updated_at = now()
      where key = $1 and archived_at is null
      returning ${DEFINITION_COLUMNS}`,
    [key],
  );
  resetFlagDefinitionCache();
  return row ? toDefinition(row) : null;
}

export async function restoreFlagDefinition(
  key: string,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagDefinition | null> {
  const [row] = await db.query<DefinitionRow>(
    `update public.feature_flag_definitions
        set archived_at = null, version = version + 1, updated_at = now()
      where key = $1 and archived_at is not null
      returning ${DEFINITION_COLUMNS}`,
    [key],
  );
  resetFlagDefinitionCache();
  return row ? toDefinition(row) : null;
}

export async function listFlagOverrides(
  key: string,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FlagOverride[]> {
  const rows = await db.query<OverrideRow>(
    `select flag_name, user_id, organization_id, variant, enabled, expires_at
       from public.feature_flags
      where flag_name = $1
      order by organization_id nulls last, user_id`,
    [key],
  );
  return rows.map(toOverride);
}

export async function upsertFlagOverride(
  key: string,
  input: FlagOverrideInput,
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  const enabled = input.variant !== 'off';
  if (input.subject === 'workspace') {
    await db.execute(
      `insert into public.feature_flags (organization_id, flag_name, enabled, variant, expires_at)
       values ($1::uuid, $2, $3, $4, $5)
       on conflict (organization_id, flag_name) where organization_id is not null
       do update set enabled = excluded.enabled, variant = excluded.variant,
                     expires_at = excluded.expires_at, updated_at = now()`,
      [input.subjectId, key, enabled, input.variant, input.expiresAt],
    );
    return;
  }
  await db.execute(
    `insert into public.feature_flags (user_id, flag_name, enabled, variant, expires_at)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, flag_name)
     do update set enabled = excluded.enabled, variant = excluded.variant,
                   expires_at = excluded.expires_at, updated_at = now()`,
    [input.subjectId, key, enabled, input.variant, input.expiresAt],
  );
}

export async function deleteFlagOverride(
  key: string,
  subject: FlagOverrideInput['subject'],
  subjectId: string,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number> {
  return subject === 'workspace'
    ? db.execute(
        `delete from public.feature_flags where flag_name = $1 and organization_id = $2::uuid`,
        [key, subjectId],
      )
    : db.execute(`delete from public.feature_flags where flag_name = $1 and user_id = $2`, [
        key,
        subjectId,
      ]);
}

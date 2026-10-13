import 'server-only';

import { randomInt } from 'node:crypto';

import type {
  OperatorUpgradeAccessCode,
  OperatorUpgradeAccessCodeCreate,
  OperatorUpgradeAccessState,
} from '@agiworkforce/cloud-contracts/waitlist';

import { createError } from '@/lib/errors';
import { BILLING_UPGRADES_OPEN_FLAG_KEY } from '@/lib/feature-flags/billing-upgrades';
import {
  BILLING_UPGRADES_CLOSED_STATUS,
  BILLING_UPGRADES_OPENED_STATUS,
} from '@/lib/feature-flags/flag-admin-service';
import { FLAG_ON_VARIANT, type FlagDefinition } from '@/lib/feature-flags/flag-definition';
import { getFlagDefinition } from '@/lib/feature-flags/flag-store';
import {
  UPGRADE_ACCESS_INVITE_KIND,
  billingUpgradesForcedOpen,
} from '@/lib/server/billing-waitlist-access';
import { getNeonDb } from '@/lib/server/neon-db';

export const UPGRADE_ACCESS_CODE_LIST_LIMIT = 500;

const GENERATED_CODE_LENGTH = 12;
const GENERATED_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const UNIQUE_VIOLATION = '23505';
const SWITCH_CHANGE_STATUSES = [BILLING_UPGRADES_OPENED_STATUS, BILLING_UPGRADES_CLOSED_STATUS];

interface SwitchChangeRow {
  user_id: string | null;
  created_at: Date | string;
  status: string | null;
}

interface AccessCodeRow {
  id: string;
  code: string;
  max_uses: number | string | null;
  current_uses: number | string | null;
  expires_at: Date | string | null;
  is_active: boolean;
  note: string | null;
  created_at: Date | string;
  created_by: string | null;
}

const ACCESS_CODE_COLUMNS = `id, code, max_uses, current_uses, expires_at, is_active,
  metadata->>'note' as note, created_at, created_by`;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function switchOpen(definition: FlagDefinition | null, nowMs: number): boolean {
  if (!definition || definition.archivedAt !== null || definition.killSwitch) return false;
  if (definition.expiresAt !== null && Date.parse(definition.expiresAt) <= nowMs) return false;
  return definition.defaultVariant === FLAG_ON_VARIANT;
}

export async function readUpgradeAccessState(
  nowMs: number = Date.now(),
): Promise<OperatorUpgradeAccessState> {
  const [definition, changes] = await Promise.all([
    getFlagDefinition(BILLING_UPGRADES_OPEN_FLAG_KEY),
    getNeonDb().query<SwitchChangeRow>(
      `select user_id, created_at, details->>'status' as status
         from public.security_audit_logs
        where event_type = 'feature_flag_changed'
          and details->>'resource_id' = $1
          and details->>'status' = any($2::text[])
        order by created_at desc
        limit 1`,
      [BILLING_UPGRADES_OPEN_FLAG_KEY, SWITCH_CHANGE_STATUSES],
    ),
  ]);
  const isSwitchOpen = switchOpen(definition, nowMs);
  const forcedOpenByEnvironment = billingUpgradesForcedOpen();
  const [lastChange] = changes;
  return {
    open: forcedOpenByEnvironment || isSwitchOpen,
    switchOpen: isSwitchOpen,
    forcedOpenByEnvironment,
    targetingRules:
      definition && definition.archivedAt === null && !definition.killSwitch
        ? definition.rules.length
        : 0,
    lastChange: lastChange
      ? {
          opened: lastChange.status === BILLING_UPGRADES_OPENED_STATUS,
          changedAt: toIso(lastChange.created_at),
          changedBy: lastChange.user_id,
        }
      : null,
  };
}

function toAccessCode(row: AccessCodeRow): OperatorUpgradeAccessCode {
  return {
    id: row.id,
    code: row.code,
    maxRedemptions: Number(row.max_uses) || 0,
    redemptions: Number(row.current_uses) || 0,
    expiresAt: row.expires_at === null ? null : toIso(row.expires_at),
    active: row.is_active,
    note: row.note,
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
  };
}

export async function listUpgradeAccessCodes(): Promise<{
  codes: OperatorUpgradeAccessCode[];
  truncated: boolean;
}> {
  const rows = await getNeonDb().query<AccessCodeRow>(
    `select ${ACCESS_CODE_COLUMNS}
       from public.beta_invites
      order by created_at desc, id desc
      limit $1`,
    [UPGRADE_ACCESS_CODE_LIST_LIMIT + 1],
  );
  return {
    codes: rows.slice(0, UPGRADE_ACCESS_CODE_LIST_LIMIT).map(toAccessCode),
    truncated: rows.length > UPGRADE_ACCESS_CODE_LIST_LIMIT,
  };
}

export function generateUpgradeAccessCode(): string {
  return Array.from(
    { length: GENERATED_CODE_LENGTH },
    () => GENERATED_CODE_ALPHABET[randomInt(GENERATED_CODE_ALPHABET.length)],
  ).join('');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * A code that only opens the upgrade gate. Its kind is written on the row
 * because the same table backs trial offers: /api/claim-offer refuses a row of
 * this kind, so handing somebody upgrade access never hands them a free plan.
 */
export async function createUpgradeAccessCode(
  operatorUserId: string,
  input: OperatorUpgradeAccessCodeCreate,
  nowMs: number = Date.now(),
): Promise<OperatorUpgradeAccessCode> {
  if (input.expiresAt && Date.parse(input.expiresAt) <= nowMs) {
    throw createError.badRequest('The expiry must be in the future.');
  }
  const code = input.code ?? generateUpgradeAccessCode();
  const db = getNeonDb();
  const [taken] = await db.query<{ taken: boolean }>(
    `select exists(select 1 from public.beta_invites where lower(code) = lower($1)) as taken`,
    [code],
  );
  if (taken?.taken) throw createError.conflict('That code already exists. Choose another.');

  let rows: AccessCodeRow[];
  try {
    rows = await db.query<AccessCodeRow>(
      `insert into public.beta_invites
         (code, max_uses, expires_at, is_active, created_by, metadata, plan_tier, trial_days)
       values ($1, $2, $3, true, $4, $5::jsonb, 'free', 0)
       returning ${ACCESS_CODE_COLUMNS}`,
      [
        code,
        input.maxRedemptions,
        input.expiresAt ?? null,
        operatorUserId,
        JSON.stringify({
          kind: UPGRADE_ACCESS_INVITE_KIND,
          ...(input.note ? { note: input.note } : {}),
        }),
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict('That code already exists. Choose another.');
    }
    throw error;
  }
  const [created] = rows;
  if (!created) throw createError.internal('The access code was not created.');
  return toAccessCode(created);
}

export async function disableUpgradeAccessCode(id: string): Promise<OperatorUpgradeAccessCode> {
  const [disabled] = await getNeonDb().query<AccessCodeRow>(
    `update public.beta_invites
        set is_active = false
      where id = $1 and is_active = true
      returning ${ACCESS_CODE_COLUMNS}`,
    [id],
  );
  if (!disabled) throw createError.notFound('No active access code by that id');
  return toAccessCode(disabled);
}

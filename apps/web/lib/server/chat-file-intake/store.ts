import 'server-only';

import {
  chatFileIntakeLeaseMs,
  type ChatFileIntakeCancelReason,
  type ChatFileIntakeFailureCode,
  type ChatFileIntakeRefusalCode,
  type ChatFileIntakeState,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import {
  MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  ownerIsActiveWorkspaceMemberSql,
} from '@/lib/server/workspace-scope';
import { refundDailyLargeFileBytes } from './quotas';

export type IntakeDb = Pick<DatabaseAdapter, 'query'>;

export const LEASED_INTAKE_STATES = ['uploaded', 'inspecting', 'scanning', 'sealing'] as const;
export const NON_TERMINAL_INTAKE_STATES = ['awaiting_parts', ...LEASED_INTAKE_STATES] as const;
export const TERMINAL_INTAKE_STATES = ['sealed', 'rejected', 'failed', 'cancelled'] as const;

export interface ChatFileIntakeRow {
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  temporaryChat: boolean;
  fileName: string;
  mimeType: string;
  byteCount: number;
  declaredSha256: string;
  stagingKey: string;
  multipartUploadId: string | null;
  partBytes: number | null;
  state: ChatFileIntakeState;
  refusalCode: ChatFileIntakeRefusalCode | null;
  failureCode: ChatFileIntakeFailureCode | null;
  cancelReason: ChatFileIntakeCancelReason | null;
  attempts: number;
  firstSubmittedAt: number | null;
  scanBudgetWaitMs: number;
  sealingEnteredAt: number | null;
  scanJobId: string | null;
  workflowRunId: string | null;
  etag: string | null;
  mediaAssetId: string | null;
  dailyBytesCharged: number;
  bytesRefundedAt: number | null;
  leaseUntil: number | null;
  lastPartRequestAt: number | null;
  stateChangedAt: number;
  objectsPurgedAt: number | null;
  createdAt: number;
}

export type IntakeEnding =
  | { state: 'rejected'; refusalCode: ChatFileIntakeRefusalCode }
  | { state: 'failed'; failureCode: ChatFileIntakeFailureCode }
  | { state: 'cancelled'; cancelReason: ChatFileIntakeCancelReason };

export interface EndedIntake {
  row: ChatFileIntakeRow;
  priorState: ChatFileIntakeState;
}

export interface RedispatchableIntake {
  id: string;
  userId: string;
  organizationId: string | null;
  state: ChatFileIntakeState;
}

interface RedispatchableIntakeRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  state: string;
}

function redispatchableIntake(row: RedispatchableIntakeRecord): RedispatchableIntake {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: nullableString(row.organization_id),
    state: String(row.state) as ChatFileIntakeState,
  };
}

function intakeColumns(alias: string): string {
  return [
    'id',
    'user_id',
    'organization_id',
    'conversation_id',
    'temporary_chat',
    'file_name',
    'mime_type',
    'byte_count',
    'declared_sha256',
    'staging_key',
    'multipart_upload_id',
    'part_bytes',
    'state',
    'refusal_code',
    'failure_code',
    'cancel_reason',
    'attempts',
    'first_submitted_at',
    'scan_budget_wait_ms',
    'sealing_entered_at',
    'scan_job_id',
    'workflow_run_id',
    'etag',
    'media_asset_id',
    'daily_bytes_charged',
    'bytes_refunded_at',
    'lease_until',
    'last_part_request_at',
    'state_changed_at',
    'objects_purged_at',
    'created_at',
  ]
    .map((column) => `${alias}.${column}`)
    .join(', ');
}

const COLUMNS = intakeColumns('i');

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function mapIntakeRow(row: Record<string, unknown>): ChatFileIntakeRow {
  return {
    id: String(row['id']),
    userId: String(row['user_id']),
    organizationId: nullableString(row['organization_id']),
    conversationId: nullableString(row['conversation_id']),
    temporaryChat: row['temporary_chat'] === true,
    fileName: String(row['file_name']),
    mimeType: String(row['mime_type']),
    byteCount: toNumber(row['byte_count']),
    declaredSha256: String(row['declared_sha256']),
    stagingKey: String(row['staging_key']),
    multipartUploadId: nullableString(row['multipart_upload_id']),
    partBytes: row['part_bytes'] === null ? null : toNumber(row['part_bytes']),
    state: String(row['state']) as ChatFileIntakeState,
    refusalCode: nullableString(row['refusal_code']) as ChatFileIntakeRefusalCode | null,
    failureCode: nullableString(row['failure_code']) as ChatFileIntakeFailureCode | null,
    cancelReason: nullableString(row['cancel_reason']) as ChatFileIntakeCancelReason | null,
    attempts: toNumber(row['attempts']),
    firstSubmittedAt: toMs(row['first_submitted_at']),
    scanBudgetWaitMs: toNumber(row['scan_budget_wait_ms']),
    sealingEnteredAt: toMs(row['sealing_entered_at']),
    scanJobId: nullableString(row['scan_job_id']),
    workflowRunId: nullableString(row['workflow_run_id']),
    etag: nullableString(row['etag']),
    mediaAssetId: nullableString(row['media_asset_id']),
    dailyBytesCharged: toNumber(row['daily_bytes_charged']),
    bytesRefundedAt: toMs(row['bytes_refunded_at']),
    leaseUntil: toMs(row['lease_until']),
    lastPartRequestAt: toMs(row['last_part_request_at']),
    stateChangedAt: toMs(row['state_changed_at']) ?? 0,
    objectsPurgedAt: toMs(row['objects_purged_at']),
    createdAt: toMs(row['created_at']) ?? 0,
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function intakeLeaseUntil(state: ChatFileIntakeState, nowMs: number): number {
  const leaseMs = chatFileIntakeLeaseMs(state);
  if (leaseMs === null) throw new RangeError(`${state} holds no lease.`);
  return nowMs + leaseMs;
}

function first(rows: Record<string, unknown>[]): ChatFileIntakeRow | null {
  const row = rows[0];
  return row ? mapIntakeRow(row) : null;
}

export interface InsertIntakeInput {
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  temporaryChat: boolean;
  fileName: string;
  mimeType: string;
  byteCount: number;
  declaredSha256: string;
  stagingKey: string;
  multipartUploadId: string;
  partBytes: number;
  dailyBytesCharged: number;
  nowMs: number;
}

export async function insertIntake(
  db: IntakeDb,
  input: InsertIntakeInput,
): Promise<ChatFileIntakeRow> {
  const rows = await db.query<Record<string, unknown>>(
    `insert into public.chat_file_intakes as i
       (user_id, organization_id, conversation_id, temporary_chat, file_name, mime_type,
        byte_count, declared_sha256, staging_key, multipart_upload_id, part_bytes,
        daily_bytes_charged, last_part_request_at, state_changed_at, created_at)
     values ($1, $2::uuid, $3::uuid, $4::boolean, $5, $6, $7::bigint, $8, $9, $10, $11::integer,
       $12::bigint, $13::timestamptz, $13::timestamptz, $13::timestamptz)
     returning ${COLUMNS}`,
    [
      input.userId,
      input.organizationId,
      input.conversationId,
      input.temporaryChat,
      input.fileName,
      input.mimeType,
      input.byteCount,
      input.declaredSha256.toLowerCase(),
      input.stagingKey,
      input.multipartUploadId,
      input.partBytes,
      input.dailyBytesCharged,
      iso(input.nowMs),
    ],
  );
  const row = first(rows);
  if (!row) throw new Error('The chat file intake insert returned no row.');
  return row;
}

export async function touchPartRequest(
  db: IntakeDb,
  input: { userId: string; stagingKey: string; nowMs: number },
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update public.chat_file_intakes
        set last_part_request_at = $3::timestamptz
      where staging_key = $2
        and user_id = $1
        and state = 'awaiting_parts'
      returning id`,
    [input.userId, input.stagingKey, iso(input.nowMs)],
  );
  return rows.length > 0;
}

export async function markUploaded(
  db: IntakeDb,
  input: { userId: string; stagingKey: string; nowMs: number },
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set state = 'uploaded',
            lease_until = $4::timestamptz,
            state_changed_at = $3::timestamptz
      where i.staging_key = $2
        and i.user_id = $1
        and i.state = 'awaiting_parts'
      returning ${COLUMNS}`,
    [
      input.userId,
      input.stagingKey,
      iso(input.nowMs),
      iso(intakeLeaseUntil('uploaded', input.nowMs)),
    ],
  );
  return first(rows);
}

export async function readIntakeStatus(
  db: IntakeDb,
  input: { userId: string; intakeId: string },
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${COLUMNS}
       from public.chat_file_intakes i
      where i.id = $2::uuid
        and i.user_id = $1
      limit 1`,
    [input.userId, input.intakeId],
  );
  return first(rows);
}

export async function countInFlightIntakes(
  db: IntakeDb,
  input: { userId: string },
): Promise<number> {
  const [row] = await db.query<{ in_flight: number | string }>(
    `select count(*)::int as in_flight
       from public.chat_file_intakes
      where user_id = $1
        and state = any($2::text[])`,
    [input.userId, NON_TERMINAL_INTAKE_STATES],
  );
  return toNumber(row?.in_flight ?? 0);
}

export async function sumInFlightIntakeBytes(
  db: IntakeDb,
  input: { userId: string; organizationId: string | null },
): Promise<number> {
  const [row] = await db.query<{ declared: number | string }>(
    `select coalesce(sum(byte_count), 0)::bigint as declared
       from public.chat_file_intakes
      where user_id = $1
        and organization_id is not distinct from $2::uuid
        and state = any($3::text[])`,
    [input.userId, input.organizationId, NON_TERMINAL_INTAKE_STATES],
  );
  return toNumber(row?.declared ?? 0);
}

/** A statement keyed by intake id also names the row's owner. */
type Owned<T> = T & { userId: string };

export interface ClaimIntakeInput {
  intakeId: string;
  runId: string;
  to: 'inspecting' | 'scanning' | 'sealing';
  from: readonly ChatFileIntakeState[];
  nowMs: number;
}

/**
 * The one compare-and-set into a step's state. It accepts the state before the
 * step, or the step's own state, and either only when this run holds it or its
 * lease has passed (`uploaded` is held by no run). Entering `scanning` stamps
 * the first submit once; entering `sealing` stamps the seal once.
 */
export async function claimIntakeState(
  db: IntakeDb,
  input: Owned<ClaimIntakeInput>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set state = $2,
            workflow_run_id = $3,
            lease_until = $5::timestamptz,
            state_changed_at = case when i.state = $2 then i.state_changed_at else $4::timestamptz end,
            first_submitted_at = case
              when $2 = 'scanning' then coalesce(i.first_submitted_at, $4::timestamptz)
              else i.first_submitted_at end,
            sealing_entered_at = case
              when $2 = 'sealing' then coalesce(i.sealing_entered_at, $4::timestamptz)
              else i.sealing_entered_at end
      where i.id = $1::uuid
        and i.user_id = $7
        and (i.state = $2 or i.state = any($6::text[]))
        and (
          i.state = 'uploaded'
          or i.workflow_run_id is not distinct from $3
          or i.lease_until < $4::timestamptz
        )
      returning ${COLUMNS}`,
    [
      input.intakeId,
      input.to,
      input.runId,
      iso(input.nowMs),
      iso(intakeLeaseUntil(input.to, input.nowMs)),
      input.from,
      input.userId,
    ],
  );
  return first(rows);
}

export async function renewIntakeLease(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; state: ChatFileIntakeState; nowMs: number }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set lease_until = $4::timestamptz
      where i.id = $1::uuid
        and i.user_id = $5
        and i.state = $2
        and i.workflow_run_id = $3
      returning ${COLUMNS}`,
    [
      input.intakeId,
      input.state,
      input.runId,
      iso(intakeLeaseUntil(input.state, input.nowMs)),
      input.userId,
    ],
  );
  return first(rows);
}

export async function recordInspectedEtag(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; etag: string }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set etag = $3
      where i.id = $1::uuid
        and i.user_id = $4
        and i.state = 'inspecting'
        and i.workflow_run_id = $2
      returning ${COLUMNS}`,
    [input.intakeId, input.runId, input.etag, input.userId],
  );
  return first(rows);
}

/** One more attempt used. `jobId` is the admitted scan, or null when the submit itself failed. */
export async function recordScanAttempt(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; attemptsBefore: number; jobId: string | null }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set attempts = i.attempts + 1,
            scan_job_id = $4
      where i.id = $1::uuid
        and i.user_id = $5
        and i.state = 'scanning'
        and i.workflow_run_id = $2
        and i.attempts = $3::integer
      returning ${COLUMNS}`,
    [input.intakeId, input.runId, input.attemptsBefore, input.jobId, input.userId],
  );
  return first(rows);
}

export async function addScanBudgetWait(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; waitMs: number; capMs: number }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set scan_budget_wait_ms = least(i.scan_budget_wait_ms + $3::integer, $4::integer)
      where i.id = $1::uuid
        and i.user_id = $5
        and i.state = 'scanning'
        and i.workflow_run_id = $2
      returning ${COLUMNS}`,
    [input.intakeId, input.runId, input.waitMs, input.capMs, input.userId],
  );
  return first(rows);
}

/** A seal whose verdict lookup answered `unknown` hands the row back to the scan. */
export async function returnSealingToScanning(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; nowMs: number }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set state = 'scanning',
            lease_until = $4::timestamptz,
            state_changed_at = $3::timestamptz
      where i.id = $1::uuid
        and i.user_id = $5
        and i.state = 'sealing'
        and i.workflow_run_id = $2
      returning ${COLUMNS}`,
    [
      input.intakeId,
      input.runId,
      iso(input.nowMs),
      iso(intakeLeaseUntil('scanning', input.nowMs)),
      input.userId,
    ],
  );
  return first(rows);
}

/** Runs inside the seal's transaction, after the media row is inserted. */
export async function completeSealing(
  db: IntakeDb,
  input: Owned<{ intakeId: string; runId: string; mediaAssetId: string; nowMs: number }>,
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set state = 'sealed',
            media_asset_id = $3::uuid,
            lease_until = null,
            state_changed_at = $4::timestamptz
      where i.id = $1::uuid
        and i.user_id = $5
        and i.state = 'sealing'
        and i.workflow_run_id = $2
      returning ${COLUMNS}`,
    [input.intakeId, input.runId, input.mediaAssetId, iso(input.nowMs), input.userId],
  );
  return first(rows);
}

/**
 * Ends a row from one of `from`. A run ends only a row it holds; a request or
 * the sweeper passes no run. The prior state comes back because the refund
 * rules depend on it.
 */
export async function endIntake(
  db: IntakeDb,
  input: {
    intakeId: string;
    runId: string | null;
    from: readonly ChatFileIntakeState[];
    ending: IntakeEnding;
    nowMs: number;
    userId?: string;
  },
): Promise<EndedIntake | null> {
  const { ending } = input;
  const rows = await db.query<Record<string, unknown>>(
    `with prior as (
       select id, state as prior_state
         from public.chat_file_intakes
        where id = $1::uuid
        for update
     )
     update public.chat_file_intakes as i
        set state = $3,
            refusal_code = $4,
            failure_code = $5,
            cancel_reason = $6,
            lease_until = null,
            state_changed_at = $7::timestamptz
       from prior
      where i.id = prior.id
        and prior.prior_state = any($8::text[])
        and ($2::text is null or i.workflow_run_id = $2)
        and ($9::text is null or i.user_id = $9)
      returning ${COLUMNS}, prior.prior_state`,
    [
      input.intakeId,
      input.runId,
      ending.state,
      ending.state === 'rejected' ? ending.refusalCode : null,
      ending.state === 'failed' ? ending.failureCode : null,
      ending.state === 'cancelled' ? ending.cancelReason : null,
      iso(input.nowMs),
      input.from,
      input.userId ?? null,
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return { row: mapIntakeRow(row), priorState: String(row['prior_state']) as ChatFileIntakeState };
}

export async function markIntakeObjectsPurged(
  db: IntakeDb,
  input: Owned<{ intakeId: string; nowMs: number }>,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update public.chat_file_intakes
        set objects_purged_at = $2::timestamptz
      where id = $1::uuid
        and user_id = $4
        and objects_purged_at is null
        and state = any($3::text[])
      returning id`,
    [input.intakeId, iso(input.nowMs), TERMINAL_INTAKE_STATES, input.userId],
  );
  return rows.length > 0;
}

/**
 * Marks the row refunded once and gives back at most what was charged, to the
 * day it was charged on. The mark comes first, so a refund is never given
 * twice; a counter that fails after it loses that refund, which the spec
 * accepts.
 */
export async function refundIntakeDailyBytes(
  db: IntakeDb,
  input: Owned<{ intakeId: string; bytes: number; nowMs: number }>,
): Promise<number> {
  const rows = await db.query<{
    user_id: string;
    daily_bytes_charged: number | string;
    created_at: string | Date;
  }>(
    `update public.chat_file_intakes
        set bytes_refunded_at = $2::timestamptz
      where id = $1::uuid
        and user_id = $3
        and bytes_refunded_at is null
        and daily_bytes_charged > 0
      returning user_id, daily_bytes_charged, created_at`,
    [input.intakeId, iso(input.nowMs), input.userId],
  );
  const row = rows[0];
  if (!row) return 0;
  const bytes = Math.min(Math.max(0, Math.floor(input.bytes)), toNumber(row.daily_bytes_charged));
  if (bytes === 0) return 0;
  const refunded = await refundDailyLargeFileBytes({
    userId: String(row.user_id),
    bytes,
    chargedAtMs: toMs(row.created_at) ?? input.nowMs,
  });
  return refunded ? bytes : 0;
}

/**
 * The session `DELETE` of a `chat-large-file` upload, after the route listed
 * the stored parts and aborted the upload. Only an `awaiting_parts` row is
 * ended: it gives back the declared bytes the parts did not store and frees
 * its slot at once. Its staging key is purged by the sweeper.
 */
export async function cancelIntakeByStagingKey(
  db: IntakeDb,
  input: { userId: string; stagingKey: string; storedBytes: number; nowMs: number },
): Promise<ChatFileIntakeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `update public.chat_file_intakes as i
        set state = 'cancelled',
            cancel_reason = 'client',
            lease_until = null,
            state_changed_at = $3::timestamptz
      where i.staging_key = $2
        and i.user_id = $1
        and i.state = 'awaiting_parts'
      returning ${COLUMNS}`,
    [input.userId, input.stagingKey, iso(input.nowMs)],
  );
  const row = first(rows);
  if (!row) return null;
  await refundIntakeDailyBytes(db, {
    userId: row.userId,
    intakeId: row.id,
    bytes: row.byteCount - Math.max(0, input.storedBytes),
    nowMs: input.nowMs,
  });
  return row;
}

export async function hasOtherScanningIntake(
  db: IntakeDb,
  input: { userId: string; intakeId: string },
): Promise<boolean> {
  const [row] = await db.query<{ busy: boolean }>(
    `select exists (
       select 1
         from public.chat_file_intakes
        where user_id = $1
          and id <> $2::uuid
          and state = 'scanning'
     ) as busy`,
    [input.userId, input.intakeId],
  );
  return row?.busy === true;
}

/**
 * The only statement that picks intake work up with nobody present, so it
 * asks inside the statement whether each owner may still run unattended and
 * is still a member of the workspace the row names.
 */
export async function listRedispatchableIntakes(
  db: IntakeDb,
  input: { nowMs: number; limit: number },
): Promise<RedispatchableIntake[]> {
  const rows = await db.query<RedispatchableIntakeRecord>(
    `select i.id, i.user_id, i.organization_id, i.state
       from public.chat_file_intakes i
      where i.state = any($3::text[])
        and i.lease_until < $1::timestamptz
        and ${ownerMayRunUnattendedSql('i.user_id', 4)}
        and ${ownerIsActiveWorkspaceMemberSql('i.user_id', 'i.organization_id', 5)}
      order by i.lease_until
      limit $2
      for update of i skip locked`,
    [
      iso(input.nowMs),
      input.limit,
      LEASED_INTAKE_STATES,
      UNATTENDED_RUN_DENIED_STATUSES,
      MEMBERSHIP_STATUSES_THAT_MAY_ACT,
    ],
  );
  return rows.map(redispatchableIntake);
}

/**
 * A sealed row holds no lease, so a run that stopped while preparing it is
 * found through its preparation instead: one idle for longer than a step can
 * run, and not yet old enough for the preparation stall rule to end it.
 */
export async function listSealedIntakesWithIdlePreparation(
  db: IntakeDb,
  input: { idleBeforeMs: number; stalledBeforeMs: number; limit: number },
): Promise<RedispatchableIntake[]> {
  const rows = await db.query<RedispatchableIntakeRecord>(
    `select i.id, i.user_id, i.organization_id, i.state
       from public.chat_file_intakes i
      where i.state = 'sealed'
        and exists (
              select 1
                from public.chat_file_preparations p
               where p.media_asset_id = i.media_asset_id
                 and p.user_id = i.user_id
                 and p.state = 'preparing'
                 and p.updated_at < $1::timestamptz
                 and p.updated_at >= $2::timestamptz
            )
        and ${ownerMayRunUnattendedSql('i.user_id', 4)}
        and ${ownerIsActiveWorkspaceMemberSql('i.user_id', 'i.organization_id', 5)}
      order by i.state_changed_at
      limit $3`,
    [
      iso(input.idleBeforeMs),
      iso(input.stalledBeforeMs),
      input.limit,
      UNATTENDED_RUN_DENIED_STATUSES,
      MEMBERSHIP_STATUSES_THAT_MAY_ACT,
    ],
  );
  return rows.map(redispatchableIntake);
}

export async function listIdleAwaitingPartsIntakes(
  db: IntakeDb,
  input: { idleBeforeMs: number; limit: number },
): Promise<ChatFileIntakeRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${COLUMNS}
       from public.chat_file_intakes i
      where i.state = 'awaiting_parts'
        and coalesce(i.last_part_request_at, i.created_at) < $1::timestamptz
      order by coalesce(i.last_part_request_at, i.created_at)
      limit $2`,
    [iso(input.idleBeforeMs), input.limit],
  );
  return rows.map(mapIntakeRow);
}

export async function listStalledIntakes(
  db: IntakeDb,
  input: { changedBeforeMs: number; limit: number },
): Promise<ChatFileIntakeRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${COLUMNS}
       from public.chat_file_intakes i
      where i.state = any($3::text[])
        and i.state_changed_at < $1::timestamptz
      order by i.state_changed_at
      limit $2`,
    [iso(input.changedBeforeMs), input.limit, NON_TERMINAL_INTAKE_STATES],
  );
  return rows.map(mapIntakeRow);
}

export async function listUnpurgedTerminalIntakes(
  db: IntakeDb,
  input: { changedBeforeMs: number; limit: number },
): Promise<ChatFileIntakeRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${COLUMNS}
       from public.chat_file_intakes i
      where i.state = any($3::text[])
        and i.objects_purged_at is null
        and i.state_changed_at < $1::timestamptz
      order by i.state_changed_at
      limit $2`,
    [iso(input.changedBeforeMs), input.limit, TERMINAL_INTAKE_STATES],
  );
  return rows.map(mapIntakeRow);
}

/**
 * Ended rows past the window that entered `sealing` and did not seal. A copy
 * the storage host accepted can land after the purge, so their sealed key is
 * deleted once more before the row goes.
 */
export async function listPrunableUnsealedSealingIntakes(
  db: IntakeDb,
  input: { endedBeforeMs: number; limit: number },
): Promise<Array<{ id: string; stagingKey: string }>> {
  const rows = await db.query<{ id: string; staging_key: string }>(
    `select id, staging_key
       from public.chat_file_intakes
      where state = any($3::text[])
        and state <> 'sealed'
        and sealing_entered_at is not null
        and objects_purged_at is not null
        and state_changed_at < $1::timestamptz
      order by state_changed_at
      limit $2`,
    [iso(input.endedBeforeMs), input.limit, TERMINAL_INTAKE_STATES],
  );
  return rows.map((row) => ({ id: String(row.id), stagingKey: String(row.staging_key) }));
}

/**
 * Only rows whose objects are gone, so no staging key ever loses its last
 * pointer. A row that entered `sealing` and did not seal goes only when its
 * sealed key was deleted again in this pass (`sealedKeyClearedIds`).
 */
export async function pruneTerminalIntakes(
  db: IntakeDb,
  input: { endedBeforeMs: number; limit: number; sealedKeyClearedIds?: readonly string[] },
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `delete from public.chat_file_intakes
      where id in (
              select id
                from public.chat_file_intakes
               where state = any($3::text[])
                 and objects_purged_at is not null
                 and state_changed_at < $1::timestamptz
                 and (state = 'sealed' or sealing_entered_at is null or id = any($4::uuid[]))
               order by state_changed_at
               limit $2
            )
        and state = any($3::text[])
        and objects_purged_at is not null
        and state_changed_at < $1::timestamptz
        and (state = 'sealed' or sealing_entered_at is null or id = any($4::uuid[]))
      returning id`,
    [
      iso(input.endedBeforeMs),
      input.limit,
      TERMINAL_INTAKE_STATES,
      input.sealedKeyClearedIds ?? [],
    ],
  );
  return rows.length;
}

/**
 * What the intake engine asks of the rows of one owner. The workflow binds it
 * to the statements above through the user-scoped database, the sweeper to
 * the owner each listed row names; tests bind it to memory.
 */
export interface ChatFileIntakeStore {
  get(intakeId: string): Promise<ChatFileIntakeRow | null>;
  claim(input: ClaimIntakeInput): Promise<ChatFileIntakeRow | null>;
  renew(input: {
    intakeId: string;
    runId: string;
    state: ChatFileIntakeState;
    nowMs: number;
  }): Promise<ChatFileIntakeRow | null>;
  recordEtag(input: {
    intakeId: string;
    runId: string;
    etag: string;
  }): Promise<ChatFileIntakeRow | null>;
  recordAttempt(input: {
    intakeId: string;
    runId: string;
    attemptsBefore: number;
    jobId: string | null;
  }): Promise<ChatFileIntakeRow | null>;
  addBudgetWait(input: {
    intakeId: string;
    runId: string;
    waitMs: number;
    capMs: number;
  }): Promise<ChatFileIntakeRow | null>;
  returnToScanning(input: {
    intakeId: string;
    runId: string;
    nowMs: number;
  }): Promise<ChatFileIntakeRow | null>;
  end(input: {
    intakeId: string;
    runId: string | null;
    from: readonly ChatFileIntakeState[];
    ending: IntakeEnding;
    nowMs: number;
    userId?: string;
  }): Promise<EndedIntake | null>;
  markPurged(input: { intakeId: string; nowMs: number }): Promise<boolean>;
  refundDailyBytes(input: { intakeId: string; bytes: number; nowMs: number }): Promise<number>;
  hasOtherScanning(input: { userId: string; intakeId: string }): Promise<boolean>;
}

export function sqlChatFileIntakeStore(db: IntakeDb, userId: string): ChatFileIntakeStore {
  return {
    get: (intakeId) => readIntakeStatus(db, { userId, intakeId }),
    claim: (input) => claimIntakeState(db, { ...input, userId }),
    renew: (input) => renewIntakeLease(db, { ...input, userId }),
    recordEtag: (input) => recordInspectedEtag(db, { ...input, userId }),
    recordAttempt: (input) => recordScanAttempt(db, { ...input, userId }),
    addBudgetWait: (input) => addScanBudgetWait(db, { ...input, userId }),
    returnToScanning: (input) => returnSealingToScanning(db, { ...input, userId }),
    async end(input) {
      if (input.userId !== undefined && input.userId !== userId) return null;
      return endIntake(db, { ...input, userId });
    },
    markPurged: (input) => markIntakeObjectsPurged(db, { ...input, userId }),
    refundDailyBytes: (input) => refundIntakeDailyBytes(db, { ...input, userId }),
    hasOtherScanning: (input) => hasOtherScanningIntake(db, input),
  };
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { getNeonDb } from '@/lib/server/neon-db';

export const SERVICE_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REMOTE_DEVICE_ONLINE_WINDOW_MS = 15 * 60 * 1000;
export const SERVICE_HEALTH_CATEGORY_LIMIT = 50;

const TOOL_AUDIT_EVENT_TYPES = ['tool_executed', 'browser_action', 'computer_use_action'];
const BROWSER_AUDIT_EVENT_TYPES = ['browser_action'];

type SqlScalar = string | number | null | undefined;

function toCount(value: SqlScalar): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: SqlScalar): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export interface ToolHealthRow {
  category: string;
  calls: number;
  failures: number;
  blocked: number;
  failureRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}

export interface BrowserHealth {
  commands: number;
  handedOff: number;
  failures: number;
  blocked: number;
  failureRate: number | null;
}

export interface RemoteConnectionHealth {
  deviceSteps: number;
  resolved: number;
  failed: number;
  waiting: number;
  failureRate: number | null;
  resolveP50Ms: number | null;
  devicesOnline: number;
  devicesSeenInWindow: number;
}

export interface QueueDepthRow {
  queue: string;
  depth: number;
  inFlight: number;
  oldestWaitingAt: string | null;
}

export interface FileProcessingHealth {
  uploaded: number;
  extracted: number;
  withoutText: number;
  extractionRate: number | null;
  extractionP50Ms: number | null;
}

export interface ServiceHealthSummary {
  windowStart: string;
  windowEnd: string;
  tools: ToolHealthRow[];
  browser: BrowserHealth;
  remote: RemoteConnectionHealth;
  queues: QueueDepthRow[];
  files: FileProcessingHealth;
}

interface ToolRow {
  category: string | null;
  calls: SqlScalar;
  failures: SqlScalar;
  blocked: SqlScalar;
  latency_p50_ms: SqlScalar;
  latency_p95_ms: SqlScalar;
}

export async function readToolHealth(
  since: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<ToolHealthRow[]> {
  const rows = await db.query<ToolRow>(
    `select
       coalesce(details->>'source', 'other') as category,
       count(*)::bigint as calls,
       count(*) filter (where details->>'status' = 'failed')::bigint as failures,
       count(*) filter (where details->>'status' = 'blocked')::bigint as blocked,
       percentile_cont(0.5) within group (
         order by case when jsonb_typeof(details->'durationMs') = 'number'
           then (details->>'durationMs')::numeric end
       ) as latency_p50_ms,
       percentile_cont(0.95) within group (
         order by case when jsonb_typeof(details->'durationMs') = 'number'
           then (details->>'durationMs')::numeric end
       ) as latency_p95_ms
     from public.security_audit_logs
     where created_at >= $1::timestamptz
       and event_type = any($2::text[])
     group by 1
     order by calls desc
     limit ${SERVICE_HEALTH_CATEGORY_LIMIT}`,
    [since.toISOString(), TOOL_AUDIT_EVENT_TYPES],
  );
  return rows.map((row) => {
    const calls = toCount(row.calls);
    const failures = toCount(row.failures);
    return {
      category: row.category ?? 'other',
      calls,
      failures,
      blocked: toCount(row.blocked),
      failureRate: rate(failures, calls),
      latencyP50Ms: toNullableNumber(row.latency_p50_ms),
      latencyP95Ms: toNullableNumber(row.latency_p95_ms),
    };
  });
}

interface BrowserRow {
  commands: SqlScalar;
  handed_off: SqlScalar;
  failures: SqlScalar;
  blocked: SqlScalar;
}

export async function readBrowserHealth(
  since: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<BrowserHealth> {
  const [row] = await db.query<BrowserRow>(
    `select
       count(*)::bigint as commands,
       count(*) filter (where details->>'status' = 'handed_off')::bigint as handed_off,
       count(*) filter (where details->>'status' = 'failed')::bigint as failures,
       count(*) filter (where details->>'status' = 'blocked')::bigint as blocked
     from public.security_audit_logs
     where created_at >= $1::timestamptz
       and event_type = any($2::text[])`,
    [since.toISOString(), BROWSER_AUDIT_EVENT_TYPES],
  );
  const commands = toCount(row?.commands);
  const failures = toCount(row?.failures);
  return {
    commands,
    handedOff: toCount(row?.handed_off),
    failures,
    blocked: toCount(row?.blocked),
    failureRate: rate(failures, commands),
  };
}

interface RemoteRow {
  device_steps: SqlScalar;
  resolved: SqlScalar;
  failed: SqlScalar;
  waiting: SqlScalar;
  resolve_p50_ms: SqlScalar;
  devices_online: SqlScalar;
  devices_seen: SqlScalar;
}

export async function readRemoteConnectionHealth(
  since: Date,
  onlineSince: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<RemoteConnectionHealth> {
  const [row] = await db.query<RemoteRow>(
    `with steps as (
       select
         count(*)::bigint as device_steps,
         count(*) filter (where state = 'resolved')::bigint as resolved,
         count(*) filter (where state = 'failed')::bigint as failed,
         count(*) filter (where state in ('pending', 'resuming'))::bigint as waiting,
         percentile_cont(0.5) within group (
           order by extract(epoch from (resolved_at - created_at)) * 1000
         ) filter (where state = 'resolved' and resolved_at is not null) as resolve_p50_ms
       from public.cloud_agent_approval_checkpoints
       where checkpoint_kind = 'device'
         and created_at >= $1::timestamptz
     ),
     devices as (
       select
         count(*) filter (where last_seen_at >= $2::timestamptz)::bigint as devices_online,
         count(*) filter (where last_seen_at >= $1::timestamptz)::bigint as devices_seen
       from public.desktop_devices
       where last_seen_at >= $1::timestamptz
     )
     select * from steps cross join devices`,
    [since.toISOString(), onlineSince.toISOString()],
  );
  const deviceSteps = toCount(row?.device_steps);
  const failed = toCount(row?.failed);
  return {
    deviceSteps,
    resolved: toCount(row?.resolved),
    failed,
    waiting: toCount(row?.waiting),
    failureRate: rate(failed, deviceSteps),
    resolveP50Ms: toNullableNumber(row?.resolve_p50_ms),
    devicesOnline: toCount(row?.devices_online),
    devicesSeenInWindow: toCount(row?.devices_seen),
  };
}

interface QueueRow {
  queue: string;
  depth: SqlScalar;
  in_flight: SqlScalar;
  oldest_waiting_at: string | Date | null;
}

export async function readQueueDepth(
  now: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<QueueDepthRow[]> {
  const rows = await db.query<QueueRow>(
    `select 'cloud-agent-turn' as queue,
       count(*) filter (where state = 'queued')::bigint as depth,
       count(*) filter (where state = 'running')::bigint as in_flight,
       min(created_at) filter (where state = 'queued') as oldest_waiting_at
     from public.cloud_agent_runs
     where state in ('queued', 'running')
     union all
     select 'scheduled-task',
       (select count(*) from public.scheduled_tasks
         where is_enabled = true and status = 'active' and next_execution_at <= $1::timestamptz)::bigint,
       (select count(*) from public.scheduled_task_runs where status = 'running')::bigint,
       (select min(next_execution_at) from public.scheduled_tasks
         where is_enabled = true and status = 'active' and next_execution_at <= $1::timestamptz)
     union all
     select 'video-generation',
       count(*) filter (where status in ('submitting', 'queued'))::bigint,
       count(*) filter (where status = 'processing')::bigint,
       min(created_at) filter (where status in ('submitting', 'queued'))
     from public.video_generation_jobs
     where status in ('submitting', 'queued', 'processing')
     union all
     select 'credit-settlement',
       count(*) filter (where status = 'pending' and next_attempt_at <= $1::timestamptz)::bigint,
       count(*) filter (where status = 'processing')::bigint,
       min(next_attempt_at) filter (where status = 'pending' and next_attempt_at <= $1::timestamptz)
     from public.credit_settlement_jobs
     where status in ('pending', 'processing')`,
    [now.toISOString()],
  );
  return rows.map((row) => ({
    queue: row.queue,
    depth: toCount(row.depth),
    inFlight: toCount(row.in_flight),
    oldestWaitingAt: toIso(row.oldest_waiting_at),
  }));
}

interface FileRow {
  uploaded: SqlScalar;
  extracted: SqlScalar;
  extraction_p50_ms: SqlScalar;
}

export async function readFileProcessingHealth(
  since: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<FileProcessingHealth> {
  const [row] = await db.query<FileRow>(
    `select
       count(*)::bigint as uploaded,
       count(*) filter (where extracted_at is not null)::bigint as extracted,
       percentile_cont(0.5) within group (
         order by extract(epoch from (extracted_at - added_at)) * 1000
       ) filter (where extracted_at is not null) as extraction_p50_ms
     from public.project_knowledge_files
     where added_at >= $1::timestamptz
       and deleted_at is null`,
    [since.toISOString()],
  );
  const uploaded = toCount(row?.uploaded);
  const extracted = toCount(row?.extracted);
  return {
    uploaded,
    extracted,
    withoutText: uploaded - extracted,
    extractionRate: rate(extracted, uploaded),
    extractionP50Ms: toNullableNumber(row?.extraction_p50_ms),
  };
}

export async function readServiceHealth(
  now: Date = new Date(),
  db: DatabaseAdapter = getNeonDb(),
): Promise<ServiceHealthSummary> {
  const since = new Date(now.getTime() - SERVICE_HEALTH_WINDOW_MS);
  const onlineSince = new Date(now.getTime() - REMOTE_DEVICE_ONLINE_WINDOW_MS);
  const [tools, browser, remote, queues, files] = await Promise.all([
    readToolHealth(since, db),
    readBrowserHealth(since, db),
    readRemoteConnectionHealth(since, onlineSince, db),
    readQueueDepth(now, db),
    readFileProcessingHealth(since, db),
  ]);
  return {
    windowStart: since.toISOString(),
    windowEnd: now.toISOString(),
    tools,
    browser,
    remote,
    queues,
    files,
  };
}

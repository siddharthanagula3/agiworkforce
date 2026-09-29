import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { CUSTOM_SERVER_PREFIX, ORG_SHARED_SERVER_PREFIX } from '@/lib/connectors/custom-server-ids';
import {
  GOOGLE_USER_DATA_TRIGGER_SOURCES,
  isGoogleUserDataConnector,
} from '@/lib/connectors/google-user-data';
import { DIRECTORY_SERVER_ID_PREFIX } from '@/lib/connectors/mcp-directory-targets';
import { logger } from '@/lib/logger';
import { GOOGLE_USER_DATA_WITHHELD } from '@/lib/server/support-access-service';

import { deadReasonHeadline, type BackgroundJob } from './job-service';
import type { JobKind } from './job-queues';

const ROUTINE_NOTICE_KINDS: ReadonlySet<JobKind> = new Set([
  'notifications.schedule-completed',
  'email.schedule-completed',
]);

const EVENT_TRIGGER_KIND: JobKind = 'event-triggers.fire';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KEPT_PAYLOAD_FIELDS = ['triggerId', 'eventId', 'taskId', 'runId', 'status'] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uuidField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function eventSource(job: BackgroundJob): string | null {
  const source = record(job.payload['event'])?.['source'];
  return typeof source === 'string' ? source : null;
}

// A routine with no connector list runs with every connector its owner has
// connected, so only an explicit list without a Google connector clears it. A
// custom, workspace or directory server is identified by an id that does not
// name its host, so it counts as one that may be served from Google.
function routineMayReachGoogle(connectors: unknown): boolean {
  if (!Array.isArray(connectors)) return true;
  return connectors.some(
    (id) =>
      typeof id !== 'string' ||
      isGoogleUserDataConnector(id) ||
      [CUSTOM_SERVER_PREFIX, ORG_SHARED_SERVER_PREFIX, DIRECTORY_SERVER_ID_PREFIX].some((prefix) =>
        id.startsWith(prefix),
      ),
  );
}

interface RoutineConnectorRow extends Record<string, unknown> {
  task_id: string;
  trigger_id: string | null;
  connectors: unknown;
}

/**
 * The dead jobs whose payload or error can hold Google user data: an event
 * from a Gmail or Google Calendar trigger, and the run of a routine that can
 * reach a Google connector. A routine that cannot be looked up counts as one
 * that can, so a failed lookup withholds rather than shows.
 */
export async function jobsCarryingGoogleUserData(
  db: DatabaseAdapter,
  jobs: readonly BackgroundJob[],
): Promise<Set<string>> {
  const carrying = new Set<string>();
  const byTrigger = new Map<string, string[]>();
  const byTask = new Map<string, string[]>();
  const add = (index: Map<string, string[]>, key: string, jobId: string) => {
    index.set(key, [...(index.get(key) ?? []), jobId]);
  };

  for (const job of jobs) {
    if (job.kind === EVENT_TRIGGER_KIND) {
      const source = eventSource(job);
      if (source !== null && GOOGLE_USER_DATA_TRIGGER_SOURCES.has(source)) {
        carrying.add(job.id);
        continue;
      }
      const triggerId = uuidField(job.payload, 'triggerId');
      if (triggerId) add(byTrigger, triggerId, job.id);
      else carrying.add(job.id);
    } else if (ROUTINE_NOTICE_KINDS.has(job.kind as JobKind)) {
      const taskId = uuidField(job.payload, 'taskId');
      if (taskId) add(byTask, taskId, job.id);
      else carrying.add(job.id);
    }
  }

  if (byTrigger.size === 0 && byTask.size === 0) return carrying;

  const unresolved = new Set([...byTrigger.values(), ...byTask.values()].flat());
  try {
    const rows = await db.query<RoutineConnectorRow>(
      `select task.id::text as task_id, trigger.id::text as trigger_id,
              task.metadata -> 'connectors' as connectors
         from public.scheduled_tasks as task
         left join public.event_triggers as trigger on trigger.task_id = task.id
        where task.id = any ($1::uuid[]) or trigger.id = any ($2::uuid[])`,
      [[...byTask.keys()], [...byTrigger.keys()]],
    );
    for (const row of rows) {
      const jobIds = [
        ...(byTask.get(row.task_id) ?? []),
        ...(row.trigger_id ? (byTrigger.get(row.trigger_id) ?? []) : []),
      ];
      for (const jobId of jobIds) {
        if (routineMayReachGoogle(row.connectors)) carrying.add(jobId);
        else unresolved.delete(jobId);
      }
    }
  } catch (error) {
    logger.error({ error }, 'Routine connectors could not be read; Google user data is withheld');
  }
  for (const jobId of unresolved) carrying.add(jobId);
  return carrying;
}

export function withoutGoogleUserData(job: BackgroundJob): BackgroundJob {
  const payload: Record<string, unknown> = { withheld: GOOGLE_USER_DATA_WITHHELD };
  for (const key of KEPT_PAYLOAD_FIELDS) {
    if (typeof job.payload[key] === 'string') payload[key] = job.payload[key];
  }
  const event = record(job.payload['event']);
  if (event) payload['event'] = { source: event['source'], type: event['type'] };
  return {
    ...job,
    payload,
    lastError: job.lastError === null ? null : GOOGLE_USER_DATA_WITHHELD,
    deadReason: deadReasonHeadline(job.deadReason),
  };
}

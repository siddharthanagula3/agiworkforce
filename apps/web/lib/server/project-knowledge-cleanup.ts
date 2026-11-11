import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_DATA_REGION,
  normaliseDataRegion,
  type DataRegionId,
} from '@agiworkforce/compliance';
import { enqueueJob, PermanentJobError } from '@/lib/jobs/job-service';
import { JOB_QUEUE_POLICIES } from '@/lib/jobs/job-queues';
import { JobCancelledError } from '@/lib/jobs/cancellation';
import { legalHoldExclusion, legalHoldPredicate } from '@/lib/services/legal-hold-gate';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { createProjectKnowledgeCleanupPlan } from './project-knowledge-object-storage';
import {
  KnowledgeCleanupLeaseLost,
  reconcileProjectKnowledgeObject,
} from './project-knowledge-lifecycle';

const MAX_DISPATCH_BATCH = 100;

export async function dispatchProjectKnowledgeCleanup(
  db: DatabaseAdapter,
  input: { region: DataRegionId; limit?: number },
): Promise<number> {
  const limit = input.limit ?? MAX_DISPATCH_BATCH;
  if (
    normaliseDataRegion(input.region) !== input.region ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_DISPATCH_BATCH
  ) {
    throw new Error('Invalid project cleanup dispatch window.');
  }
  return db.transaction(async (tx) => {
    const unheld = legalHoldExclusion('project_file', {
      alias: 'object',
      owner: 'object.user_id',
      organization: 'object.organization_id',
      nextParamIndex: 4,
    });
    const pending = await tx.query<{
      fingerprint: string;
      user_id: string;
      organization_id: string | null;
    }>(
      `select fingerprint, user_id, organization_id from public.project_knowledge_objects object
        where state in ('queued', 'deleting') and cleanup_job_id is null and origin_known
          and (origin_region = $1 or (origin_region is null and $1 = $2))
          and (state = 'queued' or lease_expires_at <= clock_timestamp())
          and ${unheld.sql}
        order by retired_at, fingerprint
        limit $3 for update skip locked`,
      [input.region, DEFAULT_DATA_REGION, limit, ...unheld.params],
    );
    for (const object of pending) {
      const job = await enqueueJob(tx, {
        kind: 'data-deletion.project-knowledge-object',
        idempotencyKey: `knowledge-cleanup:${object.fingerprint}`,
        originRegion: input.region,
        payload: { fingerprint: object.fingerprint },
      });
      const linked = await tx.execute(
        `update public.project_knowledge_objects set cleanup_job_id=$2::uuid, updated_at=now()
          where fingerprint=$1 and cleanup_job_id is null and user_id=$3
            and organization_id is not distinct from $4::uuid`,
        [object.fingerprint, job.id, object.user_id, object.organization_id],
      );
      if (linked !== 1) throw new Error('The cleanup job was not linked to its retired object.');
    }
    return pending.length;
  });
}

export async function runProjectKnowledgeCleanup(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const fingerprint = context.job.payload['fingerprint'];
  if (
    typeof fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(fingerprint) ||
    context.job.userId !== null ||
    context.job.organizationId !== null
  ) {
    throw new PermanentJobError(
      'Project cleanup requires a platform job and an object fingerprint.',
    );
  }
  const held = legalHoldPredicate('project_file', {
    alias: 'object',
    owner: 'object.user_id',
    organization: 'object.organization_id',
    nextParamIndex: 6,
  });
  async function currentAttempt() {
    context.signal.throwIfAborted();
    const [object] = await context.db.query<{
      state: string;
      origin_region: string | null;
      origin_known: boolean;
      cancel_requested_at: string | null;
      held: boolean;
    }>(
      `select object.state, object.origin_region, object.origin_known, job.cancel_requested_at, ${held.sql} as held
         from public.project_knowledge_objects object
         join public.background_jobs job on job.id=object.cleanup_job_id
        where object.fingerprint=$1 and job.id=$2::uuid and job.worker_id=$3
          and job.status='running' and job.lease_expires_at > clock_timestamp()
          and job.user_id is null and job.organization_id is null
          and coalesce(job.origin_region,$4)=$5`,
      [
        fingerprint,
        context.job.id,
        context.job.workerId,
        DEFAULT_DATA_REGION,
        context.job.originRegion ?? DEFAULT_DATA_REGION,
        ...held.params,
      ],
    );
    if (!object) throw new KnowledgeCleanupLeaseLost();
    if (object.cancel_requested_at !== null) throw new JobCancelledError(context.job.id);
    if (object.held)
      throw new PermanentJobError('Project cleanup is preserved by an active legal hold.');
    const origin = normaliseDataRegion(object.origin_region ?? DEFAULT_DATA_REGION);
    if (
      !object.origin_known ||
      origin === null ||
      origin !== (context.job.originRegion ?? DEFAULT_DATA_REGION)
    ) {
      throw new PermanentJobError(
        'The original cleanup region is unavailable or differs from this job.',
      );
    }
    context.signal.throwIfAborted();
    return object;
  }
  const original = await currentAttempt();
  if (original.state === 'deleted') return { fingerprint, deleted: true };
  const plan = createProjectKnowledgeCleanupPlan();
  const result = await reconcileProjectKnowledgeObject(context.db, {
    fingerprint,
    targets: plan.targets,
    leaseSeconds: JOB_QUEUE_POLICIES['data-deletion'].leaseSeconds,
    signal: context.signal,
    remove: async (target) => {
      await currentAttempt();
      await plan.remove(target);
    },
  });
  if (result.status === 'deleted') return { fingerprint, deleted: true };
  if (result.status === 'busy')
    throw new Error('The object cleanup lease is still held; reconcile on retry.');
  throw new PermanentJobError(`Project cleanup is held: ${result.status}.`);
}

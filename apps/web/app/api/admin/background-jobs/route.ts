import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { isJobQueueName } from '@/lib/jobs/job-queues';
import {
  listDeadJobs,
  readJobQueueStats,
  retryDeadJob,
  type BackgroundJob,
} from '@/lib/jobs/job-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { readOperatorContentUnderGrants } from '@/lib/server/support-access-service';

export const runtime = 'nodejs';

const NO_STORE = 'private, no-store';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const JOB_CONTENT_SCOPE = 'background_jobs';

// A dead job's payload and its provider error are the tenant's words, not ours.
// An operator sees the shape of the failure; the content needs a live grant.
function withoutJobContent(job: BackgroundJob): BackgroundJob {
  return { ...job, payload: {}, lastError: job.lastError === null ? null : 'redacted' };
}

const RetrySchema = z.object({ jobId: z.string().uuid() });

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: operatorUserId } = await requirePlatformAdmin(request);

  const url = new URL(request.url);
  const queue = url.searchParams.get('queue');
  if (queue !== null && !isJobQueueName(queue)) {
    throw createError.validation('Unknown queue');
  }
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, integerQueryValue(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE)),
  );
  const offset = Math.max(0, integerQueryValue(url.searchParams.get('offset'), 0));

  const db = getNeonDb();
  const [queues, dead] = await Promise.all([
    readJobQueueStats(db),
    listDeadJobs(db, { limit, offset, queue }),
  ]);

  const view = await readOperatorContentUnderGrants({
    db,
    actorUserId: operatorUserId,
    scope: JOB_CONTENT_SCOPE,
    resourceType: 'background_job',
    records: dead,
    organizationIdOf: (job) => job.organizationId,
    withoutContent: withoutJobContent,
  });

  const servedContent = view.grantedOrganizationIds.length > 0;
  await recordAuditEvent({
    userId: operatorUserId,
    eventType: 'data_accessed',
    request,
    severity: servedContent ? 'warning' : 'info',
    detail: {
      resourceType: 'background_job',
      resourceId: queue ?? 'all',
      scope: JOB_CONTENT_SCOPE,
      count: view.records.length,
      held: view.redactedCount,
      status: servedContent ? 'content_served' : 'metadata_only',
    },
  });

  return NextResponse.json(
    {
      queues,
      dead: view.records,
      redacted: view.redactedCount,
      pagination: { limit, offset },
    },
    { headers: { 'Cache-Control': NO_STORE } },
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const parsed = RetrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('A dead job id is required');

  const retried = await retryDeadJob(getNeonDb(), parsed.data.jobId);
  if (!retried) throw createError.notFound('No dead job with that id');

  await recordAuditEvent({
    userId: adminUserId,
    eventType: 'background_job_retried',
    request,
    severity: 'warning',
    detail: { resourceType: 'background_job', resourceId: parsed.data.jobId },
  });

  return NextResponse.json({ retried: true }, { headers: { 'Cache-Control': NO_STORE } });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

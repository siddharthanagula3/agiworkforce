import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { toIsoTimestamp } from '@/lib/server/iso-timestamps';
import { APPROVAL_CHECKPOINT_TTL_HOURS } from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';

/** Enough for a badge and a notification body; the app opens the full list. */
const MAX_PAUSES = 50;

const PauseRowSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  checkpoint_kind: z.enum(['approval', 'input']).catch('approval'),
  pending_tool_calls: z.unknown(),
  model: z.string(),
  created_at: z.union([z.string(), z.date()]),
});

const ToolCallsSchema = z.array(z.object({ qualifiedName: z.string() }).passthrough());

interface PendingPause {
  id: string;
  runId: string;
  kind: 'approval' | 'input';
  toolName: string | null;
  toolCount: number;
  model: string;
  requestedAt: string | null;
}

async function handleGet(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);

  let pauseRows: unknown[];
  let runningRows: { running: number | string }[];
  try {
    // Tenancy predicate: the checkpoint, the run, and the join key are all
    // pinned to the authenticated caller, `checkpoint.user_id = $1`,
    // `runs.user_id = $1`, and `runs.user_id = checkpoint.user_id`, so a row
    // belonging to another user cannot survive any one of them being wrong.
    [pauseRows, runningRows] = await Promise.all([
      db.query(
        `select checkpoint.id,
                checkpoint.run_id,
                coalesce(checkpoint.checkpoint_kind, 'approval') as checkpoint_kind,
                checkpoint.pending_tool_calls,
                checkpoint.created_at,
                runs.model
           from public.cloud_agent_approval_checkpoints as checkpoint
           join public.cloud_agent_runs as runs
             on runs.id = checkpoint.run_id
            and runs.user_id = checkpoint.user_id
          where checkpoint.user_id = $1
            and runs.user_id = $1
            and checkpoint.state = 'pending'
            and checkpoint.created_at > now() - make_interval(hours => $2)
          order by checkpoint.created_at desc
          limit $3`,
        [userId, APPROVAL_CHECKPOINT_TTL_HOURS, MAX_PAUSES],
      ),
      db.query<{ running: number | string }>(
        `select count(*) as running
           from public.cloud_agent_runs
          where user_id = $1
            and state in ('queued', 'running')`,
        [userId],
      ),
    ]);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to read mobile agent status');
    throw createError.internal('Failed to read agent status');
  }

  const pendingApprovals: PendingPause[] = [];
  for (const raw of pauseRows) {
    const row = PauseRowSchema.safeParse(raw);
    if (!row.success) continue;
    const calls = ToolCallsSchema.safeParse(row.data.pending_tool_calls);
    const toolCalls = calls.success ? calls.data : [];
    pendingApprovals.push({
      id: row.data.id,
      runId: row.data.run_id,
      kind: row.data.checkpoint_kind,
      toolName: toolCalls[0]?.qualifiedName ?? null,
      toolCount: toolCalls.length,
      model: row.data.model,
      requestedAt: toIsoTimestamp(
        row.data.created_at instanceof Date ? row.data.created_at : String(row.data.created_at),
      ),
    });
  }

  const runningAgents = z.coerce
    .number()
    .int()
    .min(0)
    .catch(0)
    .parse(runningRows[0]?.running ?? 0);

  return NextResponse.json({ pendingApprovals, runningAgents });
}

export const GET = withErrorHandler(handleGet);

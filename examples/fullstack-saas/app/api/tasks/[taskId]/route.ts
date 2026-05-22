import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { invalidateCache } from '@/lib/cache';
import { json, withApiGuard } from '@/lib/http';
import { updateTaskSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

async function handlePatch(request: NextRequest, context: RouteContext) {
  const { taskId } = await context.params;
  const { supabase } = await requireUser();
  const body = updateTaskSchema.parse(await request.json());

  const { data, error } = await supabase
    .from('tasks')
    .update(body)
    .eq('id', taskId)
    .select(
      'id, project_id, creator_id, assignee_id, title, body, status, priority, due_at, created_at, updated_at',
    )
    .single();

  if (error) throw error;
  await invalidateCache(`metrics:${data.project_id}`);
  return json({ task: data });
}

async function handleDelete(_request: NextRequest, context: RouteContext) {
  const { taskId } = await context.params;
  const { supabase } = await requireUser();
  const { data: existing, error: selectError } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single();
  if (selectError) throw selectError;

  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
  await invalidateCache(`metrics:${existing.project_id}`);
  return json({ ok: true });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handlePatch(guardedRequest, context), {
    limit: 120,
    windowSeconds: 60,
  })(request);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handleDelete(guardedRequest, context), {
    limit: 60,
    windowSeconds: 60,
  })(request);
}

export const OPTIONS = withApiGuard(async () => json({ ok: true }));

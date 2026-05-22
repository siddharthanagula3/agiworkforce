import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getJsonCache, setJsonCache } from '@/lib/cache';
import { invalidateCache } from '@/lib/cache';
import { json, withApiGuard } from '@/lib/http';
import type { ProjectMetrics, Task } from '@/lib/types';
import { createTaskSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function metricsFor(tasks: Task[]): ProjectMetrics {
  return tasks.reduce<ProjectMetrics>(
    (acc, task) => {
      acc.total += 1;
      acc[task.status] += 1;
      return acc;
    },
    { total: 0, todo: 0, doing: 0, blocked: 0, done: 0 },
  );
}

async function handleGet(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, project_id, creator_id, assignee_id, title, body, status, priority, due_at, created_at, updated_at',
    )
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const cacheKey = `metrics:${projectId}`;
  const tasks = (data ?? []) as Task[];
  const cachedMetrics = await getJsonCache<ProjectMetrics>(cacheKey);
  const metrics = cachedMetrics ?? metricsFor(tasks);
  if (!cachedMetrics) await setJsonCache(cacheKey, metrics, 30);

  return json({ tasks, metrics });
}

async function handlePost(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const { supabase, user } = await requireUser();
  const body = createTaskSchema.parse(await request.json());

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      creator_id: user.id,
      title: body.title,
      body: body.body ?? null,
      priority: body.priority,
      due_at: body.due_at ?? null,
    })
    .select(
      'id, project_id, creator_id, assignee_id, title, body, status, priority, due_at, created_at, updated_at',
    )
    .single();

  if (error) throw error;
  await invalidateCache(`metrics:${projectId}`);
  return json({ task: data }, { status: 201 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handleGet(guardedRequest, context))(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handlePost(guardedRequest, context), {
    limit: 90,
    windowSeconds: 60,
  })(request);
}

export const OPTIONS = withApiGuard(async () => json({ ok: true }));

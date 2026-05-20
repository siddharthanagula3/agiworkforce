import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, withApiGuard } from '@/lib/http';
import { signedUploadSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function safeFilePart(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
}

async function handleGet(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.storage.from('project-files').list(projectId, {
    limit: 50,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) throw error;
  return json({ files: data ?? [] });
}

async function handlePost(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const { supabase } = await requireUser();
  const body = signedUploadSchema.parse(await request.json());
  const { data: allowed, error: roleError } = await supabase.rpc('has_project_role', {
    project_uuid: projectId,
    allowed_roles: ['owner', 'admin', 'member'],
  });

  if (roleError) throw roleError;
  if (!allowed) return json({ error: 'forbidden' }, { status: 403 });

  const path = `${projectId}/${randomUUID()}-${safeFilePart(body.filename)}`;
  const { data, error } = await supabase.storage.from('project-files').createSignedUploadUrl(path);
  if (error) throw error;

  return json({
    upload: data,
    path,
    contentType: body.contentType,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handleGet(guardedRequest, context))(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withApiGuard((guardedRequest) => handlePost(guardedRequest, context), {
    limit: 30,
    windowSeconds: 60,
  })(request);
}

export const OPTIONS = withApiGuard(async () => json({ ok: true }));

import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, withApiGuard } from '@/lib/http';
import { createProjectSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiGuard(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, slug, description, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return json({ projects: data ?? [] });
});

export const POST = withApiGuard(
  async (request: NextRequest) => {
    const { supabase } = await requireUser();
    const body = createProjectSchema.parse(await request.json());
    const { data, error } = await supabase.rpc('create_project', {
      p_name: body.name,
      p_description: body.description ?? null,
    });

    if (error) throw error;
    return json({ project: data }, { status: 201 });
  },
  { limit: 30, windowSeconds: 60 },
);

export const OPTIONS = withApiGuard(async () => json({ ok: true }));

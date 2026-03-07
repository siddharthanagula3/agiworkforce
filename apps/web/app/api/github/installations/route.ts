import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

async function getAuthenticatedSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await getAuthenticatedSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('github_installations')
    .select(
      'id, installation_id, account_login, account_type, pr_review_enabled, review_model, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch GitHub installations');
    return NextResponse.json({ error: 'Failed to fetch installations' }, { status: 500 });
  }

  return NextResponse.json({ installations: data ?? [] });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const supabase = await getAuthenticatedSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let installationId: number;
  try {
    const body = (await request.json()) as { installationId?: unknown };
    if (typeof body.installationId !== 'number') {
      return NextResponse.json({ error: 'installationId must be a number' }, { status: 400 });
    }
    installationId = body.installationId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { error } = await supabase
    .from('github_installations')
    .delete()
    .eq('installation_id', installationId)
    .eq('user_id', user.id);

  if (error) {
    logger.error(
      { error, userId: user.id, installationId },
      'Failed to delete GitHub installation',
    );
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

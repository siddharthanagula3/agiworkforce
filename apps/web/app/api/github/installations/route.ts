import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('github_installations')
    .select(
      'id, installation_id, account_login, account_type, pr_review_enabled, review_model, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch GitHub installations');
    return NextResponse.json({ error: 'Failed to fetch installations' }, { status: 500 });
  }

  return NextResponse.json({ installations: data ?? [] });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // AUDIT-008-006: Enforce CSRF protection for DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

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
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId, installationId }, 'Failed to delete GitHub installation');
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AI_EMPLOYEES } from '@/data/marketplace-employees';

/**
 * Workforce API
 * Endpoints:
 *   GET  /api/workforce — fetch user's hired employees + stats
 *   POST /api/workforce — hire an employee
 *   DELETE /api/workforce?employeeId=xxx — fire an employee
 *
 * Requires authentication via Bearer token or cookie session.
 */

export const runtime = 'nodejs';

/**
 * Authenticate the request and return the user ID.
 * Supports both Bearer token and cookie-based auth.
 */
async function authenticateRequest(request: NextRequest): Promise<string> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new Error('UNAUTHORIZED');
    }
    return user.id;
  }

  // Cookie-based auth for browser requests
  const { createServerClient } = await import('@supabase/ssr');
  const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Read-only for this route
      },
    },
  });

  const {
    data: { user },
    error,
  } = await ssrClient.auth.getUser();

  if (error || !user) {
    throw new Error('UNAUTHORIZED');
  }

  return user.id;
}

/**
 * Get a Supabase admin client for database operations
 */
function getAdminClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

/**
 * GET /api/workforce
 *
 * Returns the user's hired employees, enriched with catalog data,
 * along with workforce statistics.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await authenticateRequest(request);
    const supabase = getAdminClient();
    const corsHeaders = getCorsHeaders(request);

    // Fetch hired employees
    const { data: hiredData, error: hiredError } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('user_id', userId)
      .order('hired_at', { ascending: false });

    if (hiredError) {
      // Table might not exist yet
      if (hiredError.message?.includes('does not exist') || hiredError.code === '42P01') {
        return NextResponse.json(
          {
            success: true,
            data: {
              employees: [],
              stats: {
                totalHired: 0,
                activeEmployees: 0,
                totalTasksCompleted: 0,
              },
            },
          },
          { status: 200, headers: corsHeaders },
        );
      }
      throw hiredError;
    }

    // Enrich hired records with catalog data
    const enrichedEmployees = (hiredData || []).map(
      (record: {
        id: string;
        employee_id: string;
        employee_name: string | null;
        hired_at: string | null;
      }) => {
        const catalogEntry = AI_EMPLOYEES.find((e) => e.id === record.employee_id);

        return {
          id: record.id,
          employeeId: record.employee_id,
          name: catalogEntry?.name || record.employee_name || 'AI Employee',
          role: catalogEntry?.role || catalogEntry?.specialty || 'AI Specialist',
          category: catalogEntry?.category || 'General',
          description: catalogEntry?.description || '',
          provider: catalogEntry?.provider || 'unknown',
          avatar: catalogEntry?.avatar || '',
          skills: catalogEntry?.skills || [],
          specialty: catalogEntry?.specialty || '',
          popular: catalogEntry?.popular || false,
          hiredAt: record.hired_at,
        };
      },
    );

    // Fetch task count from credit_transactions (optional)
    let totalTasksCompleted = 0;
    try {
      const { count } = await supabase
        .from('credit_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'deduction');

      totalTasksCompleted = count ?? 0;
    } catch {
      // Table may not exist
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          employees: enrichedEmployees,
          stats: {
            totalHired: enrichedEmployees.length,
            activeEmployees: enrichedEmployees.length,
            totalTasksCompleted,
          },
        },
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    logger.error({ error }, '[API /workforce] Error fetching workforce data');
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch workforce data' },
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workforce
 *
 * Hire an AI employee. Expects JSON body: { employeeId: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // CSRF protection for state-changing POST endpoint
    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError as NextResponse;

    // Rate limiting
    const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
    if (rateLimitResponse) return rateLimitResponse;

    const userId = await authenticateRequest(request);
    const supabase = getAdminClient();
    const corsHeaders = getCorsHeaders(request);

    const body = (await request.json()) as { employeeId?: string };
    const { employeeId } = body;

    if (!employeeId || typeof employeeId !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'employeeId is required' } },
        { status: 400, headers: corsHeaders },
      );
    }

    // Look up the employee in the catalog
    const catalogEntry = AI_EMPLOYEES.find((e) => e.id === employeeId);
    if (!catalogEntry) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Employee not found in catalog' } },
        { status: 404, headers: corsHeaders },
      );
    }

    // Upsert into hired_employees
    const { data, error } = await supabase
      .from('hired_employees')
      .upsert(
        {
          user_id: userId,
          employee_id: employeeId,
          employee_name: catalogEntry.name,
        },
        { onConflict: 'user_id,employee_id' },
      )
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TABLE_NOT_FOUND',
              message: 'The hired_employees table needs to be created in Supabase',
            },
          },
          { status: 503, headers: corsHeaders },
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: data?.id,
          employeeId,
          name: catalogEntry.name,
          role: catalogEntry.role || catalogEntry.specialty,
          hiredAt: data?.hired_at,
        },
        message: `${catalogEntry.name} has been hired successfully`,
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    logger.error({ error }, '[API /workforce] Error hiring employee');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to hire employee' } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workforce?employeeId=xxx
 *
 * Fire (remove) a hired AI employee.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // CSRF protection for state-changing DELETE endpoint
    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError as NextResponse;

    // Rate limiting
    const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
    if (rateLimitResponse) return rateLimitResponse;

    const userId = await authenticateRequest(request);
    const supabase = getAdminClient();
    const corsHeaders = getCorsHeaders(request);

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'employeeId query param is required' },
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase
      .from('hired_employees')
      .delete()
      .eq('user_id', userId)
      .eq('employee_id', employeeId);

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json(
          { success: true, message: 'Employee not found (table does not exist)' },
          { status: 200, headers: corsHeaders },
        );
      }
      throw error;
    }

    return NextResponse.json(
      { success: true, message: 'Employee removed from workforce' },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    logger.error({ error }, '[API /workforce] Error firing employee');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove employee' } },
      { status: 500 },
    );
  }
}

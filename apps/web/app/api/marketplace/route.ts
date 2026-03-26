import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AI_EMPLOYEES } from '@/data/marketplace-employees';

/**
 * Marketplace API
 * Endpoint: GET /api/marketplace
 *
 * Returns the AI employee catalog with optional filtering, search, and pagination.
 * The data is sourced from the static marketplace-employees.ts catalog.
 *
 * Query params:
 *   - category: filter by category (case-insensitive)
 *   - search: full-text search across name, role, description, skills
 *   - sortBy: 'name' | 'popular' (default: 'popular')
 *   - provider: filter by AI provider
 *   - page: page number (default: 1)
 *   - pageSize: items per page (default: 24, max: 100)
 *
 * Response is publicly cacheable since the catalog is static.
 */

export const runtime = 'nodejs';

interface MarketplaceEmployeeResponse {
  id: string;
  name: string;
  role: string;
  category: string;
  description: string;
  provider: string;
  avatar: string;
  skills: string[];
  specialty: string;
  fitLevel: string;
  popular: boolean;
  defaultTools: string[];
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = await withRateLimit(request, 'default');
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') || 'popular';
    const provider = searchParams.get('provider') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '24', 10)));

    let employees = [...AI_EMPLOYEES];

    // Apply category filter
    if (category && category !== 'all') {
      employees = employees.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }

    // Apply provider filter
    if (provider) {
      employees = employees.filter((e) => e.provider.toLowerCase() === provider.toLowerCase());
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      employees = employees.filter(
        (e) =>
          e.name.toLowerCase().includes(searchLower) ||
          e.description.toLowerCase().includes(searchLower) ||
          (e.role?.toLowerCase().includes(searchLower) ?? false) ||
          e.skills?.some((s) => s.toLowerCase().includes(searchLower)),
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'name':
        employees.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'popular':
      default:
        employees.sort((a, b) => {
          const aScore = a.popular ? 1 : 0;
          const bScore = b.popular ? 1 : 0;
          return bScore - aScore;
        });
        break;
    }

    // Calculate pagination
    const total = employees.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const paginatedEmployees = employees.slice(startIndex, startIndex + pageSize);

    // Transform to API response shape
    const data: MarketplaceEmployeeResponse[] = paginatedEmployees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      role: emp.role || emp.specialty || 'AI Specialist',
      category: emp.category,
      description: emp.description,
      provider: emp.provider,
      avatar: emp.avatar,
      skills: emp.skills || [],
      specialty: emp.specialty || '',
      fitLevel: emp.fitLevel || 'excellent',
      popular: emp.popular || false,
      defaultTools: emp.defaultTools || [],
    }));

    // Collect unique categories for the response
    const categories = Array.from(new Set(AI_EMPLOYEES.map((e) => e.category))).sort();

    const corsHeaders = getCorsHeaders(request);

    return NextResponse.json(
      {
        success: true,
        data,
        meta: {
          total,
          page: safePage,
          pageSize,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
          categories,
        },
      },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    logger.error({ error }, '[API /marketplace] Error fetching marketplace data');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch marketplace data',
        },
      },
      { status: 500 },
    );
  }
}

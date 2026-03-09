/**
 * Marketplace React Query Hooks
 * Provides marketplace-specific hooks for browsing, searching, and hiring AI employees.
 *
 * These hooks build on top of the workforce query layer to provide
 * marketplace-specific filtering, pagination, and search functionality.
 *
 * @module features/marketplace/hooks/use-marketplace-queries
 */

import { useCallback, useMemo } from 'react';
import {
  useMarketplaceEmployees,
  useEmployeeDetail,
  useHireEmployee,
  useEmployeeCategories,
  useEmployeeReviews,
  useIsEmployeeHired,
  type MarketplaceFilters,
  type EmployeeDetailData,
} from '@features/workforce/hooks';
import type { AIEmployee } from '@/data/marketplace-employees';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { PurchasedEmployeeRecord } from '@features/workforce/services/employee-database';

// ============================================================================
// SEARCH + FILTER HOOK
// ============================================================================

/**
 * Options for marketplace search
 */
export interface MarketplaceSearchOptions {
  query: string;
  category?: string;
  sortBy?: 'name' | 'price' | 'rating' | 'popular';
  provider?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result set
 */
export interface PaginatedEmployees {
  employees: AIEmployee[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Search and filter marketplace employees with pagination.
 *
 * Wraps `useMarketplaceEmployees` with client-side pagination,
 * since the underlying data source is a static JSON catalog.
 *
 * @param options - Search, filter, and pagination options
 * @returns Query result with paginated employees
 */
export function useMarketplaceSearch(
  options: MarketplaceSearchOptions,
): UseQueryResult<AIEmployee[], Error> & { paginated: PaginatedEmployees } {
  const { query, category, sortBy, provider, page = 1, pageSize = 12 } = options;

  const filters: MarketplaceFilters = useMemo(
    () => ({
      search: query || undefined,
      category: category || undefined,
      sortBy: sortBy || 'popular',
      provider: provider || undefined,
    }),
    [query, category, sortBy, provider],
  );

  const result = useMarketplaceEmployees(filters);

  const paginated = useMemo<PaginatedEmployees>(() => {
    const allEmployees = result.data ?? [];
    const total = allEmployees.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const employees = allEmployees.slice(startIndex, startIndex + pageSize);

    return {
      employees,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    };
  }, [result.data, page, pageSize]);

  return { ...result, paginated };
}

// ============================================================================
// EMPLOYEE DETAILS HOOK
// ============================================================================

/**
 * Fetch detailed information about a single marketplace employee,
 * including whether the current user has hired them.
 *
 * @param employeeId - The employee ID
 * @returns Query result with employee detail data
 */
export function useMarketplaceEmployeeDetail(
  employeeId: string | undefined,
): UseQueryResult<EmployeeDetailData | null, Error> {
  return useEmployeeDetail(employeeId);
}

// ============================================================================
// HIRE EMPLOYEE HOOK
// ============================================================================

/**
 * Hire (activate) an AI employee from the marketplace.
 * Persists to Supabase and invalidates related queries.
 *
 * @returns Mutation result for hiring an employee
 */
export function useMarketplaceHireEmployee(): UseMutationResult<
  PurchasedEmployeeRecord,
  Error,
  AIEmployee
> {
  return useHireEmployee();
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export { useMarketplaceEmployees, useEmployeeCategories, useEmployeeReviews, useIsEmployeeHired };

// Type re-exports
export type { MarketplaceFilters, EmployeeDetailData };

// ============================================================================
// UTILITY: CATEGORY COUNTS
// ============================================================================

/**
 * Get employee counts per category from the full marketplace list.
 *
 * @returns Callback that computes category counts from data
 */
export function useMarketplaceCategoryCounts(): {
  getCounts: (employees: AIEmployee[]) => Record<string, number>;
} {
  const getCounts = useCallback((employees: AIEmployee[]): Record<string, number> => {
    const counts: Record<string, number> = { all: employees.length };
    for (const emp of employees) {
      const cat = emp.category.toLowerCase();
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, []);

  return { getCounts };
}

// Marketplace Hooks - Public API

export {
  // Search + filter hook (primary)
  useMarketplaceSearch,
  // Detail hook
  useMarketplaceEmployeeDetail,
  // Hire hook
  useMarketplaceHireEmployee,
  // Re-exported from workforce layer
  useMarketplaceEmployees,
  useEmployeeCategories,
  useEmployeeReviews,
  useIsEmployeeHired,
  // Utility
  useMarketplaceCategoryCounts,
  // Types
  type MarketplaceSearchOptions,
  type PaginatedEmployees,
  type MarketplaceFilters,
  type EmployeeDetailData,
} from './use-marketplace-queries';

export { buildMobileGlobalSearchGroups, collectSearchableMobileFiles } from './mobileGlobalSearch';
export type {
  MobileGlobalSearchGroups,
  MobileGlobalSearchResult,
  SearchableMobileFile,
  SearchableMobileProject,
} from './mobileGlobalSearch';
export { MOBILE_DESTINATIONS, searchMobileDestinations } from './mobileDestinations';
export type { MobileDestination } from './mobileDestinations';
export {
  RECENT_SEARCH_LIMIT,
  clearCloudRecentSearches,
  clearRecentSearches,
  readRecentSearches,
  recordRecentSearch,
} from './recentSearches';
export type { RecentSearchScope } from './recentSearches';

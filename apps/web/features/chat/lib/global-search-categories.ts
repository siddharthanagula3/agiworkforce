export const GLOBAL_SEARCH_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'code', label: 'Code' },
  { id: 'projects', label: 'Projects' },
  { id: 'scheduled', label: 'Scheduled' },
] as const;

export type GlobalSearchCategory = (typeof GLOBAL_SEARCH_CATEGORIES)[number]['id'];

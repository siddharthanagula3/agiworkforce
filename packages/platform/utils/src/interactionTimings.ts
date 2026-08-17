export const INTERACTION_DEBOUNCE_MS = {
  searchInput: 300,
  filterInput: 300,
  registryDiscovery: 300,
  autosave: 300,
} as const;

export type InteractionDebounceKind = keyof typeof INTERACTION_DEBOUNCE_MS;

export const SEARCH_INPUT_DEBOUNCE_MS = INTERACTION_DEBOUNCE_MS.searchInput;
export const FILTER_INPUT_DEBOUNCE_MS = INTERACTION_DEBOUNCE_MS.filterInput;
export const REGISTRY_DISCOVERY_DEBOUNCE_MS = INTERACTION_DEBOUNCE_MS.registryDiscovery;
export const AUTOSAVE_DEBOUNCE_MS = INTERACTION_DEBOUNCE_MS.autosave;

/**
 * Sidecar Store - DEPRECATED
 *
 * This store has been consolidated into the unified UI store.
 * This file re-exports from ui.ts for backwards compatibility.
 *
 * @deprecated Import from '../ui' instead
 */

export {
  useUIStore as useSidecarStore,
  // Types
  type SidecarSection,
  type SidecarMode,
  type SidecarState,
  type UIState as SidecarStoreState,
  // Selectors
  selectSidecarOpen,
  selectSidecarSection,
  selectSidecarWidth,
  selectSidecarUserSelected,
  selectSidebarWidth,
  selectSidebarCollapsed,
  selectSidecar,
  selectIsSidecarVisible,
  selectActiveSidecarMode,
} from '../ui';

/**
 * Project Store — web surface canonical re-export.
 *
 * The single source of truth for project state is the persisted Zustand store
 * in `@agiworkforce/unified-chat`. Both the shared `ProjectGallery` /
 * `ProjectCard` components and the web-specific `ProjectSidebar` use the same
 * localStorage key (`agi-projects`) through this re-export.
 *
 * The `Project` type is also re-exported here so web components that import
 * `@features/projects/stores/project-store` continue to compile without
 * changes.
 */

import { useChatProjectStore } from '@agiworkforce/unified-chat';
import type { Project as UnifiedProject } from '@agiworkforce/unified-chat';

// Explicit type annotation prevents TS4023 "cannot be named" errors when
// the internal ProjectState from the package is not publicly exported.
export const useProjectStore: typeof useChatProjectStore = useChatProjectStore;
export type { UnifiedProject as Project };

/**
 * Static accessor for use outside React components (e.g., in service functions).
 * Returns the instructions for the currently active project.
 */
export function getActiveProjectInstructions(): string {
  return useChatProjectStore.getState().getActiveProjectInstructions();
}

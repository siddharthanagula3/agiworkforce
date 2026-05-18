/**
 * @deprecated Barrel re-export — file moved to src/features/projects/stores/project-store.ts
 * This file exists to preserve the public import path during Phase 5 migration.
 * Do not add new code here. Import from src/features/projects/ directly for new code.
 */
export {
  useProjectStore,
  getActiveProjectInstructions,
} from '../../../src/features/projects/stores/project-store';
export type { Project } from '../../../src/features/projects/stores/project-store';

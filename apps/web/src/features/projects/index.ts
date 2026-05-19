/**
 * src/features/projects — public API barrel
 *
 * Project management: grouped conversations with shared context and
 * custom instructions. Similar to claude.ai Projects.
 *
 * Migrated from apps/web/features/projects/ — Phase 5, 2026-05-18
 */

export { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
export { ProjectSidebar } from './components/ProjectSidebar';
export { useProjectStore, getActiveProjectInstructions } from './stores/project-store';
export type { Project } from './stores/project-store';

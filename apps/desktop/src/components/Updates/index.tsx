/**
 * Legacy barrel re-export — DO NOT add new code here.
 *
 * The Updates feature has moved to src/features/updates/.
 * This file exists solely to keep existing import paths working
 * during the Phase 5 incremental migration.
 *
 * When all callers have been updated to import from
 * '../../features/updates' (or via path aliases), this file
 * will be deleted and this directory removed.
 */
export { UpdateChecker, UpdateDialog } from '../../features/updates';

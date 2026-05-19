/**
 * Legacy barrel re-export — DO NOT add new code here.
 *
 * All UI primitives have moved to src/ui/ in Phase 5 reorg.
 * Individual per-file stubs exist alongside this barrel so that
 * both '../ui' (barrel) and '../ui/Button' (direct) callers resolve.
 *
 * Step B (deferred): once all callers are updated to import
 * directly from src/ui/, this directory will be deleted.
 */
export * from '../../ui';

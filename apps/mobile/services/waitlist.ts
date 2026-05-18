/**
 * Temporary barrel — kept while the mobile pilot reorg migrates callers
 * to the new path `@/src/features/waitlist`.
 *
 * Real implementation lives at apps/mobile/src/features/waitlist/service.ts.
 * Once every call site has been migrated to the new path, this barrel will
 * be removed in a follow-up cleanup commit (see tasks/team-status/reorg-mobile-pilot.md).
 *
 * Do NOT add new symbols here — add them at the canonical location.
 */
export * from '@/src/features/waitlist/service';

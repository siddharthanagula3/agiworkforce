/**
 * Expo route wrapper — keeps the `/(app)/settings/capabilities` route shape
 * sacred per docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/settings/capabilities/index.tsx.
 *
 * Nested-naming convention: see apps/mobile/app/(app)/settings/personalization.tsx
 * (canonical commentary) and apps/mobile/src/README.md.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/settings/capabilities';

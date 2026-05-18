/**
 * Expo route wrapper — keeps the `/(app)/settings/notifications` route shape
 * sacred per docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/settings/notifications/index.tsx.
 *
 * Nested-naming convention: see apps/mobile/app/(app)/settings/personalization.tsx
 * (canonical commentary) and apps/mobile/src/README.md. The settings cluster
 * groups under src/features/settings/<screen>/ to mirror Expo's directory
 * shape 1:1 and keep the top-level features/ namespace clean.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/settings/notifications';

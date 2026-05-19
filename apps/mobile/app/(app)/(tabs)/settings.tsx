/**
 * Expo route wrapper — keeps the `/(app)/(tabs)/settings` tab route shape
 * sacred per docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/settings/index.tsx.
 *
 * CONVENTION (completed for the settings cluster):
 *   src/features/settings/
 *     ├── index.tsx                       # cluster tab/landing screen (this file)
 *     ├── personalization/index.tsx
 *     ├── notifications/index.tsx
 *     └── capabilities/index.tsx
 *
 *   A feature cluster's `index.tsx` is the cluster's tab/landing screen.
 *   Sub-screens live in subdirectories. See apps/mobile/src/README.md and
 *   apps/mobile/app/(app)/settings/personalization.tsx for the canonical
 *   commentary on the nested-settings naming convention.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/settings';

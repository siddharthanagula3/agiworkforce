/**
 * Expo route wrapper — keeps the `/(app)/settings/personalization` route shape
 * sacred per docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/settings/personalization/index.tsx.
 *
 * NAMING CONVENTION (settings cluster):
 *   We use a NESTED layout — `src/features/settings/<screen>/` rather than
 *   kebab `src/features/settings-<screen>/`. The mobile app will accumulate
 *   ~8 settings sub-screens (personalization, notifications, memory, storage,
 *   capabilities, integrations, auto-approve, performance). Nesting:
 *     - mirrors Expo's own `app/(app)/settings/<screen>` directory shape 1:1,
 *     - keeps the top-level `features/` namespace clean (one entry per
 *       feature, not one entry per screen), and
 *     - leaves room for shared settings primitives at
 *       `src/features/settings/_shared/` later.
 *   See apps/mobile/src/README.md for the layer-map rules.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/settings/personalization';

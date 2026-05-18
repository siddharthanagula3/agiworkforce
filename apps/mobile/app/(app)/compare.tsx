/**
 * Expo route wrapper — keeps the `/compare` route shape sacred per
 * docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/compare/index.tsx.
 * The wrapper exports the same default component so Expo router picks it up
 * unchanged.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/compare';

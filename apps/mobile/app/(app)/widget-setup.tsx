/**
 * Expo route wrapper — keeps the `/(app)/widget-setup` route shape sacred
 * per docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/widget-setup/index.tsx.
 * The wrapper exports the same default component so Expo router picks it up
 * unchanged.
 *
 * Status: this screen is marked "(defer)" in the orchestration plan — TL has
 * paused active development pending v1.1 widget work. The migration preserves
 * the route shape with no behavior change.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/widget-setup';

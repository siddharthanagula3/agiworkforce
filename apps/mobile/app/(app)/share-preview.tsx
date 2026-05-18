/**
 * Expo route wrapper — keeps the `/share-preview` route shape sacred per
 * docs/plans/UNIFIED_LAUNCH_PLAN.md mobile-pilot reorg.
 *
 * Real implementation lives at apps/mobile/src/features/share-preview/index.tsx.
 * The wrapper exports the same default component so Expo router picks it up
 * unchanged. The route is invoked from app/_layout.tsx via the path string
 * `/(app)/share-preview?text=...` which resolves by filename, not content.
 *
 * Do NOT add logic here — implement at the canonical location.
 */
export { default } from '@/src/features/share-preview';

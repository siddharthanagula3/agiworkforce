/**
 * Expo route wrapper — `/(app)/settings/permissions/[permission]`
 *
 * Real implementation at apps/mobile/src/features/settings/permissions/detail.tsx.
 * The `[permission]` segment is read via `useLocalSearchParams<{ permission: string }>()`.
 * Per the settings cluster convention: do NOT add logic here.
 */
export { default } from '@/src/features/settings/permissions/detail';

/**
 * (public) route group layout — unauthenticated screens (onboarding).
 * This group exists so expo-router generates typed route paths for
 * `/(public)/onboarding` instead of the bare `/onboarding` path that
 * required `as any` casts in _layout.tsx.
 *
 * Audit fix F7 (2026-05-05): moved onboarding.tsx into this group to
 * resolve `as any` router.replace casts at _layout.tsx:225, 234.
 */
import { Slot } from 'expo-router';

export default function PublicLayout() {
  return <Slot />;
}

/**
 * Legacy barrel re-export — DO NOT add new code here.
 *
 * The Onboarding feature has moved to src/features/onboarding/.
 * This file exists solely to keep App.tsx's lazy import working:
 *   import('./components/Onboarding').then((m) => ({ default: m.OnboardingWelcome }))
 *
 * LOCKED: OnboardingWizard is the ONE onboarding flow (CLAUDE.md).
 * ModeSelectionDialog was removed; do not reintroduce it here.
 */
export * from '../../features/onboarding';

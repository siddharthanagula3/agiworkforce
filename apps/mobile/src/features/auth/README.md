# apps/mobile/src/features/auth

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile sign-in forms, OAuth entry points, age gate, biometric gate, and authentication state.

## Rules

- Import auth UI through `@/src/features/auth`.
- Import auth state from `@/src/features/auth/store`.
- Import age-gate helpers from `@/src/features/auth/services/ageGate`.
- Import biometric gate hooks from `@/src/features/auth/hooks/useBiometricGate`.
- Do not put provider secrets, redirect URLs, or token handling inside UI components.

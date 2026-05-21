# apps/mobile/src/features/auth

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile sign-in forms, OAuth entry points, and authentication presentation.

## Rules

- Import auth UI through `@/src/features/auth`.
- Auth network/session state stays in `stores/authStore.ts` or approved auth services.
- Do not put provider secrets, redirect URLs, or token handling inside UI components.

# AGI Workforce — Test Coverage Report

Generated: 2026-03-06
Status: IN PROGRESS (Waves 4+)

## Test Framework

- Desktop (apps/desktop): Vitest + @testing-library/react
- Web (apps/web): Vitest + @testing-library/react + Playwright (E2E)
- Rust (apps/desktop/src-tauri): cargo test

## Coverage Goals

- Every exported function: happy path + 2 error cases minimum
- Mock all: Supabase, LLM APIs, Tauri IPC (invoke), sonner toasts
- Test store actions with mock invoke responses
- Test React components with mocked stores

---

## Test Files Written

| Source File           | Test File | Coverage | Status |
| --------------------- | --------- | -------- | ------ |
| (agents fill this in) |           |          |        |

---

## Existing Tests (pre-audit)

- apps/desktop/src/**tests**/memory.test.ts
- apps/desktop/src/**tests**/scheduler.test.ts
- apps/desktop/src/lib/**tests**/modelRouter.coderabbit.test.ts
- apps/desktop/src/stores/**tests**/settingsStore.features.test.ts
- apps/web/features/support/pages/SupportPage.test.tsx
- apps/web/**tests**/api/voice-transcribe.test.ts
- apps/web/shared/stores/authentication-store.test.ts
- services/api-gateway/**tests**/middleware/auth.test.ts

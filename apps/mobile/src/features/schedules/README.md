# apps/mobile/src/features/schedules

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile schedule creation, schedule list presentation, run history, schedule API calls, and schedule state.

## Public API

- `index.ts` is the only import surface for route screens and other features.
- `components/` owns schedule UI.
- `service.ts` owns `/api/schedules` calls.
- `store.ts` owns schedule state, persistence, and run-history cache.

## Import Rules

- New schedule callers import from `@/src/features/schedules`.
- Do not add code back under `apps/mobile/components/schedules`, `apps/mobile/services/schedules.ts`, or `apps/mobile/stores/scheduleStore.ts`.
- Schedule components may import shared UI from `@/components/ui` until the Mobile UI migration is complete.
- Schedule I/O stays in `service.ts`; route screens should go through `useScheduleStore`.
- Scheduled runs currently persist and execute saved prompt text only. Do not expose attachment
  controls until the Managed Cloud schedule contract owns durable, revocable asset references.

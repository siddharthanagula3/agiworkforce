# apps/mobile/src/features/messaging

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile messaging platform setup, connection status UI, messaging API calls, and messaging connection state.

## Public API

- `index.ts` is the domain import surface.
- `components/` owns messaging UI.
- `service.ts` owns messaging API calls.
- `store.ts` owns messaging state and local persistence.

## Rules

- Import messaging code through `@/src/features/messaging`.
- Do not add code back under `apps/mobile/components/messaging`, `apps/mobile/services/messaging.ts`, or `apps/mobile/stores/messagingStore.ts`.
- Messaging provider credentials must stay behind secure storage or backend-approved flows.

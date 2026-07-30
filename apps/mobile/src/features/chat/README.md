# apps/mobile/src/features/chat

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile chat transcript, composer, attachments, citations, tool-call UI, mode controls, and export/prompt surfaces.

## Routes

- `app/(app)/(tabs)/chat.tsx` owns the composer-first new-chat surface.
- `app/(app)/chats/index.tsx` owns the unbounded mode-scoped history, filters, and grouped global search.
- `app/(app)/chat/[id].tsx` owns an individual transcript.

## Rules

- Import chat UI through `@/src/features/chat`.
- Chat state stays in chat stores; components should remain presentation and interaction surfaces.
- Voice, model selection, project, billing, and companion capabilities should be imported from their owning feature domains.
- Shared UI primitives still come from `@/components/ui` until the mobile UI primitive migration is complete.
- Global search may project authorized chat, project, Library, file-attachment, and artifact metadata, but must preserve the Local/Managed Cloud mode boundary.

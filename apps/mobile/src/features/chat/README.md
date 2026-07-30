# apps/mobile/src/features/chat

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile chat transcript, composer, attachments, citations, tool-call UI, mode controls, and export/prompt surfaces.

## Rules

- Import chat UI through `@/src/features/chat`.
- Chat state stays in chat stores; components should remain presentation and interaction surfaces.
- Voice, model selection, project, billing, and companion capabilities should be imported from their owning feature domains.
- Shared UI primitives still come from `@/components/ui` until the mobile UI primitive migration is complete.

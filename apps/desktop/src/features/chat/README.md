# apps/desktop/src/features/chat

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Desktop unified agentic chat surface, message stream, composer, command palette, sidecar, inline tool results, artifact previews, approvals, chat widgets, and chat-specific hooks.

## Rules

- Keep Desktop chat UI and chat-only hooks here.
- Shared stores, provider routing, Tauri IPC, and reusable runtime code stay in their existing platform/store/service boundaries until a second consumer justifies extraction.
- Import shared primitives from `@/components/ui` and other still-legacy Desktop component domains through `@/components/<domain>`.
- Do not add chat UI back under `src/components/UnifiedAgenticChat`.

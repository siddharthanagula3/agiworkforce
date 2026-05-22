# apps/web/features/chat

Status: Current
Owner role: Web lead
Last updated: 2026-05-21
Purpose: Web chat experience, composer, message rendering, artifacts, and chat-side interactions.

## Rules

- Chat UI and chat-specific state live here.
- Shared chat contracts should come from `@agiworkforce/types` or `@agiworkforce/unified-chat`.
- Do not place provider-specific SDK calls in React components.

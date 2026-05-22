# apps/mobile/src/features/sidebar

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile conversation sidebar, search, tag filters, and conversation-list presentation.

## Rules

- Import sidebar UI through `@/src/features/sidebar`.
- Conversation data and grouping state belong in chat stores/helpers.
- Keep sidebar components reusable by drawer/chat routes without owning route state.

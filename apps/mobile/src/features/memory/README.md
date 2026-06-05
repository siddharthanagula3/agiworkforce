# apps/mobile/src/features/memory

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile memory state, local memory import, context budgeting, compaction, and on-device RAG indexing.

## Rules

- Import memory state from `@/src/features/memory/store`.
- Import memory services from `@/src/features/memory/services/*`.
- Keep storage table access in `storage/`; memory services may call storage APIs but UI components should not.
- Do not add cloud sync behavior without explicit Local and Managed Cloud privacy-mode review.

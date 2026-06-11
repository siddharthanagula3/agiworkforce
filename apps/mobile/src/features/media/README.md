# apps/mobile/src/features/media

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-11
Purpose: Mobile media-picking helpers for converting user-selected photos into chat attachments.

## Public API

- `index.ts` is the domain import surface.
- `photoPicker.ts` owns image-library selection and conversion to chat attachments.

## Rules

- Import media helpers through `@/src/features/media`.
- Keep user-selected media local unless the user explicitly sends it to Cloud.
- Do not request broader media permissions than the picker flow needs.

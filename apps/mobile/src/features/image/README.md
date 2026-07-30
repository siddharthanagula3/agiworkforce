# apps/mobile/src/features/image

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile image-question UI, image generation, OCR, vision routing, and image-adjacent runtime status presentation.

## Rules

- Import image UI through `@/src/features/image`.
- Import image generation, OCR, and vision services from `@/src/features/image/services/*`.
- Keep heavy media processing out of route screens.

# apps/mobile/src/features/image

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile image-question UI and image-adjacent runtime status presentation.

## Rules

- Import image UI through `@/src/features/image`.
- Image generation, OCR, and vision service calls stay in their owning services until a fuller image domain migration.
- Keep heavy media processing out of route screens.

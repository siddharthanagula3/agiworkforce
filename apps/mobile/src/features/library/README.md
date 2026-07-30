# Library

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-05
Purpose: Mobile library UI for browsing generated artifacts and collected images from chat sessions.

## Overview

- `index.tsx` — Library screen for browsing and managing generated content
- `collectGeneratedImages.ts` — Service for collecting and cataloging generated images from artifacts
- The route accepts an `imageId` search-result handoff and opens only an image already present in the authorized mode-scoped Library projection.

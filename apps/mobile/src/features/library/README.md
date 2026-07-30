# Library

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-05
Purpose: Mobile Library UI for browsing generated images, uploaded documents, and artifacts from chat sessions.

## Overview

- `index.tsx` — Mode-scoped Library screen with All, Images, Documents, and Artifacts axes plus local search
- `collectGeneratedImages.ts` — Service for collecting and cataloging generated images from artifacts
- The route accepts an `imageId` search-result handoff and opens only an image already present in the authorized mode-scoped Library projection.
- Documents are projected from attachment metadata already persisted with authorized transcripts. The Library does not copy file bytes or create a second cross-account index.
- Local mode reads only local conversations. Managed Cloud reads only the current account's Cloud conversation store, which is cleared and rehydrated on account transitions.
- Document cards open their source chat. `AddToChatSheet` exposes the same projection for re-attachment; owner-scoped Cloud assets reuse their existing `assetId`, while Local files retain their device URI.
- Search filters the in-memory authorized projection by image prompt/source, document name/MIME/source conversation, and artifact title/content/kind/language/source. It makes no remote search request.

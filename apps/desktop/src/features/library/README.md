# apps/desktop/src/features/library

Status: Current
Owner role: Desktop lead
Last updated: 2026-07-27
Purpose: Desktop host adapter for the shared Library surface (Managed Cloud files).

## What lives here

`DesktopLibrary.tsx` only. The Library view itself is
`LibraryView` in `@agiworkforce/unified-chat`, shared with web so the two
surfaces cannot drift — desktop is meant to work like web, and two
implementations of one screen is how that stops being true.

This adapter supplies the four things that differ per host, via
`LibraryTransport`:

| transport     | web                         | desktop                           |
| ------------- | --------------------------- | --------------------------------- |
| `isSignedIn`  | Clerk `useAuth`             | `selectHasCloudAccountSession`    |
| `listPage`    | same-origin cookie fetch    | `cloudFetch` + absolute Cloud URL |
| `fetchAsset`  | same-origin cookie fetch    | `cloudFetch`                      |
| `restoreItem` | POST with an `x-csrf-token` | `cloudFetch` (bearer token)       |
| `openPreview` | `window.open` new tab       | `openExternalUrl` (OS browser)    |

## Trust boundary

Library is Managed Cloud only. The files it lists live in cloud storage, so a
Local session has nothing to show here and the sidebar entry is not offered in
Local mode — Artifacts is the device-side equivalent. Signed out, this renders
an explicit sign-in prompt rather than an empty grid, because "you have no
files" and "we cannot see your files" are different statements.

## Note on URLs

`LibraryItem.uri` may be relative (`/api/files/{id}`). Web resolves that against
its own origin; desktop has no origin, so `absoluteCloudUrl()` joins it to
`CLOUD_API_BASE_URL`. A relative URL reaching a Tauri webview would resolve to
`tauri://localhost` and 404.

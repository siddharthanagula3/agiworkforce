# apps/mobile/src/features/code-sessions

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile Code session list, archive view, detail preview, mode picker, and Desktop or future Cloud Managed environment handoff.

## Routes

- `app/(app)/code/index.tsx`
- `app/(app)/code/[id].tsx`
- `app/(app)/code/archived.tsx`

## Rules

- Environment starts must route to Desktop pairing or Cloud Managed waitlist.
- Keep session data, modal components, and types in this feature folder.
- Do not introduce mobile-local shell execution, package install, or browser automation.

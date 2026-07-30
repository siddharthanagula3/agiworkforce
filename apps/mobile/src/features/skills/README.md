# Mobile Skills

Status: Current
Owner: Mobile surface lead
Trust boundary: Managed Cloud

## Purpose

This feature owns Mobile's supported, read-only view of the authenticated
Managed Cloud Skill catalog.

## Product contract

- `GET /api/skills` is the only catalog source.
- The client validates every response before rendering it.
- The route requires a loaded Clerk session and active Cloud mode.
- Local Mode never calls the catalog endpoint.
- The screen supports search, source badges, refresh, loading, error, and
  teaching empty states.
- Mobile does not install, edit, enable, or remove filesystem-backed Skills.
  Those controls must stay absent until an owner-scoped mutation lifecycle
  exists.

## Ownership

- `service.ts` owns the authenticated API client and response validation.
- `SkillsScreen.tsx` owns the route UI and Local/Cloud gate.
- `app/(app)/skills/index.tsx` remains a route-only wrapper.

## Verification

- `apps/mobile/__tests__/skills-service.test.ts`
- `apps/mobile/__tests__/skills-page.test.tsx`
- `apps/mobile/__tests__/drawer-content.test.tsx`
- `apps/mobile/__tests__/drawer-route-contract.test.ts`

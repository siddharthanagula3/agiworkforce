# Mobile Team (Workspace)

Status: Current
Owner: Mobile surface lead
Trust boundary: Managed Cloud

## Purpose

This feature owns Mobile's view of the Managed Cloud workspace the account
belongs to — its members and the member add, role change, and remove actions —
against the same routes the web Team section uses.

## Product contract

- `GET /api/settings/organization` returns the workspace plus server-computed
  access.
- `GET /api/settings/team` lists members; `POST /api/settings/team` adds an
  existing AGI account by email.
- `PATCH /api/settings/team/:memberId` changes a role;
  `DELETE /api/settings/team/:memberId` removes a member.
- ENTITLEMENT: `access.canManageTeam` is computed server-side and is the only
  thing this app may gate on. Mobile must not re-derive management rights from
  a local plan/tier capability check — the client previously did and could
  disagree with the server in both directions.
- Roles are `owner`, `admin`, `member`, `viewer`; the server owns role
  semantics.

## Ownership

- `service.ts` owns the authenticated API client and response shaping.
- `app/(app)/settings/workspace.tsx` owns the route UI.

## Verification

- No dedicated test suite exists yet for this service or screen; this is a
  tracked gap, not verified behavior.
  `apps/mobile/__tests__/remote-workspace-boundary-notice.test.tsx` covers the
  adjacent boundary notice only.

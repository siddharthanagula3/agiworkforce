# apps/mobile/src/features/shared-links

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-27
Purpose: List the conversations this account has published as read-only links, and revoke them.

## Public API

- `index.ts` is the only import surface for route screens and other features.
- `service.ts` owns the `/api/share` calls.

## Endpoints

- `GET /api/share` — the caller's own links. Owner-scoped server-side; it never
  returns message bodies, and it returns expired rows with `expired: true`
  rather than omitting them so a lapsed link stays revocable.
- `DELETE /api/share/:token` — revoke one.

## Notes

Access control lives on the server. Nothing here filters by owner, and it must
not start to — a client-side filter would imply a guarantee this code cannot
make.

Rows missing a `token` or `shareUrl` are dropped rather than rendered: neither
the share nor the revoke action can work without them, so the card would only
offer dead controls.

This screen previously shipped a "Coming soon" placeholder behind an invite
modal. Sharing had in fact been live on web for some time; only the list
endpoint was missing. The invite gate itself was removed by the 2026-06-27
public-alpha decision.

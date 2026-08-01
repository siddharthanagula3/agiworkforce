# Mobile Archived Chats

Status: Current
Owner: Mobile surface lead
Trust boundary: Managed Cloud

## Purpose

This feature owns Mobile's list of archived Managed Cloud conversations and
the restore, delete-one, and delete-all actions on them. It mirrors the web
Settings → Archived chats section against the same endpoints and wire schemas
rather than defining a second mobile-only contract.

## Product contract

- `GET /api/chat/conversations?archived=only` is the only list source.
- `PUT /api/chat/conversations/:id` restores (`{ archived: false }`).
- `DELETE /api/chat/conversations/:id` deletes one conversation.
- `POST /api/chat/conversations/bulk` deletes every archived chat.
- All four routes are owner-scoped server-side; the client performs no access
  control of its own.
- Page size matches web (50) so both surfaces paginate identically.
- Local conversations are never listed here; archiving is a Cloud-only
  concept on this screen.

## Ownership

- `service.ts` owns the authenticated API client and response validation via
  `@agiworkforce/cloud-contracts` schemas.
- `app/(app)/settings/archived-chats.tsx` owns the route UI.
- `src/features/drawer/components/DrawerContent.tsx` owns the entry point.

## Verification

- No dedicated test suite exists yet for this service or screen; this is a
  tracked gap, not verified behavior. Coverage entering through
  `apps/mobile/__tests__/settings-page.test.tsx` exercises only navigation.

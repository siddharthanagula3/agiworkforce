# Mobile Reflect

Status: Current
Owner: Mobile surface lead
Trust boundary: Managed Cloud

## Purpose

This feature owns Mobile's read-only view of the server-built Reflect recap —
how this account uses AGI over a selected range — rendered from the same
`/api/reflect` response the web Settings → Reflect section reads.

## Product contract

- `GET /api/reflect?range=&timezone=` is the only recap source; the recap is
  built server-side on each read, so nothing is cached or persisted here.
- Supported ranges are 30d, 90d, 180d, and 365d.
- A `409 memory_required` response means the account has memory turned off.
  It is a normal state to render (`ReflectMemoryRequiredError`), not a
  failure.
- The client validates every response against
  `ManagedCloudReflectRecapSchema` before rendering.
- Local Mode never calls the recap endpoint.

## Ownership

- `service.ts` owns the authenticated API client, range constants, and
  response validation via `@agiworkforce/cloud-contracts`.
- `app/(app)/settings/reflect.tsx` owns the route UI.

## Verification

- No dedicated test suite exists yet for this service or screen; this is a
  tracked gap, not verified behavior.

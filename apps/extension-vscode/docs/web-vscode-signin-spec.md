# Web/VS Code Device Sign-In Contract

Status: Implemented

Owners: Web + VS Code

Last updated: 2026-07-26

VS Code uses the shared, secretless RFC 8628-style device authorization flow.
No client secret, shared encryption key, custom URI scheme, or
`/connect/vscode` route is required.

## Contract

1. The extension calls `POST /api/auth/device/code` with
   `{ "surface": "vscode" }`.
2. Web creates a 15-minute pending authorization and returns
   `device_code`, `user_code`, `verification_uri`,
   `verification_uri_complete`, `interval`, and `expires_in`.
3. The extension opens the same-origin `/auth/device` page. The page requires a
   signed-in user and an explicit approval click.
4. The extension polls `POST /api/auth/device/token` with the opaque
   `device_code`.
5. After approval, Web atomically consumes the code and returns a seven-day,
   revocable Bearer credential. The extension stores it in VS Code
   `SecretStorage`.
6. Sign-out calls the shared logout route and clears the local credential.

The Web route maps the `vscode` surface to **AGI for VS Code**, so the browser
approval page identifies the requesting client correctly.

## Security properties

- Approval is explicit and occurs in the user's normal browser session.
- The opaque device code is the polling secret and must never be logged.
- Codes expire, are single-use, rate-limited, and stored server-side.
- The verification URL must remain on the configured AGI Web origin.
- A marketplace extension contains no reusable client secret.
- Authentication is separate from model entitlement and trust-boundary
  selection; successful sign-in does not silently move a Local session to
  Managed Cloud.

## Product behavior

Managed Cloud is public alpha and open by default for signed-in users. There is
no Hobby tier and no private-beta/waitlist front door. Plan, usage, provider,
and model admission remain server-authoritative at inference time. The editor
hydrates plan and subscription status from `/api/usage`; only active and
trialing paid subscriptions retain paid client capabilities. Account actions
link to the existing Web usage, billing, connector, and Team surfaces.

## Source paths

- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`
- `apps/web/app/api/auth/device/code/route.ts`
- `apps/web/app/api/auth/device/approve/route.ts`
- `apps/web/app/api/auth/device/token/route.ts`
- `apps/web/app/auth/device/page.tsx`
- `packages/contracts/types/src/auth.ts`

# Desktop Auth Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop Cloud sign-in page and the native in-app sign-in it
runs by default.

## Shape (founder decision, 2026-08-01)

Sign-in happens **inside the app**. There is no redirect and no device code for
email sign-in.

- `NativeSignInCard.tsx` renders the inline form: email + password, email
  one-time code, and multi-factor (TOTP, SMS, backup code).
- `services/clerkNativeAuth.ts` speaks Clerk's Frontend API directly using the
  native contract (`_is_native=1`, cookie-less, client JWT in the
  `authorization` header). Every route and field is verified against the Clerk
  SDKs installed in this repo — see the file header for where each was read.
- `services/desktopNativeSignIn.ts` exchanges the resulting Clerk session for
  the SAME first-party device credential the browser-approval path produces, so
  there is exactly one vault, one refresh route, and one expiry schedule.
- `services/desktopSocialSignIn.ts` handles Google / Microsoft / Apple. Those
  providers refuse OAuth inside embedded webviews, so that hop opens the system
  browser and returns via the `agiworkforce://sso-callback` deep link. It is the
  single accepted exception and always shows a pending state with a cancel.

The Clerk FAPI transport runs in Rust
(`src-tauri/src/sys/account/clerk_native.rs`) because a Clerk production
instance validates the browser `Origin`, and the Tauri webview origin is not an
allowed web origin for the instance. The Rust command allowlists the exact
sign-in and session-token routes of the one instance our publishable key names.

## Boundaries

- Keep auth feature-specific UI and local composition in this folder.
- Credentials go only to Clerk. Never log, persist, or forward a password, a
  one-time code, or the Clerk client JWT. Durable AGI Cloud credentials belong
  in the existing native vault via `cloudAccountAuth`; do not add a second one.
- Local Mode needs no account and must stay fully usable. Native sign-in refuses
  to run inside the Local/BYOK trust boundary.
- Browser-approval (device authorization) stays reachable as an explicit
  fallback and must keep working — the CLI uses the same grant.
- Password reset and account creation are refused in-app with a visible link to
  the web app. Do not half-implement them here.
- Every failure must state what actually happened. A 5xx is a service fault and
  must never be rendered as an account or credential rejection.
- Keep shared state, runtime bridges, and API clients in their existing shared
  roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.

## Configuration

`VITE_CLERK_PUBLISHABLE_KEY` must name the same Clerk instance the web app uses
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`). When it is unset the form hides itself,
says so, and the browser-approval fallback takes over.

For social/SSO, `agiworkforce://sso-callback` must be registered as an allowed
redirect URL on the Clerk instance; Clerk only appends the
`rotating_token_nonce` the callback needs when it is. A callback without the
nonce is surfaced as a configuration error, not a hang.

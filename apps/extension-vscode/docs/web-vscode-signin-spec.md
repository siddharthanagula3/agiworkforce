# Web spec — VS Code (cloud-only) sign-in endpoint

Status: **TODO — owned by the WEB surface.** The VS Code extension side is built and
waiting on this. Auth/session-sensitive → requires security review.

## Why

The VS Code extension is AGI-Managed-Cloud-only. It cannot reuse the desktop's
`/api/auth/desktop-token` flow because that hands back an **encrypted** token the
client decrypts with a **shared server secret** (`TOTP_ENCRYPTION_KEY`). A VS Code
extension ships to public marketplaces (and to Cursor/Windsurf/Antigravity via Open
VSX), so embedding that secret would let anyone forge logins.

Instead the extension uses a **secretless device flow** (RFC-8628 style): it polls
`POST /api/device/poll` and receives a **plaintext** Clerk token only after explicit
in-browser approval. `/api/device/{link,poll,approve}` already exist; the only missing
piece is a browser page that performs link + approve for a device the extension names.

## What the extension already does (no web action needed)

1. Derives a stable `device_id` (`vscode-<sha256(machineId:salt)[:48]>`, matches the
   server's `^[a-zA-Z0-9-_]{1,128}$`) and a `device_fingerprint`.
2. Opens `GET {webOrigin}/connect/vscode?device_id=<id>&device_fingerprint=<fp>&device_type=vscode`.
3. Polls `POST /api/device/poll {device_id, device_fingerprint}` every 4s for ~5 min,
   then stores the returned `access_token` as the account token (Bearer for all calls).

Source: `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`.

## What the WEB must build: `GET /connect/vscode`

A page (mirror the existing `/verify` UX + security) that:

1. Reads `device_id`, `device_fingerprint`, `device_type` from the query.
   - Validate `device_id` against `^[a-zA-Z0-9-_]{1,128}$`; require `device_fingerprint`.
2. If the user is **not signed in** → redirect to
   `/login?redirectTo=/connect/vscode?...` (Clerk), same as `/verify`.
3. If **signed in** → show an explicit **"Connect VS Code to AGI Cloud"** approval
   screen (anti-phishing: do NOT auto-approve; require a click, like `/verify`).
4. On **Approve** (authenticated, same-origin → CSRF token available):
   1. `POST /api/device/link` `{ device_id, device_name: "VS Code", device_type: "vscode", device_fingerprint }`
      → returns `{ link_code }` (creates a pending code bound to this device_id).
   2. `POST /api/device/approve` `{ code: link_code }` → attaches the caller's Clerk
      session token (encrypted at rest) to the code.
   3. Show "✅ VS Code connected — return to your editor." The extension's poll then
      consumes the token exactly once.

## Also: add a `"vscode"` device-type label

`/api/device/link` `resolvedDeviceType` and the approve UI currently label devices
desktop/CLI. Add a `vscode` case so the approval screen reads "VS Code", not "desktop".

## Security (already enforced by existing endpoints — keep)

- Explicit user approval (no silent grant); device fingerprint binding (poll 403 on
  mismatch); 15-min code expiry; one-time atomic consume; tokens encrypted at rest.
- No client secret anywhere in the extension. The token only leaves the server after
  the signed-in user approves, and only to the fingerprint-bound device.

## Managed-cloud gate

Signed-in users should resolve to the **free Hobby tier by default** (the live web
free tier) so the extension answers immediately; premium stays gated by the existing
`buildManagedComputeGateResponse` / paywall (no change needed here).

## Done = the extension answers

Once `/connect/vscode` is live, installing the extension → "Sign in to AGI Cloud" →
approve in browser → chat answers on the free Hobby tier, identically in VS Code,
Cursor, Windsurf, and Antigravity.

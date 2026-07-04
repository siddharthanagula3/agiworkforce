# Feature Kill Switches — AGI Mobile v1.2.0

> Authoritative reference for disabling risky features without an app
> update. "Kill switch" means: the feature is hidden from every
> navigation path in the running binary, with no restart required.
>
> Decision: AGI Mobile v1 uses **local runtime flags** (MMKV-backed), not remote
> config. Rationale:
>
> - Local Mode is the v1 demo path. A remote kill switch that requires a
>   network call to function is useless for users without connectivity,
>   and also requires a backend dependency that is not in the v1
>   scope.
> - Local flags in MMKV are synchronous and available before the first
>   render frame, which prevents a race-condition where a risky
>   feature shows briefly before the remote fetch resolves.
> - The App Store / Play Store review team sees the same binary as
>   end users. Local flags let us demo a feature to reviewers (by
>   setting the flag manually in a debug build) or disable it globally
>   by shipping a flag-flip OTA — but v1 has OTA disabled, so the only
>   OTA vector is a full binary update anyway.
>
> When AGI Cloud is active beyond invite-gated testing, migrate these to a remote flag
> system (e.g. Clerk-authenticated Web/API remote config + MMKV cache) so a server-
> side flip takes effect on next app foreground without an app update.

---

## How kill switches work in v1

All kill switches are derived from `apps/mobile/lib/v1FeatureFlags.ts`,
a compile-time constant object (`as const`). Every risky feature has
a flag there. The UI, service layers, and store actions all guard on
`FEATURES.<flag>` before doing anything.

To disable a feature before a binary is submitted:

1. Set the flag to `false` in `v1FeatureFlags.ts`.
2. Run `pnpm --filter @agiworkforce/mobile typecheck` — must pass.
3. Submit the new binary.

Because `FEATURES` is `as const`, TypeScript enforces that every call
site handles both `true` and `false` states. There are no runtime
toggle methods in v1.

---

## Kill switch inventory

### Image generation (`FEATURES.imageGen`)

**Current state:** `true` — live in v1.2.0 (Cloud mode only).

What it controls:

- The "Generate image" option in the composer action sheet.
- Model responses that return an `image_gen` tool call are rendered.
- Requests route through the Cloud provider path; not available in
  Local Mode.

To kill in an emergency: set `imageGen: false` in `v1FeatureFlags.ts`,
typecheck, and ship a binary update (see Emergency response playbook
below — no remote flip in v1).

**Review impact:** the store listing now discloses image generation
(`description` / `whats_new` in `LISTING-METADATA-IOS.json` and
`LISTING-METADATA-ANDROID.json`). Confirm Apple 1.1.1 / Google Play
content-policy pre-screening is wired for the active image gen provider
before each submission.

---

### Voice cloning / TTS synthesis (`FEATURES.voiceCloning`)

**Current state:** `false` — flag reserved; feature not yet built.

What it controls (when implemented):

- The "Clone voice" option in Settings → Voice.
- Any `tts_synthesis` tool call that references a cloned voice model.

How to flip on:

- Requires Apple's additional App Review approval for voice cloning
  features under Guideline 1.1.6 (apps that collect, transmit, or
  enable sharing of user's voice without consent). Legal review
  required before enabling.

---

### Voice input (`FEATURES.voiceInput`)

**Current state:** `true` — ships in v1 (on-device transcription only).

What it does:

- Enables the hold-to-talk mic button in the chat composer.
- Audio is transcribed on-device (Apple Speech / Android
  SpeechRecognizer). Raw audio is discarded immediately.
- Transcript is sent to the LLM provider the user picks, subject to
  the same consent flow as typed messages.

To disable without a binary update: not possible in v1 (local flags
only, no runtime toggle). To kill in an emergency, ship a binary with
`voiceInput: false`. Turn-around: ~24 hours on iOS (expedited review),
~2 hours on Android (no review gating for flag-only changes if OTA
were enabled — OTA is disabled in v1, so binary update required).

---

### Cloud chat / sync (`FEATURES.cloudChat`)

**Current state:** `true` — AGI Cloud is public alpha, open by default to
any signed-in user (founder decision 2026-06-27/28). There is no invite
or waitlist gate; signing in via Clerk AuthView IS the entitlement. The
server-side `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an incident-response
kill switch only (set to `0`/`false`/`off` to re-gate), not a launch gate.

What it controls:

- Whether Cloud mode (chat sync, image generation, web search) is reachable
  at all — `FEATURES.v1LocalOnly` must stay `false` for `cloudChat: true` to
  take effect (setting both `true` deadlocks Cloud mode dead while the UI
  still shows it — see `v1FeatureFlags.ts`).
- Local Mode continues to work fully offline with no account required;
  Cloud sign-in is opt-in.

To kill in an emergency (re-gate Cloud entirely): set the
`AGI_MANAGED_COMPUTE_PRIVATE_BETA` server env to `0`/`false`/`off` for an
instant server-side rollback, or ship a binary with `cloudChat: false` if
the client itself must stop offering the entry point.

---

### Billing / subscriptions (`FEATURES.billing`, `FEATURES.iap`)

**Current state:** both `false` — no StoreKit 2 / Google Billing Library
code path is reachable, and no server-side purchase receipt verification
exists yet (see `useIapPurchaseFlow.ts` and the open IAP work item).

What it controls:

- No native in-app purchase flow is reachable from either store's billing
  library.

**Separate from billing/IAP:** as of the 2026-07-04 05:17 commit
(`9bc2ca8bb`), the chat-paywall CTA (`PaywallBottomSheet.tsx`) no longer
opens a browser checkout — when `FEATURES.iap` is off it shows an
informational no-CTA message instead, specifically to stay out of
Guideline 3.1.1 territory on that surface. The web-checkout link still
exists, but only on the Settings → Billing screen
(`src/features/settings/cloud-billing/index.tsx` → "Upgrade plan" /
"Adjust plan" row), which opens `agiworkforce.com/pricing` in the system
browser. This is a web-link CTA, not an in-app purchase, and does not
require Apple / Google billing entitlements to exist. It DOES raise the
same Apple Guideline 3.1.1 / Google Play external-offers-policy question
about linking out to complete a paid subscription purchase from within
the app — moving the CTA off the paywall sheet did not remove the
underlying policy question, only relocate where it appears. That
question is unresolved — see `FOUNDER-SUBMISSION-CHECKLIST.md` Part D
item 11. Do not resolve it here; it needs founder + legal sign-off.

---

### Computer use (`FEATURES.computerUse`)

**Current state:** `false` — completely disabled in v1.

What it controls:

- The "Control my computer" action in the agent task sheet is hidden.
- Any `computer_use` tool call returned by a model is silently dropped.

Computer use on mobile has significant privacy implications (screen
capture, input injection). Do not enable without a dedicated privacy
review and App Store / Play Store pre-submission consultation.

---

### Dispatch / desktop companion (`FEATURES.dispatch`, `FEATURES.companion`)

**Current state:** both `false` — completely disabled in v1.

What they control:

- The QR-code pairing flow (Settings → Devices) is hidden.
- The WebRTC signaling channel (`services/dispatchRealtime.ts`) is not
  initialized.
- No WebSocket connection to the signaling server is opened.

---

## Emergency response playbook

If a store reviewer or user finds an unexpected behavior in a risky
feature, the response timeline is:

1. **Android (within 2 hours for critical issues):** Build a binary
   with the relevant flag set to `false`. Upload to Play Console →
   Production → Create new release. Android staged rollout can be set
   to 1% immediately, then 100% within 1 hour of confirming stability.

2. **iOS (within 24–48 hours):** Build a binary with the relevant flag
   set to `false`. Submit via App Store Connect → Expedited Review
   (available for safety-critical issues per App Review
   Guideline 1.4.1). Note the reason in the review notes.

3. **Dual-platform simultaneous:** Coordinate binary uploads so neither
   store goes live with the risky feature after the other has already
   killed it. The Play Console release can be paused immediately;
   iOS requires the review cycle.

4. **Communication:** Post a status update at status.agiworkforce.com
   within 1 hour of identifying the issue. Email review@agiworkforce.com
   and the affected store's developer support alias if a reviewer is
   actively in a review cycle.

---

## Remote config migration path: local flags → remote config

Cloud mode has shipped (public alpha, v1.2.0) using the client-side
`AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill switch for instant server-side
rollback. The remaining local-only flags (image gen, computer use,
billing/IAP) still follow this migration path when their remote-flip
requirement becomes load-bearing:

1. Add a Web/API-backed `remote_feature_flags` table with columns:
   `key text primary key, value bool, updated_at timestamptz`.
2. On app foreground, fetch the table and merge into MMKV with a
   `remote:` key prefix. Fall back to `v1FeatureFlags.ts` defaults
   if fetch fails.
3. The UI checks `FEATURES.<flag>` as before — the store action simply
   reads MMKV first, then falls back to the compile-time constant.
4. For safety-critical flags (image gen, computer use), always check
   MMKV + remote. Never trust a compile-time `true` alone.

This architecture means a server-side flag update kills a feature globally
in < 60 seconds without requiring a binary update or App Store review.

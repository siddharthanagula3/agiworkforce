# Feature Kill Switches — AGI Mobile v1.0.0

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

**Current state:** `false` — completely disabled in v1.

What it controls:

- The "Generate image" option in the composer action sheet is hidden.
- Any model response that returns an `image_gen` tool call is silently
  rejected (the tool call is dropped from the message renderer).
- No request to any image generation API (GPT Image, Ideogram, Stable
  Diffusion endpoint) can be initiated.

How to flip on for v1.1:

1. Set `imageGen: true` in `v1FeatureFlags.ts`.
2. Ensure provider-side content filters are wired for every image gen
   provider (OpenAI GPT Image built-in classifier is the minimum bar).
3. Add the content-policy pre-screen step required by Apple 1.1.1 and
   Google Play Inappropriate Content policy before shipping.
4. Update the App Store / Play Store listing to disclose image
   generation capability.

**Review impact:** Reviewer will see no image generation surface in v1.
Do not mention image generation in any v1 reviewer notes or store
listing copy.

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

**Current state:** `false` for public Local Mode — AGI Cloud remains invite-gated.

What it controls:

- Conversation rows are written to SQLCipher (local only).
- No cloud row is created. No realtime subscription is
  opened.
- The "Sync conversations" toggle in Settings is hidden.
- The cloud waitlist/invite button is shown instead and routes through AGI
  Web/API.

How to flip on for gated Cloud testing:

1. Set `cloudChat: true`.
2. Ensure auth flow (`FEATURES.auth = true`), Clerk-authenticated Web/API
   access control, and the Cloud provider disclosure are all wired.
3. Re-run the 5.1.2(i) compliance review before submission.

---

### Billing / subscriptions (`FEATURES.billing`)

**Current state:** `false` — completely disabled in v1.

What it controls:

- No StoreKit 2 / Google Billing Library code path is reachable.
- No subscription upgrade sheet is shown.
- The "Pro" / "Hobby" tier badges in the profile screen show "Waitlist"
  rather than a purchase CTA.

Note: the cloud_waitlist join flow (a web-link CTA) is active in v1.
This is a marketing sign-up form, not an in-app purchase. It does not
require Apple / Google billing entitlements.

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

## v1.1 migration path: local flags → remote config

When cloud mode ships in v1.1:

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

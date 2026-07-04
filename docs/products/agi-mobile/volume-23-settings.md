# AGI Mobile — Volume 23 — Settings

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/mobile/src/features/settings/index.tsx`, `apps/mobile/stores/settings/{localSettingsStore,cloudSettingsStore,settingsSyncStateStore}.ts`, `apps/mobile/services/cloudSettingsMapping.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/lib/biometricFlagStore.ts`, `apps/mobile/stores/notificationPrefsStore.ts`, `packages/types/src/models.json`.

## Overview & stance

Settings on AGI Mobile is governed by one structural rule: **Local and Cloud are separate preference scopes that never bleed into each other.** Mobile exposes exactly two trust modes — **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default once signed in). **There is no BYOK on Mobile**, and there is no affordance to enter a provider API key anywhere in Settings (`apps/mobile/lib/v1FeatureFlags.ts` → `byokKeys: false`). "Provider configuration" on this surface means on-device model management (the Models / Capabilities screens), not keys.

The store layer enforces the split. `apps/mobile/stores/settings/localSettingsStore.ts` (MMKV key `settings-store-local`) holds Local preferences and is **never synced**. `cloudSettingsStore.ts` holds the Cloud scope. The active scope is chosen by `appMode` (`useChatAppModeStore`): every shared preference screen reads/writes the Local store in Local mode and the Cloud store in Cloud mode. The settings hub renders three labeled groups — **Device**, **Local Mode**, **Cloud** — plus Support, so the boundary is visible, not implied (`apps/mobile/src/features/settings/index.tsx`). Cross-device settings sync is allowlist-gated and lands last (see Privacy). This is a target/design spec; it is not authorization to implement beyond the active Mobile lock.

## General — ✅ Built

`apps/mobile/src/features/settings/general/index.tsx`. Device-scoped defaults: **Haptic Feedback** and **Temporary Chat** toggles (`stores/settingsStore.ts`), plus navigation rows to **Models**, **Performance**, and **Storage**. The hub's General row shows the active model short name from the model picker. Model IDs must come only from `packages/types/src/models.json` — never hardcoded here. Requirement: the info banner must state these controls are device-only and that Cloud settings are managed separately. No BYOK/provider-key row may ever appear.

### Temporary Chat — 🟡 Partial (approved scope addition, 2026-07-04)

`isTemporaryChat` already exists as a global toggle (`stores/settingsStore.ts`, surfaced in General settings and via `TemporaryChatToggle` in the composer, `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx`) and already short-circuits memory learning (see Volume 14 — Memory). Gap vs. the approved reference behavior: it must also (1) exclude the conversation from **Conversation History** entirely rather than only suppressing memory writes, (2) show an explicit in-chat explainer banner ("This chat won't appear in history, use memory, or train models; may be retained briefly for safety") the first time it's toggled per session, and (3) auto-expire/purge any safety-retention copy after a bounded window (≤30 days) rather than retaining indefinitely. This is a per-conversation mode, not a Local/Cloud trust-boundary change — it applies within whichever mode (Local or Cloud) is currently active and must not be conflated with the Local/Cloud split.

### Personalization tone controls — 🔭 Planned (approved scope addition, 2026-07-04)

Beyond the existing single `personalization`/memory-learning boolean (Volume 14), add a **Personalization** settings screen with: a base style/tone selector, and granular Warmth / Enthusiasm / Headers-and-lists / Emoji dials (each a small discrete range, e.g. Less/Default/More), plus the existing custom-instructions free text. These are prompt-assembly-time preferences (feed into system-prompt construction), not memory facts — store them as their own scoped preference object (Local vs Cloud per `appMode`, same routing convention as the rest of this volume) rather than overloading the memory store. Model/tone values must never be hardcoded — read available style options from a shared config, not inlined per-screen.

## Appearance — ✅ Built

`apps/mobile/src/features/settings/appearance/index.tsx`. Three options: **System** (default), **Light**, **Dark**, all on one neutral mobile palette. The screen is scope-aware: it edits `themeMode` in the Local or Cloud store per `appMode`. Requirement: selection is single-choice with a visible checkmark, persists across launches, and survives a Local↔Cloud mode switch without leaking the other scope's value.

## Accent Color — ✅ Built

`apps/mobile/src/features/settings/accent-color/index.tsx`. Six accents (`neutral`, `green`, `blue`, `violet`, `rose`, `amber`) affecting selected controls and highlights only; `neutral` is the AGI default. Same Local/Cloud scope-routing as Appearance (`accentColor`). Requirement: swatches render the correct dark/light value via `getAccentSwatch`, and the choice never changes message content or model behavior.

## Language — 🟡 Partial

There is no standalone Language screen. A `speechLanguage` preference (e.g. `en`, `fr`) is stored per-scope in `localSettingsStore`/`cloudSettingsStore` and drives system-voice filtering inside the Voice & Language screen (`apps/mobile/src/features/settings/voice-language/index.tsx`). Gap: a first-class app-language / locale picker and full localization are 🔭 Planned — the current field only scopes which TTS voices are listed, not the app UI language. Requirement when built: language is a scoped preference, with the Cloud value travelling only via the allowlisted sync path.

## Voice — ✅ Built

`apps/mobile/src/features/settings/voice-language/index.tsx` (reached from the Voice row). Users pick an AGI **voice preset** or an installed **system voice**, preview playback, and see speed/pitch read-outs. Voice hardware fields (`selectedVoiceId`, `selectedPresetId`, `speechRate`, `speechPitch`) are device-global in `settingsStore.ts` and are explicitly **excluded from cloud sync** (`services/cloudSettingsMapping.ts` invariant 4). Requirement: preview must degrade gracefully when no installed voices are returned, falling back to the device default.

## Notifications — ✅ Built

`apps/mobile/src/features/settings/notifications/index.tsx`, backed by `stores/notificationPrefsStore.ts`. Per-category toggles (Approvals, Task Updates, Errors & Stops, Status), **Quiet Hours** with a 24h time picker, and per-priority vibration. Requirement: **critical notifications (agent failures, emergency stops, approval requests) always bypass quiet hours** — this guarantee must remain enforced and surfaced in copy. The Local hub also carries a coarse `notificationsEnabled` flag in `localSettingsStore`. Companion/dispatch-driven push categories are 🔭 Planned (the companion bridge is feature-flagged off — `v1FeatureFlags.ts` → `dispatch: false`, `companion: false`).

## Privacy — 🟡 Partial

Cloud privacy lives at `apps/mobile/src/features/settings/cloud-privacy/index.tsx`: documents no-training-without-consent, telemetry off by default (no bundled third-party analytics/crash SDK), and retention, with links to policy/terms. **Local privacy is handled by Data Controls** — local chats never leave the device unless the user runs the explicit manual sync. Settings delta-sync is allowlist-gated and lands last: `services/cloudSettingsMapping.ts` is the SSOT allowlist (only `appearance, personalization, profile, notifications, language, accessibility, chat, editor`), and `stores/settings/settingsSyncStateStore.ts` tracks an independent cursor and **never stores secrets**. Gap: the settings hub still imports `useWaitlistStore`/`InviteCodeModal` for some Cloud rows, which predates the public-alpha decision (signed-in IS the gate) and should be reconciled to the sign-in path; `remoteChatGate` already fails closed when Cloud is disabled (`services/remoteChatGate.ts`).

## Security — ✅ Built

`apps/mobile/src/features/settings/safety-security/index.tsx`. **App Lock** requires Face ID / Touch ID / passcode via `expo-local-authentication`, gated by a real device-lock enrollment check before enabling (`lib/biometricFlagStore.ts`). A **Permissions** row routes to the OS-permission registry (`src/features/settings/permissions/`). Requirement: enabling App Lock must fail safely (no silent enable) if no device lock is enrolled, and the screen must restate the device boundary — Local chats stay on-device unless Cloud is chosen. There is no key vault here because Mobile has no BYOK.

## Memory — ✅ Built (Local) / 🟡 Cloud

`apps/mobile/app/(app)/settings/memory.tsx` with `src/features/settings/components/{AddMemorySheet,MemoryItem}.tsx` over `src/features/memory/store`: list, search, pin, add, and edit memory entries on-device. **Cloud Memory** is a separate row in the Cloud group routed through the cloud-access path (not the Local store). Requirement: Local memory facts are excluded from the manual chat sync (Data Controls copies chats only) and never auto-cross to Cloud. Cloud-memory delta-sync UI is 🔭 Planned (`v1FeatureFlags.ts` → `crossDeviceSync: false`).

## Data Controls — ✅ Built

`apps/mobile/src/features/settings/data-controls/index.tsx`. **Export Local Data** (chats, memory, settings, model details) via `services/dsarExport.ts` + `localDataSnapshot.ts`; **Shared Links** and **Storage** management. The screen also hosts the **only permitted Local→Cloud crossing**: a manual, two-step-confirmed, one-time "Sync Local Chats to Cloud" (`localCloudSyncService.ts`) that copies titles and message text only — **file attachments and memory stay on device**, never automatic, never background. Requirement: the sync button is disabled (with a sign-in hint) until Cloud is available, and the confirmation copy must state exactly what crosses.

## Repository map

- `apps/mobile/src/features/settings/` — `index.tsx` (hub), `appearance/`, `accent-color/`, `general/`, `voice-language/`, `voice/`, `notifications/`, `safety-security/`, `cloud-privacy/`, `data-controls/`, `permissions/`, `components/`, `common.tsx`.
- `apps/mobile/app/(app)/settings/` — route shims + `memory.tsx`, `notifications.tsx`, `storage.tsx`, `performance.tsx`.
- `apps/mobile/stores/settings/` — `localSettingsStore.ts`, `cloudSettingsStore.ts`, `settingsSyncStateStore.ts`; plus `stores/settingsStore.ts`, `stores/notificationPrefsStore.ts`.
- `apps/mobile/services/` — `cloudSettingsMapping.ts`, `dsarExport.ts`, `remoteChatGate.ts`.
- `apps/mobile/lib/` — `v1FeatureFlags.ts`, `biometricFlagStore.ts`, `mmkv.ts`.
- Shared SSOT: `packages/types/src/models.json` (model IDs). Cloud allowlist mirrors `apps/web/app/api/settings/sync/route.ts`.

## Competitor notes

ChatGPT and Claude mobile present a single account-bound settings surface: appearance, voice, data controls, and a privacy/training toggle, all implicitly cloud-scoped. AGI deliberately diverges by making **trust scope a visible, first-class axis**: a Device group, a Local-Mode group whose values never leave the phone, and a Cloud group gated by real sign-in. Neither competitor offers an on-device LLM with its own private settings, and both centralize keys/account — AGI's mobile surface has **no BYOK and no key entry at all** (keys live only on Desktop/CLI/VS Code), while still letting power users run fully local. The manual, explicit Local→Cloud chat sync is the inverse of competitors' default cloud capture.

## Acceptance / Definition of Done

Production-ready when every shared screen routes by `appMode`, persistence survives relaunch and mode switches, the manual sync is the only Local→Cloud crossing, and no key-entry surface exists.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; settings snapshot tests green.
- [ ] Trust: Local store never appears in any sync payload; cloud sync sends only the `cloudSettingsMapping` allowlist; `remoteChatGate` fails closed with Cloud disabled.
- [ ] Security: App Lock cannot enable without an enrolled device lock; export/sync require explicit confirmation; residual waitlist/invite references reconciled to sign-in.

## Anti-patterns

- Adding any BYOK / provider-API-key field, or relabeling key entry as "Provider Configuration."
- Spreading the full settings store into the cloud payload instead of the named allowlist; syncing device-only fields (voice hardware, biometrics, haptics, model paths).
- Auto-syncing Local chats/memory/files, or syncing in the background — sync is manual and confirmed only.
- Hardcoding a model ID instead of reading `packages/types/src/models.json`.
- Faking unbuilt Cloud Memory / cross-device sync as shipped, or referencing Supabase (the stack is Clerk + Neon + Stripe).
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices beyond Basic (₹399) on any billing-linked row.

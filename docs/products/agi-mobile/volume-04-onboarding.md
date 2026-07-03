# AGI Mobile — Volume 04 — Onboarding

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified against real repo paths: `apps/mobile/app/index.tsx`, `apps/mobile/app/(public)/{_layout,age-gate,onboarding}.tsx`, `apps/mobile/src/features/onboarding/`, `apps/mobile/services/{modelDownload,complianceLedger,notifications}.ts`, `apps/mobile/src/features/auth/services/ageGate.ts`, `apps/mobile/src/features/voice/services/voiceInput.ts`, `apps/mobile/src/features/settings/personalization/index.tsx`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app.config.js`, and `packages/local-llm/src/catalog.ts`. Local on-device model selection comes from the local catalog; cloud model IDs (when surfaced later) come only from `packages/types/src/models.json`.

## Overview & stance

This volume specifies AGI Mobile's first-run onboarding. The governing principle is **local-first, account-optional**: a new user must reach a working private chat on this device without ever signing in. Mobile exposes exactly two trust modes — **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default once signed in). **Mobile has no BYOK**, so onboarding never asks for a provider API key; "Provider Configuration" on mobile means on-device model management, not keys.

Because Local and Managed Cloud are separate trust boundaries, onboarding completes entirely inside the Local boundary. Cloud is _introduced_ but never _forced_ — sign-in is deferred until the user explicitly chooses a Cloud session later (`remoteChatGate` fails closed when Cloud is disabled). The volume-specific rule is absolute: **onboarding must not trap account-less local users behind a sign-in wall** (regression history: commit `a05246651` removed exactly such a wall).

## First Launch

The root route reads the `onboarding-done` MMKV key and branches: unset → age-gate or onboarding; set → the authenticated-optional app shell `(app)`. ✅ Built (`apps/mobile/app/index.tsx`, `apps/mobile/lib/mmkv.ts`).

Requirements: cold launch is deterministic and synchronous (MMKV is unlocked before `Slot` renders); a returning user never re-sees onboarding; the first screen is the local hero with a single "Start chatting" CTA and no auth prompt (`apps/mobile/app/(public)/onboarding.tsx`, `HeroScreen`). The home that follows stays simple — no suggestion or starter cards.

## Permissions

AGI follows **just-in-time permission requests**, not an upfront permission wall. Onboarding itself requests nothing; each capability prompts at the moment of use. Manifest declarations exist for camera, microphone, speech recognition, photo library, notifications, and Face ID. ✅ Built (`apps/mobile/app.config.js` `infoPlist` + Android `permissions`).

Requirements: onboarding to working Local chat requires **zero** OS permissions. Notification permission is requested only at `registerForPushNotifications` (`apps/mobile/services/notifications.ts`). Microphone/speech permission is requested only when the user starts voice input (`apps/mobile/src/features/voice/services/voiceInput.ts`). Every usage string must be human-readable and accurate; a denied permission degrades gracefully (typed input still works) and never blocks Local chat. A dedicated in-onboarding permission primer screen is 🔭 Planned.

## Feature Introduction

The shipped introduction is a 3-screen flow: **Hero** (brand + value line) → device-tier disclosure → **Device tier** (detected device, recommended local model, optional model picker) → **Download** (radial progress, background-safe, skippable once the model is loaded). ✅ Built (`apps/mobile/app/(public)/onboarding.tsx`; model catalog via `packages/local-llm/src/catalog.ts` `getDefaultModel`/`getShippableModels`; picker `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx`).

A first-run **compliance disclosure** (EU AI Act Article 50 transparency) fires before the device-tier screen and is recorded in an MMKV ledger. ✅ Built (`FirstRunDisclosureModal.tsx`, `@agiworkforce/compliance`, `apps/mobile/services/complianceLedger.ts`). On mobile first-run the disclosure declares **no third-party cloud providers** (`offersManagedCloud: false`).

A `ModeCard` component presents Local / Cloud / Decide-later choices with Cloud rendered disabled behind a "SIGN IN" affordance. 🟡 Partial — the component exists (`apps/mobile/src/features/onboarding/components/ModeCard.tsx`) but the active onboarding route uses the hero/device-tier/download flow, so the mode-picker is not the live path. A guided multi-feature tour (projects, voice, image) is 🔭 Planned.

## Personalization

A full personalization surface exists in **Settings**, split by trust boundary into separate Local and Cloud stores (nickname, full name, occupation, etc.). ✅ Built (`apps/mobile/src/features/settings/personalization/index.tsx`; `stores/settings/{localSettingsStore,cloudSettingsStore}`). Local and Cloud personalization are deliberately distinct records — Local personalization never auto-syncs to Cloud.

Onboarding currently captures **no** personalization beyond the chosen local model and persists only `onboarding-mode='local'`. An in-onboarding personalization step (name, tone, interests) is 🔭 Planned and, when built, must write to the Local store while account-less and never gate completion.

## Notification Setup

Push registration and tap-routing exist, but there is **no onboarding notification step**. Registration is signed-in-aware: a tap that fires before auth resolves routes to `(auth)/login` rather than leaking into the authenticated shell. ✅ Built (`apps/mobile/services/notifications.ts`, `registerForPushNotifications`, `setSignedIn`).

Requirements: notification setup is offered only after a Cloud session begins (notifications carry agent/task/chat events that are Cloud-scoped). Most event categories depend on flags currently off — `dispatch`, `schedules`, `companion`, `crossDeviceSync` are `false` in `apps/mobile/lib/v1FeatureFlags.ts` — so an onboarding notification primer is 🔭 Planned and must not promise undelivered categories. Account-less Local users are never prompted for notifications.

## Voice Setup

On-device speech-to-text is implemented (iOS `SFSpeechRecognizer`, Android `SpeechRecognizer`), with audio kept on-device when `requiresOnDeviceRecognition` is supported for the locale. ✅ Built (`apps/mobile/src/features/voice/services/voiceInput.ts`; TTS/output under `apps/mobile/src/features/voice/services/`). There is **no dedicated onboarding voice step**; voice is configured just-in-time when first used, and the mic/speech permission prompt appears then.

Requirements: a future onboarding voice primer (🔭 Planned) must default to on-device recognition, label cloud transcription (Whisper/Deepgram paths behind `cloudChat`) as a distinct Cloud action, and never enable voice silently. Voice must remain fully functional in Local mode without an account.

## Completion

Completion writes `onboarding-done='true'` and `onboarding-mode='local'`, then `router.replace('/(app)')` — **with no sign-in requirement**. ✅ Built (`finishOnboarding` in `apps/mobile/app/(public)/onboarding.tsx`).

Requirements: completion is idempotent and survives relaunch; a user who skips the model download still completes (the skip is blocked only while an ExecuTorch load is mid-flight, to avoid landing model-less); the post-onboarding shell is usable account-less. Cloud and any paid plan (Free / Basic $8·₹399 / Pro $20 / Max $100 and $200 / Enterprise) are presented as later, opt-in steps — never a completion blocker.

## Repository map

- `apps/mobile/app/index.tsx` — root branch on `onboarding-done`.
- `apps/mobile/app/(public)/{_layout,age-gate,onboarding}.tsx` — public first-run routes.
- `apps/mobile/app/(auth)/login.tsx` — deferred Cloud sign-in (not part of completion).
- `apps/mobile/src/features/onboarding/` — `FirstRunDisclosureModal.tsx`, `ModeCard.tsx`, `index.ts`, `README.md`.
- `apps/mobile/src/features/auth/services/ageGate.ts` — age confirmation + minor mode.
- `apps/mobile/services/{modelDownload,complianceLedger,notifications}.ts`; `apps/mobile/storage/installedModels.ts`.
- `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx`; `apps/mobile/src/features/voice/services/voiceInput.ts`; `apps/mobile/src/features/settings/personalization/index.tsx`.
- `apps/mobile/lib/{v1FeatureFlags,mmkv}.ts`; `apps/mobile/app.config.js`.
- Shared: `packages/local-llm/src/catalog.ts`; `@agiworkforce/compliance`.

## Competitor notes

ChatGPT and Claude mobile onboarding both front-load account creation: you sign in before you can chat, and all inference is cloud. AGI deliberately diverges — **Local on-device chat works first, with no account**, and Cloud is an explicit, separately-consented trust boundary layered on top. AGI also runs an EU AI Act transparency disclosure at first run, surfaces device-tier-aware local model selection (neither competitor downloads an on-device model during onboarding), and, per AGI's per-surface trust matrix, **never** offers BYOK on mobile (unlike Desktop/CLI/VS Code). Heavy generation (image, PDF/PPTX/DOCX) is cloud-backed on mobile by design; mobile is not the first heavy local-compute surface.

## Acceptance / Definition of Done

Onboarding is production-ready when a fresh install reaches a working Local chat without any account, OS permission, or network round-trip beyond an optional model download; the EU AI Act disclosure is recorded; age-gate persists; and completion is idempotent.

- [ ] Build: cold install → Local chat with no sign-in; `onboarding-done` + `onboarding-mode='local'` persisted; relaunch skips onboarding (`apps/mobile/app/index.tsx`).
- [ ] Trust: no BYOK affordance anywhere in onboarding; Cloud is opt-in only; Local data never leaves device during first run; `remoteChatGate` stays closed until Cloud is chosen.
- [ ] Security/compliance: disclosure ledger written before device-tier; age-gate stored on-device only; just-in-time permission strings accurate; denied permissions degrade gracefully.

## Anti-patterns

- Do **not** add any BYOK / API-key entry to mobile onboarding.
- Do **not** put a sign-in wall before Local chat, or make Cloud sign-in a completion blocker.
- Do **not** auto-route Local chats/files to Managed Cloud without explicit consent and payload preview.
- Do **not** hardcode or invent model IDs; read on-device models from `packages/local-llm/src/catalog.ts` and cloud IDs from `packages/types/src/models.json`.
- Do **not** request OS permissions upfront or promise notification categories whose flags are off.
- Do **not** claim a 🔭 step (personalization, voice primer, notification primer, guided tour) is shipped, and never reference Supabase or removed tiers (Plus / pro_plus / Hobby).

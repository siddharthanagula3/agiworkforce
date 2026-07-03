# AGI Web — Volume 12 — Settings

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in real repo paths: `apps/web/app/settings/**` (`layout.tsx`, `SettingsNavClient.tsx`, per-tab pages), `apps/web/features/settings/**` (`sections/*`, `schemas/settings-validation.ts`, `components/Settings/*`, `components/LanguageSelector.tsx`), `apps/web/components/settings/AppearanceSettings.tsx`, `apps/web/app/api/settings/{preferences,sync,2fa}/route.ts`, `apps/web/app/settings/_lib/preferences-client.ts`, `apps/web/app/i18n/index.ts`, `apps/web/app/api/user/{data,export,delete-account}`, `apps/web/app/api/memory/{route,sync}.ts`, and Neon migrations `0028_user_settings.sql`, `0042_settings_cloud_sync.sql`, `0025_two_factor.sql`, `0010_memory.sql`, `0040_memory_cloud_sync.sql`, `0012_stripe.sql`, `0037_rls_user_isolation.sql`.

## Overview & stance

AGI Web is the **cloud-only** surface: **no Local mode, no BYOK** — never add either affordance here. Settings therefore configure a signed-in, Managed-Cloud account only. Every preference is user-scoped in Neon under one JSONB document (`user_settings`, one row per user, keyed by namespace — `0028_user_settings.sql`) read/written through `apps/web/app/api/settings/preferences/route.ts` and RLS-isolated (`0037_rls_user_isolation.sql`). Clerk owns identity/password/session; Neon owns preferences; Stripe owns billing. Settings that legitimately belong on other surfaces (Local model paths, BYOK provider keys, device config) must **never** appear on Web.

The locked top-level Settings IA is **General / Account / Privacy / Billing / Usage / Capabilities / Connectors / AGI Code / AGI in Chrome / Extensions / Developer**. The current nav (`apps/web/app/settings/SettingsNavClient.tsx`) groups General, Account, Personalization, Privacy, Models & Keys, Billing, Usage, Capabilities, Skills, Connectors, Memory, Notifications, Voice — converging toward that IA. The subsections below are the **controls** those tabs expose.

Cross-device settings sync is **allowlist-gated and lands last** (canon). The foundation exists (`0042_settings_cloud_sync.sql` + `apps/web/app/api/settings/sync/route.ts`): a fail-closed namespace allowlist (`appearance, personalization, profile, notifications, language, accessibility, chat, editor`) plus a recursive secret scrubber, so BYOK/secret namespaces can never cross the device boundary.

## General

✅ Built — `apps/web/features/settings/sections/GeneralSection.tsx`. Profile identity (full name, "What should AGI call you?", work description, free-form instructions ≤2000 chars) persists to the `general` preference namespace and to Clerk `unsafeMetadata`; a debounced auto-save plus explicit "Save profile" are both wired. Also hosts the Preferences block (theme, chat font, voice, display language) and a Danger Zone (account deletion with a `DELETE` confirmation + 24h grace). Requirement: General must never expose provider keys or model routing.

## Appearance

✅ Built — `apps/web/components/settings/AppearanceSettings.tsx` (theme + chat font size sm/md/lg via `settingsStore`) and the Preferences block in `GeneralSection.tsx` (chat font: Instrument Serif / System Sans / JetBrains Mono). Appearance is a cloud-safe sync namespace. Requirement: appearance changes apply instantly, survive reload, and read correctly in both light and dark contexts (per `apps/web/AGENTS.md` unusual-behavior loop).

## Theme

✅ Built — three modes **Light / Dark / System** via `useAppTheme` (`GeneralSection.tsx`) and the `theme` enum in `apps/web/features/settings/schemas/settings-validation.ts` (`'dark' | 'light' | 'auto'`). Requirement: System follows OS `prefers-color-scheme`; the selected mode is the authoritative token source for accent/surface CSS variables. 🟡 Gap: the store's enum uses `system` while the Zod schema uses `auto` — reconcile to one vocabulary.

## Accent Color

🔭 Planned — no user-facing accent picker exists. The design token `--chat-accent-primary` (default `#c8892a`) is referenced across sections (`BillingSection.tsx`, `PrivacySection.tsx`) but is theme-fixed, not user-selectable. Planned requirement: a small curated accent palette written to the `appearance` namespace (cloud-safe, syncs), never a free-form value that could break contrast. Do not claim a color picker until the control ships.

## Language

🟡 Partial — `apps/web/features/settings/components/LanguageSelector.tsx` switches i18n via `SUPPORTED_LANGUAGES` in `apps/web/app/i18n/index.ts` (today: `en`, `es`, `hi`), persisted to `localStorage` (`agiworkforce-language`) by `i18next-browser-languagedetector`. Gaps: it persists **device-locally**, not to the account, so it does not yet ride the `language` sync namespace; and `settings-validation.ts` lists a different set (`en/es/fr/de/zh/ja`). Requirement: converge the supported-language source of truth and route the choice through the preferences/sync path so it follows the account.

## Notifications

✅ Built — `apps/web/app/settings/notifications/page.tsx` persists channel groups (browser popups, email digests/product updates/security alerts, mobile push) to the `notifications` namespace (cloud-safe → syncs). Failures surface to the user rather than falling back to client-only state. Requirement: security-alert email cannot be disabled silently; push toggles must reflect real browser permission state.

## Voice

🔭 Planned — `apps/web/app/settings/voice/page.tsx` renders an honest "coming soon" state (`hasVoice = false`); no managed transcription is billed or enforced. A voice **preference** (Nova/Ember/Vale/Echo) exists in General but TTS is not wired. The page correctly states BYOK voice (e.g. an OpenAI Whisper key) is a **Desktop/CLI** capability — never offered on Web. Requirement: do not advertise minute caps or live transcription until the pipeline ships; no BYOK key field on Web.

## Privacy

✅ Built — `apps/web/features/settings/sections/PrivacySection.tsx` toggles (location metadata off-by-default, remember chats on, help-improve-models managed-cloud-only + off-by-default, crash/usage telemetry off-by-default) persist to the `privacy` namespace. Copy correctly states Local/BYOK conversations are never used for training regardless of setting. 🟡 Note: `privacy` is intentionally **not** in the sync allowlist, so these toggles are account-persisted but not cross-device synced — confirm that is the desired policy for consent-bearing flags.

## Security

✅ Built — TOTP 2FA via `apps/web/app/api/settings/2fa/{setup,verify,validate,backup-codes}/route.ts`, `features/settings/components/Settings/TwoFactor.tsx`, `services/totp-2fa.ts`, backed by `0025_two_factor.sql`; `securitySettingsSchema` covers `two_factor_enabled` + session timeout (15–1440 min) and a strong `passwordSchema`. Clerk remains the identity/session authority. Requirement: 2FA enrollment, backup-code regeneration, and active-session review must all be reachable; secrets never rendered after creation.

## Memory

✅ Built — Memory editor opens in the settings modal (`apps/web/app/settings/memory/page.tsx` → `WebSettingsModal`), backed by `apps/web/app/api/memory/route.ts` and cross-device delta-sync `apps/web/app/api/memory/sync/route.ts` (`0010_memory.sql`, `0040_memory_cloud_sync.sql`). Requirement: users can view/edit/delete individual memories and disable memory capture; only Managed-Cloud memory syncs (Web ↔ Mobile ↔ Desktop) — CLI/VS Code/Chrome never contribute automatically.

## Billing

🟡 Partial — `apps/web/features/settings/sections/BillingSection.tsx` + `apps/web/app/settings/billing/page.tsx` render plan/usage over Stripe (`0012_stripe.sql`, `0003_subscriptions.sql`), managed cloud open by default. **Spec ladder (use exactly): Free $0 · Basic $8 (₹399) · Pro $20 · Max $100 and $200 · Enterprise custom.** No credit top-ups. Gap: `apps/web/lib/pricing.ts` and `packages/types/src/billing-catalog.ts` still encode older tiers (`pro/max/team`; catalog lacks Basic) — tracked reconciliation task, flag 🟡. Never surface Plus/Hobby/`pro_plus`.

## Data Controls

✅ Built — full-account JSON export (`apps/web/app/api/user/data` + `apps/web/app/api/user/export`) and account deletion with a `DELETE`-typed confirmation and 24h grace window (`apps/web/app/api/user/delete-account`), surfaced from both `GeneralSection.tsx` and `PrivacySection.tsx`. Requirement: export includes conversations/memory/settings; deletion is auditable and irreversible after grace; audit rows stay immutable (`0043_audit_log_immutability.sql`).

## Connected Services

🟡 Partial — `apps/web/app/settings/connections/page.tsx` → Connectors section (`0008_connectors.sql`). Requirement: use official product icons; Gmail, Google Calendar, Drive, and Sheets are **separate** connectors (per `apps/web/AGENTS.md`); connect/revoke shows real OAuth state and scopes; revocation deletes stored tokens. Managed-cloud only — no BYOK provider keys here.

## Repository map

- `apps/web/app/settings/**` — routed tabs, `layout.tsx`, `SettingsNavClient.tsx`, `_lib/preferences-client.ts`.
- `apps/web/features/settings/**` — `sections/*`, `schemas/settings-validation.ts`, `components/Settings/*`, `components/{WebSettingsModal,LanguageSelector,AdvancedModeToggle}.tsx`, `services/{user-preferences,totp-2fa}.ts`.
- `apps/web/components/settings/AppearanceSettings.tsx`.
- `apps/web/app/api/settings/{preferences,sync,2fa,api-keys,audit-logs}/route.ts`; `apps/web/app/api/user/{data,export,delete-account}`; `apps/web/app/api/memory/{route,sync}.ts`.
- `apps/web/app/i18n/index.ts`; `apps/web/lib/pricing.ts`; `packages/types/src/billing-catalog.ts`.
- Neon: `0028`, `0042`, `0038` (sync), `0025`, `0010`, `0040`, `0012`, `0003`, `0008`, `0037`, `0043`.

## Competitor notes

Claude, ChatGPT, and Codex expose a single-provider account with theme, language, memory, connectors, data export, and billing. AGI diverges deliberately: **per-surface trust boundaries** (Web is strictly Managed-Cloud; BYOK/Local live only on Desktop/CLI/VS Code and Web never renders their controls), a **fail-closed settings-sync allowlist** so preferences propagate but secrets structurally cannot, and honest built-vs-planned surfaces (voice, accent color) instead of dead toggles. Multi-provider model choice is a Capabilities concern, not a key-entry field on Web.

## Acceptance / Definition of Done

- [ ] Build: every settings tab renders, persists to Neon via `/api/settings/preferences`, and survives reload; light/dark both readable; no dead controls; no signed-out API spam.
- [ ] Trust: no BYOK key field or Local model path anywhere on Web; `/api/settings/sync` emits/stores only allowlisted namespaces (secret-scrubber test green); memory/settings sync only for Managed-Cloud rows.
- [ ] Security: 2FA enroll + backup codes + session controls work; deletion honors the 24h grace and writes an immutable audit row; export returns the full user dataset.
- [ ] Billing copy matches the Free/Basic/Pro/Max×2/Enterprise ladder; the `pricing.ts`/`billing-catalog.ts` tier gap is tracked as 🟡, not silently shipped.

## Anti-patterns

- Adding any BYOK key entry, Local-model, or device/provider-secret control to Web (trust-boundary violation).
- Widening the sync allowlist to a secret-bearing namespace, or syncing via a denylist.
- Reintroducing removed tiers (Plus, Hobby, `pro_plus`), inventing Pro/Max INR prices, or adding credit top-ups.
- Claiming voice transcription or an accent picker as shipped without a real path; leaving dead toggles.
- Hardcoding or inventing model IDs in settings (catalog IDs come only from `packages/types/src/models.json`).
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or persisting preferences to client-only state without surfacing failures.

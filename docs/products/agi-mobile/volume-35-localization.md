# AGI Mobile — Volume 35 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified repo paths: `apps/mobile/services/translateService.ts`, `apps/mobile/services/languageQA.ts`, `apps/mobile/src/features/voice/services/voiceInput.ts`, `apps/mobile/src/features/notifications/time.ts`, `apps/mobile/src/features/auth/services/ageGate.ts`, `apps/mobile/package.json` (`expo-localization`), and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile adapts to a user's language, script, region, and calendar — for **UI chrome**, **user content**, and **model behavior**. Mobile exposes exactly two trust modes: **Local** (a small on-device LLM, free) and **Managed Cloud** (public-alpha, real Clerk auth gate). **Mobile has no BYOK** — there is no API-key surface, so "language model configuration" here always means on-device model and translation-pair management, never provider keys.

The trust boundary shapes localization in three ways. First, **on-device translation must stay on-device**: Local content is translated without any network call, so language is a privacy feature, not a cloud round-trip. Second, **locale signals never silently cross into Cloud**: device locale/timezone may inform a Cloud request only after the Cloud session is authorized; `remoteChatGate` fails closed when Cloud is disabled. Third, INR/regional pricing display is a **Cloud-billing concern** — Local + BYOK are free access modes, so price strings only appear in Cloud/billing surfaces and are server-rendered, not hardcoded on device.

## Languages — multi-language

The app **content** layer already supports many languages. On-device translation covers `en, hi, es, fr, de, ja, ko, zh, ar, pt` with native labels, routed Apple Translate (iOS 17.4+) → ML Kit (Android) → Qwen on-device LLM fallback. **✅ Built** — `apps/mobile/services/translateService.ts` (`SUPPORTED_LANGUAGES`, launch pair `en↔hi`). A debug-only multi-language QA harness (Hindi launch suite; Marathi/Bengali/Tamil planned) scores model output via on-device BLEU/chrF. **✅ Built** — `apps/mobile/services/languageQA.ts`. Speech input is locale-aware via `expo-localization`. **✅ Built** — `apps/mobile/src/features/voice/services/voiceInput.ts` (`Localization.getLocales()`); dependency in `apps/mobile/package.json`.

The **UI string** layer is not yet localized: there is no message-catalog/i18n runtime, and visible strings are authored in US English. A string-extraction catalog, locale negotiation against `getLocales()`, pseudo-localization in dev, and missing-key surfacing are **🔭 Planned**. Requirement: ship a single string catalog keyed by stable IDs, default `en`, fall back per-key to `en`, and never render a raw key. Local-only operation must never block language selection — translation and on-device model output stay fully offline.

## RTL — right-to-left

Arabic is a supported **translation target** (`ar` in `SUPPORTED_LANGUAGES`), so RTL **content** can be produced and displayed today. **🟡 Partial** — `apps/mobile/services/translateService.ts` translates to/from Arabic, but the app **layout** does not flip: no `I18nManager` RTL wiring exists in `apps/mobile`, and `app.config.js` declares no `forcesRTL`/`supportsRTL`. Full RTL **layout mirroring** (navigation, icon direction, chat bubble alignment, swipe gestures, composer affordances) is **🔭 Planned**. Requirements: use logical start/end layout primitives rather than left/right; mirror only chrome, never the message body (translated RTL text must render correctly inside an otherwise LTR shell when the UI language is LTR); keep mixed-direction (bidi) content readable with Unicode isolates; never hard-code physical-edge padding for directional UI.

## Dates & Time — locale

Several surfaces already render locale-aware times via `Intl.DateTimeFormat(undefined, …)`. **✅ Built** — `apps/mobile/src/features/notifications/time.ts`; timezone detection (`Intl.DateTimeFormat().resolvedOptions().timeZone`) drives schedules and the age-gate country heuristic in `apps/mobile/src/features/schedules/components/ScheduleForm.tsx` and `apps/mobile/src/features/auth/services/ageGate.ts`. However, many date renders are **hard-pinned to `'en-US'`** (e.g. account, usage, dispatch, file timestamps). **🟡 Partial** — `apps/mobile/app/(app)/account.tsx`, `apps/mobile/app/(app)/usage.tsx`, `apps/mobile/services/fileCreation.ts`. Requirement: route all user-facing date/time through one helper that resolves the device locale (or app-language override) instead of `'en-US'`; respect 12/24-hour and first-day-of-week from the system; store timestamps as UTC ISO and format only at the view layer; show timezone explicitly for scheduled/remote-control actions so a host-run session's times are unambiguous.

## Numbers & Currency — regional (incl. INR ₹)

Number formatting is partially locale-aware: counts use `toLocaleString()` with no fixed locale in some places and a hardcoded `'en-US'` in others (e.g. usage/account counts). **🟡 Partial** — `apps/mobile/src/features/integrations/services/healthData.ts`, plus assorted count/date renders such as `apps/mobile/app/(app)/usage.tsx`. Requirement: format all numbers through a locale-resolving helper; Indian users must see the Indian digit-grouping convention (lakh/crore) where the locale calls for it.

**Currency** is a Cloud-only concern. Per the canon ladder — Free $0; **Basic $8 / ₹399**; Pro $20; Max $100 **and** $200; Enterprise custom — only **Basic** has a fixed INR figure (**₹399**); **Pro/Max INR are TBD and must not be invented**. No mobile code currently formats `₹`/INR or any price string (grep finds none under `apps/mobile`), and there is **no in-app checkout** — billing opens a server-issued Stripe portal URL. **🟡 Partial** — `apps/mobile/src/features/billing/service.ts` (portal-session fetch). In-app price display localized by region is **🔭 Planned** and, when built, must render prices from server/Stripe responses, never from device-side constants. There are **no credit top-ups**.

## Unicode

Mobile already handles complex scripts end-to-end: Devanagari and CJK native labels render in the model picker/translation UI, and chrF scoring is tuned for morphologically rich scripts. **✅ Built** — `apps/mobile/services/translateService.ts` (`nativeLabel`), `apps/mobile/services/languageQA.ts` (`computeChrF`). Requirements: treat all stored and synced text as UTF-8/NFC-normalized; never index strings by byte for truncation (use grapheme-aware clipping so emoji and combining marks are not split); keep encryption-at-rest (SQLCipher/MMKV) byte-transparent so Unicode survives a round-trip; ensure delta-sync to Neon preserves normalization across Web↔Mobile↔Desktop; render emoji and ZWJ sequences without tofu in chat, names, and file titles.

## Repository map

- `apps/mobile/services/translateService.ts` — on-device translation, supported languages, native module bridge.
- `apps/mobile/services/languageQA.ts` — debug-only multi-language QA + BLEU/chrF.
- `apps/mobile/src/features/voice/services/voiceInput.ts` — `expo-localization` locale detection for speech.
- `apps/mobile/src/features/notifications/time.ts` — locale-aware `Intl.DateTimeFormat`.
- `apps/mobile/src/features/schedules/components/` — timezone-aware schedule rendering.
- `apps/mobile/src/features/auth/services/ageGate.ts` — timezone-derived country heuristic.
- `apps/mobile/src/features/billing/service.ts` — Stripe portal session (currency/pricing is server-rendered).
- `apps/mobile/app/(app)/{account,usage,dispatch}.tsx`, `apps/mobile/services/fileCreation.ts` — date renders to migrate off `'en-US'`.
- `apps/mobile/package.json` — `expo-localization` dependency.
- `apps/mobile/app.config.js` — where RTL/locale build flags would land (none today).

## Competitor notes

ChatGPT and Claude mobile localize UI chrome into many languages and rely on cloud round-trips for translation. AGI's deliberate divergence: **translation runs on-device** (Apple Translate / ML Kit / on-device Qwen fallback), so Local-mode language work is private and offline — a trust feature competitors cannot match in a cloud-only design. AGI is also **multi-provider with per-surface trust**: on mobile there is **no BYOK affordance**, and Cloud localization never sees Local content. Pricing localization (INR ₹399 Basic) follows the AGI ladder, not a competitor's regional menu.

## Acceptance / Definition of Done

A locale is "done" only when UI chrome, content, dates, numbers, and currency all resolve from one negotiated locale with English per-key fallback, Local translation stays offline, and no price/INR string is hardcoded.

- [ ] Build: one date/number/currency helper resolves device locale (no stray `'en-US'`); pseudo-locale dev build shows no untranslated keys; `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass.
- [ ] Trust: Local translation makes zero network calls; locale/timezone reaches Cloud only after auth; `remoteChatGate` fails closed when Cloud is off.
- [ ] Security: stored/synced text is UTF-8/NFC; grapheme-safe truncation; SQLCipher/MMKV round-trips Unicode losslessly; price strings come only from server/Stripe responses.

## Anti-patterns

- Adding **any BYOK / API-key field** to a "language model" or "provider" settings screen — mobile has none, ever.
- Auto-sending **Local** content to a cloud translator or to Managed Cloud without explicit consent.
- Faking RTL by claiming layout mirroring that `I18nManager`/`app.config.js` does not implement.
- Hard-pinning `'en-US'` for dates/numbers, or splitting Unicode by byte.
- **Inventing INR prices** for Pro/Max, hardcoding `₹` in device constants, or adding in-app checkout.
- Hardcoding model IDs (read from `packages/contracts/types/src/models.json`) or referencing Supabase (removed — stack is Clerk + Neon + Stripe).
- Re-introducing removed tiers ("Plus", `pro_plus`, "Hobby") in any localized price table.

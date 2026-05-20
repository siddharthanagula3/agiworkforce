# AGI Mobile — App Store + Play Store submission package

Locked submission package for **AGI v1.0.0** (iOS + Android). Every
artifact here is the canonical version that goes into App Store
Connect / Play Console; do not paraphrase, do not regenerate. Update
files in-place when copy changes.

> **Brand.** Public surface is **AGI**. Repo path and bundle
> identifiers stay `agiworkforce`. See
> `memory/brand-name-agi-2026-05-15.md`. The app's display name
> (`apps/mobile/app.config.js` line 5 `name: 'AGI Workforce'`) is
> still "AGI Workforce" pending a separate brand-rename PR; the
> store-listing copy below uses the public "AGI" brand exclusively.

---

## Files in this package

```
apps/mobile/store-listing/
├── README.md                          ← you are here
├── ios/
│   ├── metadata.md                    ← app name, subtitle, keywords, description, promotional text
│   ├── review-notes.md                ← Apple App Review notes (5.1.2(i), 2.5.2, 5.1.1, demo flows)
│   └── PrivacyInfo.xcprivacy          ← mirror of apps/mobile/ios/AGI/PrivacyInfo.xcprivacy
├── android/
│   ├── metadata.md                    ← Play Store listing (name, descriptions, content rating)
│   └── data-safety.md                 ← Play Console Data Safety form, locked answers
├── shared/
│   └── differentiators.md             ← PRD V5 §1 three differentiators (source for both stores)
└── screenshots/
    └── specs/README.md                ← screenshot order + tagline overlay + per-device matrix
```

Supporting files outside this directory:

```
apps/mobile/ios/AGI/PrivacyInfo.xcprivacy         ← canonical Apple Privacy Manifest (locked)
apps/mobile/scripts/screenshots/                  ← Detox capture pipeline + per-screenshot specs
ios/agiworkforce/PrivacyInfo.xcprivacy            ← Xcode-consumed copy (kept in sync via Expo plugin)
apps/mobile/app.config.js                         ← Expo dynamic config (re-generates the Xcode copy)
```

---

## Three differentiators (anchor for all listing copy)

Pinned from PRD V5 §1 and the BYOK-first pivot
(`memory/byok-first-pivot-2026-05-16.md`):

1. **Multi-provider in one UI** — 10+ providers, switch mid-conversation.
2. **BYOK + Local LLM** — bring your own API keys (Keychain / Keystore),
   or run Ollama / LM Studio locally.
3. **Cross-provider session continuity** — Claude → GPT → Llama in one
   thread; tool calls and reasoning state migrate automatically.

The iOS description, Android description, screenshot taglines, and the
App Review walkthrough all lead with these three. Do not change the
order, do not add a fourth in the listing copy without lock-update.

---

## Critical compliance walkthroughs (load-bearing)

| Topic                                                                | Where                                                  | Source of truth                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Apple 5.1.2(i) — explicit consent before third-party AI data sharing | `ios/review-notes.md` §1                               | Apple Nov 13 2025 update + PRD §B.7 modal copy                    |
| Apple 2.5.2 — self-contained app, no in-app code execution           | `ios/review-notes.md` §2                               | PRD V5 lock #25 + Replit / Vibecode / Anything enforcement record |
| Local mode model download UX                                         | `ios/review-notes.md` §4                               | M0-M3 tier spec + DiskSpace privacy manifest reasons              |
| BYOK key add flow                                                    | `ios/review-notes.md` §5 + `android/data-safety.md` §3 | Keychain (iOS) / Android Keystore + per-provider granular consent |

---

## Asset checklist (what's locked vs. what needs founder input)

### Locked in this package

- [x] iOS app name (30 chars): "AGI: Claude, GPT, Gemini chat"
- [x] iOS subtitle (30 chars): "One app. Every model. BYO keys."
- [x] iOS promotional text (170 chars)
- [x] iOS keywords (95/100 chars)
- [x] iOS description (3,386/4,000 chars)
- [x] iOS "What's new" v1.0.0 copy (462 chars)
- [x] iOS age rating questionnaire answers
- [x] iOS App Review notes (3,952/4,000 chars, all four walkthroughs)
- [x] iOS PrivacyInfo.xcprivacy (4 API categories, 6 reason codes total, all TN3183-verified)
- [x] Android short description (75/80 chars)
- [x] Android full description (3,148/4,000 chars)
- [x] Android Data Safety form, every row answered
- [x] Android content rating answers
- [x] Screenshot order, tagline copy, per-device matrix

### Needs founder input before submission

- [ ] **Real screenshot captures** (30 iOS + 18 Android = 48 PNGs). Specs are
      locked in `screenshots/specs/`; capture pipeline is wired in
      `apps/mobile/scripts/screenshots/`; the founder must: 1. Drop free-tier API keys into `apps/mobile/.env.screenshots` 2. Run `pnpm screenshots:ios && pnpm screenshots:android` 3. Review captures and re-run any that miss the spec
- [ ] **App icon at 1024×1024** for App Store Connect (separate from
      the in-bundle adaptive icon). Owner: design.
- [ ] **Android feature graphic** (1024×500 PNG, no alpha, ≤ 1MB).
      Owner: design.
- [ ] **Phone number** in App Store Connect Contact Information.
- [ ] **App Store Connect demo account** (if the reviewer prefers a
      key bundle to BYOK self-serve). Optional; supplying via email
      is the documented fallback in `ios/review-notes.md` §5.
- [ ] **macOS notarization PLA acceptance** at
      https://developer.apple.com/account — required for desktop, not
      mobile, but is a session-wide blocker per
      `MEMORY.md > Known operational blockers`.
- [ ] **Localization** — v1 ships en-US only; v1.1 adds the 7 locked
      locales (es, fr, de, ja, zh-Hans, zh-Hant, ko).

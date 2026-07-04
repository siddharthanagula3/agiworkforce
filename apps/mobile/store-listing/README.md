# AGI Mobile — Store Listing Package

Status: Active submission package (v1.2.0)
Last updated: 2026-07-04

This package tracks Mobile store copy and review notes for the v1.2.0
submission. **Canonical, current files** are listed below — the
`ios/metadata.md`, `ios/review-notes.md`, `android/metadata.md`, and
`android/data-safety.md` files each carry a SUPERSEDED notice: they
describe the pre-public-alpha Cloud invite/waitlist gate, which was
removed by founder decision on 2026-06-27/28. Do not paste from those
files.

## Canonical files for submission

```
apps/mobile/store-listing/
├── LISTING-METADATA-IOS.json       — canonical iOS App Store Connect copy
├── LISTING-METADATA-ANDROID.json   — canonical Play Console copy
├── REVIEWER-NOTES-IOS.md           — paste-in for App Review notes
├── REVIEWER-NOTES-ANDROID.md       — paste-in for Play Console reviewer instructions
├── FOUNDER-SUBMISSION-CHECKLIST.md — field-by-field submission walkthrough
├── APP-STORE-READINESS-CHECKLIST.md
├── KILL-SWITCH.md                  — feature-flag kill-switch reference
├── REVIEW-DEFENSE-PACK.md          — rejection-response playbook
├── ios/PrivacyInfo.xcprivacy       — canonical Apple privacy manifest
├── android/                        — SUPERSEDED drafts, historical only
├── ios/metadata.md, ios/review-notes.md — SUPERSEDED drafts, historical only
├── shared/differentiators.md
└── screenshots/
```

## Current Positioning (v1.2.0)

1. **Local Mode first**: demo-ready local chat, local models, projects, recents, memory controls, voice, and tool-use UI. No account required.
2. **AGI Cloud public alpha**: any signed-in user (free, self-service, no invite code or waitlist) reaches Cloud chat, image generation, and web search on a free tier. An in-app "Upgrade plan" row opens a web checkout (agiworkforce.com/pricing) in-browser — there is no StoreKit/Play Billing purchase in this build.
3. **Cross-surface direction**: Mobile should feel consistent with Web and Desktop.

## Submission Rules

- Do not claim direct provider-key entry (BYOK) on Mobile — not a v1 product path.
- Do not claim native in-app purchases are live — `FEATURES.iap` is off pending real StoreKit/Play product IDs and server-side receipt verification.
- Do not reintroduce invite/waitlist language — Cloud is public alpha and open by default.
- Recount all app-store character limits inside the store consoles before submission.
- Real screenshots must come from the submitted binary, not mockups.

## Founder Inputs Still Required

- Real iOS and Android screenshot captures (see `pnpm screenshots:ios` / `pnpm screenshots:android`).
- App icon and Android feature graphic.
- Store contact phone number.
- Final privacy policy URL confirmation.
- Legal sign-off on the Guideline 3.1.1 / external-offers-policy question (`FOUNDER-SUBMISSION-CHECKLIST.md` Part D item 11).

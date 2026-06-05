# AGI Mobile — Store Listing Package

Status: Current draft, not submission-locked
Last updated: 2026-06-05

This package tracks Mobile store copy and review notes. It is no longer a locked submission package. Copy must match the current Mobile implementation: Local Mode first, Cloud Managed invite/waitlist gates, no direct provider-key entry on Mobile.

## Files

```
apps/mobile/store-listing/
├── README.md
├── ios/
│   ├── metadata.md
│   ├── review-notes.md
│   └── PrivacyInfo.xcprivacy
├── android/
│   ├── metadata.md
│   └── data-safety.md
├── shared/
│   └── differentiators.md
└── screenshots/
    └── specs/README.md
```

## Current Positioning

1. **Local Mode first**: demo-ready local chat, local models, projects, recents, memory controls, voice, and tool-use UI.
2. **Cloud Managed invite path**: AGI Agent, connectors, plugins, skills, account, subscription, and cloud chat are visible but invite-gated.
3. **Cross-surface direction**: Mobile should feel consistent with Web and Desktop, but unavailable cloud capacity must be visibly gated.

## Submission Rules

- Do not claim direct provider-key entry on Mobile.
- Do not claim paid subscriptions are live until billing, ledgering, refunds, chargebacks, abuse controls, and deletion controls are proven.
- Do not claim Cloud Managed is public until invite gating is removed by a product decision.
- Recount all app-store character limits inside the store consoles before submission.
- Real screenshots must come from the submitted binary, not mockups.

## Founder Inputs Still Required

- Real iOS and Android screenshot captures.
- App icon and Android feature graphic.
- Store contact phone number.
- Final privacy policy URL confirmation.

# AGI iOS App Store Readiness Checklist

Status: Current
Owner: Platform lead
Last updated: 2026-06-11

This checklist turns the current Apple Developer Program License Agreement review into AGI iOS release gates. It is product and submission guidance, not legal advice.

Primary source reviewed:

- `/Users/siddhartha/Downloads/Apple_Developer_Program_License_Agreement_3438NDB36M.txt`
- Apple Foundation Models documentation: https://developer.apple.com/documentation/FoundationModels
- Apple Foundation Models acceptable-use requirements: https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework
- Apple Intelligence "What's new": https://developer.apple.com/apple-intelligence/whats-new/
- Apple third-generation Foundation Models research: https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models

## Release Gates

| Area                        | AGI decision                                                                                                             | Required before public App Store release                                                                                                               | Source                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Local Mode boundary         | Local Mode remains private and device-scoped. Cloud handoff must be explicit.                                            | Keep Local chats, files, memory, and profile separate from AGI Cloud unless the user explicitly chooses Cloud.                                         | Agreement lines 1375-1408                              |
| Apple on-device models      | Treat Apple Foundation Models as a future supported Local Mode provider on eligible devices, not as current AGI runtime. | Do not use Apple model output to train, fine-tune, or improve any other model. Apply Apple Foundation Models acceptable-use restrictions when exposed. | Agreement lines 341-347 and 1240-1246; Apple docs      |
| Local model downloads       | Background Assets may be considered for model or companion asset downloads.                                              | Use Background Assets only for app assets. Do not use it for user/device identification, advertising, or measurement.                                  | Agreement lines 225-227 and 1678-1684                  |
| Mobile skills and plugins   | Mobile skills/plugins must be declarative, built-in, server-side, or App Store-reviewed.                                 | Do not ship a mobile plugin marketplace that downloads runnable executable code.                                                                       | Agreement lines 1263-1279                              |
| Voice and recording         | Voice, camera, screen, and photo flows need visible recording indicators and clear permission copy.                      | Show a conspicuous in-app indicator while recording or capturing. Do not facilitate recording others without awareness.                                | Agreement lines 1354-1367                              |
| Privacy disclosures         | App Store metadata and in-app surfaces must clearly explain data collection, use, retention, sharing, and deletion.      | Keep privacy policy, app description, and in-app settings consistent with Local, BYOK, and AGI Cloud boundaries.                                       | Agreement lines 1397-1408                              |
| Local and Cloud settings    | Local settings and AGI Cloud settings are separate.                                                                      | Do not reuse Local memory, projects, personalization, profile, or settings in Cloud surfaces. Cloud settings must be account-scoped and gated.         | Product decision 2026-06-11; Agreement lines 1375-1408 |
| Explicit sync/import        | Local-to-Cloud transfer is opt-in only.                                                                                  | Any sync/import/continue-in-Cloud option must show categories, destination account, provider/cloud scope, retention impact, and consent before upload. | Product decision 2026-06-11; Agreement lines 1375-1408 |
| Cloud sync production       | Cloud sync covers Web, Mobile, and Desktop only after account and entitlement checks.                                    | Prove server-side ownership, deletion/export, conflict handling, retry/idempotency, audit logs, and no Local fallback writes before enabling sync.     | Product decision 2026-06-11                            |
| Permissions                 | Requested permissions must match visible product functions.                                                              | Do not request HealthKit, location, camera, microphone, contacts, photos, or notification access until the user uses that feature.                     | Agreement lines 1375-1395, 1578-1603, and 1634-1641    |
| Age and parental controls   | Current local age gate is demo-safe. Apple-native age signals are a future production path where available.              | Use accurate age rating metadata. Add native Declared Age Range or Family Controls only when the feature requires it and the user consents.            | Agreement lines 276-278, 326-327, and 6105-6116        |
| AGI Cloud subscriptions     | Cloud remains invite-gated until billing, metering, refunds, fraud, and App Store payment handling are production-ready. | If AGI Cloud is sold in-app, use the required Apple commercial agreement and StoreKit/In-App Purchase flow for digital services.                       | Agreement lines 34-38 and 6160-6161                    |
| Export compliance           | AGI uses encryption and local model files.                                                                               | Confirm export compliance answers and keep records for cryptography and model-distribution choices before submission.                                  | Agreement lines 6083-6103                              |
| EULA and support            | AGI must have clear support, privacy, and EULA coverage.                                                                 | Ensure App Store Connect metadata, support contact, privacy policy, and EULA contain the required developer responsibility and contact information.    | Agreement lines 6070-6078 and 6415-6475                |
| App Store featuring quality | Visual QA is a release gate, not polish.                                                                                 | Keep UI, UX, accessibility, screenshots, previews, and descriptions production-grade before submission.                                                | Agreement lines 6721-6734                              |

## Apple Foundation Models Product Notes

- Current AGI mobile builds must not imply Apple Foundation Models are live. The iOS bridge currently reports the Apple runtime as unavailable and Local Mode falls through to AGI's other local runtimes.
- Add an `Apple On-Device` model option only after the framework is implemented through documented Apple APIs and capability-gated by supported OS/device.
- Label it as an Apple on-device provider, not as AGI-owned model weights.
- Keep Apple output out of model-training, fine-tuning, evaluation datasets intended to improve other models, and routing benchmarks that produce training data.
- Apply Apple acceptable-use restrictions in addition to AGI safety rules for that provider.
- Apple announced expanded Foundation Models capabilities for newer OS releases, including multimodal prompts, Private Cloud Compute access, provider integrations through the Language Model protocol, Dynamic Profiles, evaluations, an `fm` command-line tool, a Python SDK, and Core AI. Treat these as roadmap inputs until AGI implements and manually verifies each path.
- Apple describes AFM 3 as including a 3B dense on-device model, a 20B sparsely activated on-device model for capable Apple silicon systems, and Private Cloud Compute server models. Do not market these as AGI capabilities until exposed through AGI with capability checks and App Store review constraints.

## Background Asset Product Notes

- Good fit: local model files, tokenizers, model metadata, and companion assets that are app assets.
- Bad fit: telemetry collection, device identification, advertising measurement, or hidden Cloud sync.
- The user still needs clear storage controls: model size before download, progress, cancellation, deletion, and export/delete controls in Settings.

## Mobile Skills And Plugins Product Notes

- Safe pattern: built-in skills shipped in the binary, server-side AGI Cloud skills, declarative manifests, or App Store-reviewed extensions.
- Unsafe pattern: downloading executable plugins, scripts, native modules, or code-like packages that change the app's primary behavior after review.
- Mobile can show Skills, Connectors, and Plugins as Cloud-managed catalog surfaces, but local mobile execution must stay within reviewed binary capabilities.

## Submission Review Checks

Before public submission, verify:

1. Fresh install can complete Local Mode without account, Cloud key, or paid access.
2. Cloud invite gates do not imply public paid access before StoreKit is ready.
3. Voice, camera, files, contacts, notifications, location, HealthKit, and photos each request permission only from a user action tied to that feature.
4. Local memory, projects, chats, and profile do not appear in AGI Cloud mode unless an explicit sync/import path exists and is consented.
5. Local settings and Cloud settings are separate screens or clearly separated sections with separate storage and account rules.
6. Any "Sync to Cloud" or "Continue in Cloud" option shows a disclosure and does not run by default.
7. Cloud chats, projects, memory, artifacts, subscriptions, connectors, plugins, skills, and account settings are gated until sign-in and entitlement are proven.
8. App Review notes match the current binary exactly.
9. App privacy labels match actual SDKs, network calls, storage, and permissions.
10. EULA, privacy policy, support contact, and export-compliance answers are ready in App Store Connect.
11. Screenshots and previews show real Local Mode behavior without stale provider names or competitor wording.

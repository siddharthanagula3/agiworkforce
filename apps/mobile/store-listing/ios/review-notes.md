# App Review Notes — AGI iOS Draft

Status: Current draft, not submission-locked
Last updated: 2026-06-05

Paste only after rechecking the submitted binary. Current Mobile posture: Local Mode first, Cloud Managed invite/waitlist gated, no direct provider-key entry on Mobile.

## Notes For The App Review Team

Hello, thank you for reviewing AGI.

AGI Mobile is an AI workspace with a local demo path and invite-gated Cloud Managed features. Local Mode is available without an account. Cloud features such as AGI Agent, connectors, plugins, skills, subscription, restore purchases, account settings, and cross-device cloud chat require invite/waitlist access before they can be used.

## Privacy And Third-Party AI Disclosure

In the default Local Mode path, chat content stays on the device or local model runtime. The app does not send Local chats to AGI Cloud or third-party AI providers silently.

Before any Cloud Managed path can send user content outside the device, the app must show the cloud destination, scope, provider label, and consent copy. Cloud rows in the current UI open an invite/waitlist modal while access is gated.

## Self-Contained App

AGI Mobile is a chat and workflow client. It does not execute generated code on the device, download executable code, or allow runtime-defined tools. Local model files are data assets used by native inference runtimes already included in the submitted binary.

## Local Model Downloads

Local model downloads, where available, are user-initiated. The app shows model name, size, readiness state, and download status. Model files can be deleted from device storage.

## Reproducible Demo Flow

1. Launch the app fresh.
2. Complete onboarding into Local Mode.
3. Start a new chat.
4. Open the drawer to view Projects, Artifacts, AGI Agent, Recents, Settings, profile, search, and new chat.
5. Tap AGI Agent or a Cloud row in Settings to confirm the invite/waitlist modal opens.
6. Open the model picker to confirm local models are selectable and Cloud Managed rows are locked.

## Claims Not Made

This build does not claim public Cloud Managed availability, live paid subscriptions, direct provider-key entry on Mobile, or measured cost savings.

Contact: review@agiworkforce.com

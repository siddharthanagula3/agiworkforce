# AGI Mobile — Store Review Defense Pack

Status: Current draft, not submission-locked
Last updated: 2026-06-05

Use this only after rechecking the submitted binary. The current Mobile posture is Local Mode first, Cloud Managed invite/waitlist gated, with no direct provider-key entry on Mobile.

## 1. Apple Guideline 5.1.2(i) — Third-Party AI Disclosure

AGI Mobile default Local Mode does not send chat content to AGI Cloud or third-party AI providers. The first-run disclosure still tells users they are interacting with an AI system before they can send a message.

Cloud Managed features such as AGI Agent, connectors, plugins, skills, account, subscription, and cloud chat are invite-gated. Before any cloud path sends user content outside the device, the app must show the destination, scope, provider label, and consent copy.

Evidence:

- `apps/mobile/lib/v1FeatureFlags.ts`
- `apps/mobile/services/remoteChatGate.ts`
- `packages/compliance/src/article50-disclosure.ts`

## 2. Apple Guideline 2.5.2 — Self-Contained App

AGI Mobile is a chat and workflow client. It must not download executable code, evaluate model output as code, or add runtime-defined tools. Model files are data assets used by native inference runtimes already shipped in the binary.

Evidence:

- `apps/mobile/app.config.js`
- `apps/mobile/native/`
- `apps/mobile/src/features/model-picker/`

## 3. EU AI Act Article 50 Disclosure

The first-run disclosure informs users that they are interacting with an AI system before the first AI request. Exported or shared AI-generated content must remain labeled when applicable.

Evidence:

- `packages/compliance/src/article50-disclosure.ts`
- `packages/compliance/src/article50-text.ts`

## 4. Permissions

No permission should be requested at launch. Camera, microphone, photo library, Face ID, contacts, and calendar access must only be requested after a user-visible action and must be explained in the platform permission string.

## 5. Demo Flows

| Demo         | What to do                                       | Expected result                                                    |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| Local chat   | Launch fresh, complete onboarding, send a prompt | Chat runs in the local demo path                                   |
| Cloud invite | Open AGI Agent or a Cloud row in Settings        | Invite/waitlist modal opens                                        |
| Model picker | Open model picker                                | Local models selectable, Cloud Managed rows locked                 |
| Tool UI      | Trigger a tool-capable response                  | Status row, command preview, and expandable details remain visible |
| Settings     | Open Settings                                    | Local rows are active, Cloud rows are invite-gated                 |

## 6. Claims To Avoid

- Public cloud availability.
- Live paid subscriptions.
- Direct provider-key entry on Mobile.
- Production readiness beyond verified release controls.
- Measured cost savings or performance gains not backed by tests.

## 7. Contact

- App Review questions: review@agiworkforce.com
- Security disclosures: security@agiworkforce.com
- Support: support@agiworkforce.com

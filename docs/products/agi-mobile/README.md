# AGI Mobile — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

AGI Mobile is the Expo/React Native surface of the AGI workforce suite. Its trust exposure is limited to two boundaries: Local (an on-device LLM) and Managed Cloud — there is deliberately NO BYOK path on mobile. The volumes below are target/design specifications, not as-built documentation; they are governed by [../README.md](../README.md) (the product canon) and [docs/current/source-of-truth.md](../../current/source-of-truth.md). Where a spec and the canon disagree, the canon wins.

## Pricing

The mobile surface follows the shared subscription model: a Free tier, Basic at $7 / ₹399 (IAP-first), Pro at $20, Max at two ceilings of $100 and $200, Team at $30/seat, and Enterprise. There is no Plus or Hobby tier; top-ups are enabled for paid tiers (capped, opt-in). Pricing and entitlements are presented but enforced server-side; mobile never invents tiers or prices and reads them from the canonical source.

## Remote-control framing

On mobile, the phone is framed as a secure remote window over a session that remains local. Rather than relocating compute or trust to the device, AGI Mobile lets the user observe and steer a still-local runtime — a remote-control surface, not a new trust boundary. Local stays local; the phone is the glass, not the engine.

## Volumes

| #   | File                                                                                                         | Title                                         |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 01  | [volume-01-product-overview.md](volume-01-product-overview.md)                                               | Product Overview                              |
| 02  | [volume-02-mobile-architecture-expo.md](volume-02-mobile-architecture-expo.md)                               | Mobile Architecture (Expo)                    |
| 03  | [volume-03-authentication.md](volume-03-authentication.md)                                                   | Authentication                                |
| 04  | [volume-04-onboarding.md](volume-04-onboarding.md)                                                           | Onboarding                                    |
| 05  | [volume-05-cloud-mode.md](volume-05-cloud-mode.md)                                                           | Cloud Mode                                    |
| 06  | [volume-06-local-mode.md](volume-06-local-mode.md)                                                           | Local Mode                                    |
| 07  | [volume-07-home.md](volume-07-home.md)                                                                       | Home                                          |
| 08  | [volume-08-conversation-lifecycle.md](volume-08-conversation-lifecycle.md)                                   | Conversation Lifecycle                        |
| 09  | [volume-09-message-composer.md](volume-09-message-composer.md)                                               | Message Composer                              |
| 10  | [volume-10-ai-response-rendering.md](volume-10-ai-response-rendering.md)                                     | AI Response Rendering                         |
| 11  | [volume-11-conversation-history.md](volume-11-conversation-history.md)                                       | Conversation History                          |
| 12  | [volume-12-search.md](volume-12-search.md)                                                                   | Search                                        |
| 13  | [volume-13-projects.md](volume-13-projects.md)                                                               | Projects                                      |
| 14  | [volume-14-memory.md](volume-14-memory.md)                                                                   | Memory                                        |
| 15  | [volume-15-file-upload.md](volume-15-file-upload.md)                                                         | File Upload                                   |
| 16  | [volume-16-camera-and-vision.md](volume-16-camera-and-vision.md)                                             | Camera & Vision                               |
| 17  | [volume-17-image-generation.md](volume-17-image-generation.md)                                               | Image Generation                              |
| 18  | [volume-18-voice.md](volume-18-voice.md)                                                                     | Voice                                         |
| 19  | [volume-19-notifications.md](volume-19-notifications.md)                                                     | Notifications                                 |
| 20  | [volume-20-remote-runtime-control.md](volume-20-remote-runtime-control.md)                                   | Remote Runtime Control                        |
| 21  | [volume-21-runtime-actions.md](volume-21-runtime-actions.md)                                                 | Runtime Actions                               |
| 22  | [volume-22-cross-device-experience.md](volume-22-cross-device-experience.md)                                 | Cross-device Experience                       |
| 23  | [volume-23-settings.md](volume-23-settings.md)                                                               | Settings                                      |
| 24  | [volume-24-subscription.md](volume-24-subscription.md)                                                       | Subscription                                  |
| 25  | [volume-25-security.md](volume-25-security.md)                                                               | Security                                      |
| 26  | [volume-26-accessibility.md](volume-26-accessibility.md)                                                     | Accessibility                                 |
| 27  | [volume-27-performance.md](volume-27-performance.md)                                                         | Performance                                   |
| 28  | [volume-28-analytics.md](volume-28-analytics.md)                                                             | Analytics                                     |
| 29  | [volume-29-api-specification.md](volume-29-api-specification.md)                                             | API Specification                             |
| 30  | [volume-30-database-design.md](volume-30-database-design.md)                                                 | Database Design                               |
| 31  | [volume-31-ui-component-library.md](volume-31-ui-component-library.md)                                       | UI Component Library                          |
| 32  | [volume-32-edge-cases.md](volume-32-edge-cases.md)                                                           | Edge Cases                                    |
| 33  | [volume-33-qa-test-cases.md](volume-33-qa-test-cases.md)                                                     | QA Test Cases                                 |
| 34  | [volume-34-error-codes.md](volume-34-error-codes.md)                                                         | Error Codes                                   |
| 35  | [volume-35-localization.md](volume-35-localization.md)                                                       | Localization                                  |
| 36  | [volume-36-deployment.md](volume-36-deployment.md)                                                           | Deployment                                    |
| 37  | [volume-37-siri-and-apple-intelligence-integration.md](volume-37-siri-and-apple-intelligence-integration.md) | Siri & Apple Intelligence Integration         |
| 38  | [volume-38-on-device-foundation-models.md](volume-38-on-device-foundation-models.md)                         | On-Device Foundation Models (Apple & Android) |

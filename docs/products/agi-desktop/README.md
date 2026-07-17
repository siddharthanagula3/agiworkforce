# AGI Desktop — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

AGI Desktop is the full-trust surface of the suite: Local, BYOK, and Managed Cloud are all selectable, each with correct, visible provider labels. It is built on Tauri v2 (Rust `src-tauri`) + React + Vite, and acts as the LOCAL-PRIVATE COMPUTE HOST and native host for the rest of the products. It runs a 127.0.0.1 WS/IPC server for the Chrome and VS Code extensions (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`; port-8787 bridge; bridge tokens; IP lockout), hosts the Chrome native-messaging host `com.agiworkforce.browser`, and carries the Desktop↔Mobile companion (🟡 experimental — the panel is commented out of the chat index, control events are re-emitted with no listener, screen-share via `getDisplayMedia` exists, and HMAC verification runs through the Rust `dispatch_hmac` path). Trust boundaries are enforced: a Local→BYOK fork requires context selection, secret scan, payload preview, a visible provider label, and explicit user consent, and local files stay local unless explicitly transferred. The V3 shell exposes chat alongside AGI Work Projects/Artifacts/Scheduled/Dispatch surfaces.

Pricing is shared across the suite: Free, Basic ($7 · ₹399), Pro ($20), Max ($100 and $200), Team ($30/seat), and Enterprise. There is no Plus or Hobby tier; top-ups are enabled for paid tiers (capped, opt-in). Local and BYOK are free access modes wherever the surface permits them.

These are target/design specs. They are governed by [../README.md](../README.md) (the canon) and `docs/current/source-of-truth.md`, and every claim carries a mandatory ✅ / 🟡 / 🔭 label.

## Volumes

| # | File | Title |
| 01 | [volume-01-product-overview.md](volume-01-product-overview.md) | Product Overview |
| 02 | [volume-02-authentication.md](volume-02-authentication.md) | Authentication |
| 03 | [volume-03-application-shell.md](volume-03-application-shell.md) | Application Shell |
| 04 | [volume-04-home.md](volume-04-home.md) | Home |
| 05 | [volume-05-chat.md](volume-05-chat.md) | Chat |
| 06 | [volume-06-ai-response-rendering.md](volume-06-ai-response-rendering.md) | AI Response Rendering |
| 07 | [volume-07-voice.md](volume-07-voice.md) | Voice |
| 08 | [volume-08-desktop-vision.md](volume-08-desktop-vision.md) | Desktop Vision |
| 09 | [volume-09-file-upload.md](volume-09-file-upload.md) | File Upload |
| 10 | [volume-10-image-generation.md](volume-10-image-generation.md) | Image Generation |
| 11 | [volume-11-search.md](volume-11-search.md) | Search |
| 12 | [volume-12-memory.md](volume-12-memory.md) | Memory |
| 13 | [volume-13-projects.md](volume-13-projects.md) | Projects |
| 14 | [volume-14-desktop-integrations.md](volume-14-desktop-integrations.md) | Desktop Integrations |
| 15 | [volume-15-cloud-mode.md](volume-15-cloud-mode.md) | Cloud Mode |
| 16 | [volume-16-local-mode.md](volume-16-local-mode.md) | Local Mode |
| 17 | [volume-17-settings.md](volume-17-settings.md) | Settings |
| 18 | [volume-18-subscription.md](volume-18-subscription.md) | Subscription |
| 19 | [volume-19-security.md](volume-19-security.md) | Security |
| 20 | [volume-20-ai-backend.md](volume-20-ai-backend.md) | AI Backend |
| 21 | [volume-21-native-platform-integration.md](volume-21-native-platform-integration.md) | Native Platform Integration |
| 22 | [volume-22-accessibility.md](volume-22-accessibility.md) | Accessibility |
| 23 | [volume-23-analytics.md](volume-23-analytics.md) | Analytics |
| 24 | [volume-24-performance.md](volume-24-performance.md) | Performance |
| 25 | [volume-25-api-specification.md](volume-25-api-specification.md) | API Specification |
| 26 | [volume-26-database-design.md](volume-26-database-design.md) | Database Design |
| 27 | [volume-27-ui-component-library.md](volume-27-ui-component-library.md) | UI Component Library |
| 28 | [volume-28-edge-cases.md](volume-28-edge-cases.md) | Edge Cases |
| 29 | [volume-29-qa-test-cases.md](volume-29-qa-test-cases.md) | QA Test Cases |
| 30 | [volume-30-error-codes.md](volume-30-error-codes.md) | Error Codes |
| 31 | [volume-31-localization.md](volume-31-localization.md) | Localization |
| 32 | [volume-32-deployment.md](volume-32-deployment.md) | Deployment |

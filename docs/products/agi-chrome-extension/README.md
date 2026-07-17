# AGI Chrome Extension — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

The AGI Chrome Extension is the "AGI Browser Companion" — a permission-gated BROWSER AGENT (modeled on Claude for Chrome plus our shipped automation), NOT a standalone consumer assistant. It operates on live pages with explicit user permission: reading page context/DOM/console/network, capturing screenshots and regions, navigating/clicking/typing/filling forms, and orchestrating tabs and tab groups across multi-step workflows. It can record-and-replay demonstrated workflows, run scheduled recurring browser tasks, and enforce ask-before-acting plan approvals plus high-risk-action approvals and high-risk-site detection/intervention. Shipped capabilities include job autofill (LinkedIn/Lever/Greenhouse/Ashby ✅ `apps/extension/src/features/content/autofill/`) and CDP computer-use with escalation (✅ `agentLoop.ts` / `cdpDriver.ts` / `escalationEngine.ts`). Its chat is a THIN BRIDGED CHAT that streams via the cloud gateway (`providerStreamClient.ts` -> `/api/v1/providers/<id>/stream`; `cloudAgentClient.ts` EGRESS rule: no provider host is ever contacted directly from the extension).

Pricing follows the shared platform model: Free / Basic ($7·₹399) / Pro ($20) / Max ($100 & $200) / Team ($30/seat) / Enterprise. There is no Plus or Hobby tier; top-ups are enabled for paid tiers (capped, opt-in). Local and BYOK remain free access modes where the surface allows them.

These are target/design specs governed by [../README.md](../README.md) (the canon) and [docs/current/source-of-truth.md](../../current/source-of-truth.md). All capability claims must carry the mandatory ✅ / 🟡 / 🔭 labels (shipped / partial / planned).

## Volumes

| #   | File                                                                                     | Title                        |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| 01  | [volume-01-product-overview.md](volume-01-product-overview.md)                           | Product Overview             |
| 02  | [volume-02-authentication.md](volume-02-authentication.md)                               | Authentication               |
| 03  | [volume-03-extension-architecture.md](volume-03-extension-architecture.md)               | Extension Architecture       |
| 04  | [volume-04-assistant-interface.md](volume-04-assistant-interface.md)                     | Assistant Interface          |
| 05  | [volume-05-chat.md](volume-05-chat.md)                                                   | Chat                         |
| 06  | [volume-06-page-awareness.md](volume-06-page-awareness.md)                               | Page Awareness               |
| 07  | [volume-07-browser-assistant.md](volume-07-browser-assistant.md)                         | Browser Assistant            |
| 08  | [volume-08-browser-actions.md](volume-08-browser-actions.md)                             | Browser Actions              |
| 09  | [volume-09-website-interaction.md](volume-09-website-interaction.md)                     | Website Interaction          |
| 10  | [volume-10-search.md](volume-10-search.md)                                               | Search                       |
| 11  | [volume-11-files-and-images.md](volume-11-files-and-images.md)                           | Files & Images               |
| 12  | [volume-12-workflow-recording-and-replay.md](volume-12-workflow-recording-and-replay.md) | Workflow Recording & Replay  |
| 13  | [volume-13-scheduled-browser-tasks.md](volume-13-scheduled-browser-tasks.md)             | Scheduled Browser Tasks      |
| 14  | [volume-14-desktop-bridge-and-pairing.md](volume-14-desktop-bridge-and-pairing.md)       | Desktop Bridge & Pairing     |
| 15  | [volume-15-browser-integration.md](volume-15-browser-integration.md)                     | Browser Integration          |
| 16  | [volume-16-settings.md](volume-16-settings.md)                                           | Settings                     |
| 17  | [volume-17-subscription.md](volume-17-subscription.md)                                   | Subscription                 |
| 18  | [volume-18-security.md](volume-18-security.md)                                           | Security                     |
| 19  | [volume-19-ai-backend.md](volume-19-ai-backend.md)                                       | AI Backend                   |
| 20  | [volume-20-browser-platform-integration.md](volume-20-browser-platform-integration.md)   | Browser Platform Integration |
| 21  | [volume-21-accessibility.md](volume-21-accessibility.md)                                 | Accessibility                |
| 22  | [volume-22-analytics.md](volume-22-analytics.md)                                         | Analytics                    |
| 23  | [volume-23-performance.md](volume-23-performance.md)                                     | Performance                  |
| 24  | [volume-24-api-specification.md](volume-24-api-specification.md)                         | API Specification            |
| 25  | [volume-25-data-storage.md](volume-25-data-storage.md)                                   | Data Storage                 |
| 26  | [volume-26-ui-component-library.md](volume-26-ui-component-library.md)                   | UI Component Library         |
| 27  | [volume-27-edge-cases.md](volume-27-edge-cases.md)                                       | Edge Cases                   |
| 28  | [volume-28-qa-test-cases.md](volume-28-qa-test-cases.md)                                 | QA Test Cases                |
| 29  | [volume-29-error-codes.md](volume-29-error-codes.md)                                     | Error Codes                  |
| 30  | [volume-30-localization.md](volume-30-localization.md)                                   | Localization                 |
| 31  | [volume-31-deployment.md](volume-31-deployment.md)                                       | Deployment                   |

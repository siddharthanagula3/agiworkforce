# AGI Web — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

AGI Web is the CLOUD-ONLY surface of the platform: it has NO BYOK and NO Local mode, and neither affordance may ever be added. It runs on Next.js 16 App Router with `proxy.ts` exporting a `proxy` function (never `middleware.ts`), Clerk auth, Neon Postgres (canonical migrations in `apps/web/db/neon`, RLS/user-scoped), and Stripe billing, deployed on Vercel. Web owns the account, projects, synced app chats, artifacts, billing, and admin. Managed cloud is in public alpha and open by default, so every capability is presented as available and is never waitlist-gated. Web chat is subscription-backed through Neon and account state — there is no free env-key chat — and cross-device sync is delivered by the Neon delta-sync APIs Web itself hosts (✅ built: `apps/web/app/api/{chat,memory,projects}/sync`).

## Pricing

AGI Web uses the shared platform pricing model: Free, Basic ($8 · ₹399), Pro ($20), Max ($100 and $200), and Enterprise. There is no Plus or Hobby tier and no top-ups. Local and BYOK are free access modes on the surfaces where they are offered — on Web, which is cloud-only, neither applies, so paid managed cloud is the only path to chat.

## Spec Governance

These volumes are target/design specs, not a description of shipped state. They are governed by [../README.md](../README.md) (the canon) and `docs/current/source-of-truth.md`. Every capability claim must carry a mandatory status label: ✅ built, 🟡 partial/in-progress, or 🔭 planned.

## Volumes

| #   | File                                                                     | Title                 |
| --- | ------------------------------------------------------------------------ | --------------------- |
| 01  | [volume-01-product-overview.md](volume-01-product-overview.md)           | Product Overview      |
| 02  | [volume-02-authentication.md](volume-02-authentication.md)               | Authentication        |
| 03  | [volume-03-home.md](volume-03-home.md)                                   | Home                  |
| 04  | [volume-04-chat.md](volume-04-chat.md)                                   | Chat                  |
| 05  | [volume-05-ai-response-rendering.md](volume-05-ai-response-rendering.md) | AI Response Rendering |
| 06  | [volume-06-voice.md](volume-06-voice.md)                                 | Voice                 |
| 07  | [volume-07-file-upload.md](volume-07-file-upload.md)                     | File Upload           |
| 08  | [volume-08-image-generation.md](volume-08-image-generation.md)           | Image Generation      |
| 09  | [volume-09-search.md](volume-09-search.md)                               | Search                |
| 10  | [volume-10-memory.md](volume-10-memory.md)                               | Memory                |
| 11  | [volume-11-projects.md](volume-11-projects.md)                           | Projects              |
| 12  | [volume-12-settings.md](volume-12-settings.md)                           | Settings              |
| 13  | [volume-13-subscription.md](volume-13-subscription.md)                   | Subscription          |
| 14  | [volume-14-security.md](volume-14-security.md)                           | Security              |
| 15  | [volume-15-ai-backend.md](volume-15-ai-backend.md)                       | AI Backend            |
| 16  | [volume-16-accessibility.md](volume-16-accessibility.md)                 | Accessibility         |
| 17  | [volume-17-analytics.md](volume-17-analytics.md)                         | Analytics             |
| 18  | [volume-18-performance.md](volume-18-performance.md)                     | Performance           |
| 19  | [volume-19-api-specification.md](volume-19-api-specification.md)         | API Specification     |
| 20  | [volume-20-database-design.md](volume-20-database-design.md)             | Database Design       |
| 21  | [volume-21-ui-component-library.md](volume-21-ui-component-library.md)   | UI Component Library  |
| 22  | [volume-22-edge-cases.md](volume-22-edge-cases.md)                       | Edge Cases            |
| 23  | [volume-23-qa-test-cases.md](volume-23-qa-test-cases.md)                 | QA Test Cases         |
| 24  | [volume-24-error-codes.md](volume-24-error-codes.md)                     | Error Codes           |
| 25  | [volume-25-localization.md](volume-25-localization.md)                   | Localization          |
| 26  | [volume-26-deployment.md](volume-26-deployment.md)                       | Deployment            |

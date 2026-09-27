# Infrastructure unit costs

Status: Current evidence for the committed rate card rows
Owner: Billing
Last updated: 2026-09-27

Every price below was read on the vendor's own pricing page on 2026-09-27. The
committed figures live in `packages/contracts/types/src/rate-card.ts`; this page
records where each number came from and how it was converted. Each row keeps its
`AGI_*` override variable, so a deployment on a different plan or region
replaces the figure without a code change.

## Vendors the code uses

| Category             | Vendor                                                  | Evidence                                                                                                                                                       |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object storage       | Cloudflare R2, through the S3 adapter                   | `packages/platform/object-storage/src/config.ts` builds the endpoint from `CLOUDFLARE_R2_ACCOUNT_ID`                                                           |
| Database             | Neon Postgres                                           | `@neondatabase/serverless` in `apps/web/package.json`, `AGI_DATABASE_PROVIDER=neon` in `apps/web/.env.example`                                                 |
| Vector store         | pgvector inside Neon                                    | `create extension if not exists vector` in `apps/web/db/neon/0202_retrieval_index.sql`, `embedding <=>` in `apps/web/lib/services/retrieval-search-service.ts` |
| Email                | Resend                                                  | `RESEND_ENDPOINT` in `apps/web/lib/support/handoff/resend-client.ts`                                                                                           |
| Notifications        | Web Push (VAPID) and Expo push                          | `apps/web/lib/services/web-push-service.ts`, `apps/web/lib/services/push-notification-service.ts`                                                              |
| Cache and rate limit | Upstash Redis                                           | `@upstash/redis` and `@upstash/ratelimit` in `apps/web/package.json`, `apps/web/lib/rate-limit.ts`                                                             |
| Hosting              | Vercel                                                  | `vercel.json`; no `regions` key, so functions run in the new-project default, iad1                                                                             |
| Auth                 | Clerk                                                   | `@clerk/nextjs` in `apps/web/package.json`                                                                                                                     |
| Observability        | Sentry; the OTLP exporter has no configured destination | `@sentry/nextjs` in `apps/web/package.json`, `AGI_OTEL_EXPORTER_ENDPOINT` unset in `apps/web/.env.example`                                                     |

The Neon plan and the Vercel region override are not recorded anywhere in the
repository. The rows use Neon Scale and Vercel iad1; the override variables are
the correction if either differs.

## Unit prices

| Rate card row                   | Vendor price (source, read 2026-09-27)                                                                                                                                                                                                                                                                                                        | Committed microUSD                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `object_storage_gib_month`      | R2 Standard storage $0.015 per GB-month, egress free ([R2 pricing](https://developers.cloudflare.com/r2/pricing/), page dated 2026-08-07)                                                                                                                                                                                                     | 16,106.13 per GiB-month             |
| `artifact_storage_gib_month`    | Same R2 storage price                                                                                                                                                                                                                                                                                                                         | 16,106.13 per GiB-month             |
| `database_compute_second`       | Neon Scale $0.222 per CU-hour; Launch is $0.106 ([Neon pricing](https://neon.com/pricing))                                                                                                                                                                                                                                                    | 61.67 per CU-second                 |
| `vector_query_request`          | Neon compute, estimated at 50 ms of one CU per query                                                                                                                                                                                                                                                                                          | 3.08 per query (estimate)           |
| `notification_delivery_request` | Expo push is free ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/)), FCM is no-cost ([Firebase pricing](https://firebase.google.com/pricing)), Web Push has no vendor; the send is one Vercel invocation at $0.60 per million ([Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing), page dated 2026-06-16) | 0.6 per delivery (estimate)         |
| `email_message_request`         | Resend Pro overage $0.90 per 1,000 emails ([Resend pricing](https://resend.com/pricing))                                                                                                                                                                                                                                                      | 900 per email                       |
| `network_egress_gib`            | Vercel iad1 Fast Data Transfer $0.15 per GB plus Fast Origin Transfer $0.06 per GB ([iad1 pricing](https://vercel.com/docs/pricing/regional-pricing/iad1), page dated 2026-09-14)                                                                                                                                                             | 225,485.78 per GiB                  |
| `connector_call_request`        | The connected account bills its own owner; the call is one Vercel invocation at $0.60 per million                                                                                                                                                                                                                                             | 0.6 per call (estimate)             |
| `hosting_platform_month`        | Vercel Pro, one paid seat at $20 a month with a $20 usage credit ([Vercel pricing](https://vercel.com/docs/pricing), page dated 2026-09-14)                                                                                                                                                                                                   | 20,000,000 per month                |
| `auth_platform_month`           | Clerk Pro $25 a month billed monthly, $20 billed annually ([Clerk pricing](https://clerk.com/pricing))                                                                                                                                                                                                                                        | 25,000,000 per month                |
| `auth_active_user_month`        | Clerk Pro includes 50,000 monthly retained users, then $0.02 each up to 100,000 ([Clerk pricing](https://clerk.com/pricing))                                                                                                                                                                                                                  | 20,000 per active user above 50,000 |
| `cache_command_request`         | Upstash pay as you go $0.20 per 100K commands ([Upstash Redis pricing](https://upstash.com/pricing/redis))                                                                                                                                                                                                                                    | 2 per command                       |
| `observability_platform_month`  | Sentry Team $26 a month with 50k errors and 5M spans included ([Sentry pricing](https://sentry.io/pricing/))                                                                                                                                                                                                                                  | 26,000,000 per month                |
| `email_platform_month`          | Resend Pro $20 a month for 50,000 emails ([Resend pricing](https://resend.com/pricing))                                                                                                                                                                                                                                                       | 20,000,000 per month                |

Conversions:

- The rows meter binary gibibytes, and the vendors quote decimal gigabytes. A
  GiB is 1.073741824 GB, so $0.015 per GB is 16,106.13 microUSD per GiB. Where
  a vendor does not state its byte definition, the decimal reading is used
  because it gives the higher per-GiB cost.
- A CU-second is a CU-hour divided by 3,600.
- Vercel Pro includes the lowest Flat Rate CDN tier (1M CDN requests, 1 TB of
  data transfer, [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn)).
  The egress row still charges on-demand Fast Data Transfer, so a deployment
  inside that tier overstates egress until the monthly Vercel bill is allocated
  against it.

## Estimates

Three rows are marked `estimate: true`:

- **Vector queries** run on the same Neon compute as every other query, so the
  vendor bills compute time rather than queries. 50 ms of one CU is the figure
  used; the hybrid query is a filtered HNSW or full-text lookup bounded by
  `MAX_CANDIDATES` in `retrieval-search-service.ts`.
- **Notification deliveries and connector calls** cost the vendor nothing; the
  only cost is the Vercel function that sends them, charged at one invocation.

The monthly allocation tops each vendor up to its bill, so a per-use estimate
that runs low is made whole there; one that runs high leaves that vendor's
ledger total above its bill, which errs toward overstating cost.

## Monthly allocation

`/api/cron/allocate-infrastructure-costs` spreads each vendor's bill for the
previous month, less what that vendor's per-use rows already priced, across the
month's active accounts. An active account is one with a `provider_cost_events`
row or a Free usage reservation in the month. A recorded invoice wins over the
committed estimate; the procedure is in
`docs/runbooks/infrastructure-cost-allocation.md`. Infrastructure is cost of
goods, never a credit charge: every infrastructure row is
`includedInPlans: 'all_plans'`.

## Payment fees

Stripe fees are not computed from a rate: the daily Stripe import in
`reconcile-credits` records the fee Stripe reports on each balance transaction
and attributes it to the subscription, through the invoice payment's
subscription metadata, or to the top-up, through the payment intent metadata
([Stripe metadata copying](https://docs.stripe.com/metadata), read 2026-09-27).
For reference, [Stripe pricing](https://stripe.com/pricing) lists 2.9% + 30¢ for
domestic cards, plus 1.5% for international cards and 1% for currency
conversion.

Store commission is recorded per verified purchase from
`MOBILE_IAP_STORE_COMMISSION` in `packages/contracts/types/src/mobile-iap.ts`:

| Store                                                  | Rate                                                                            | Source, read 2026-09-27                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| App Store subscription, first year                     | 30% ("you receive 70% of the subscription price")                               | [Auto-renewable subscriptions](https://developer.apple.com/app-store/subscriptions/)    |
| App Store subscription, after one year of paid service | 15% ("net revenue increases to 85%")                                            | same page                                                                               |
| App Store one-time purchase                            | 30%, 15% only inside the Small Business Program                                 | [Small Business Program](https://developer.apple.com/app-store/small-business-program/) |
| Google Play auto-renewing subscription                 | 15% (10% service fee plus 5% billing fee in the US, EEA and UK from 2026-06-30) | [Service fees](https://support.google.com/googleplay/android-developer/answer/112622)   |
| Google Play one-time purchase, first $1M a year        | 15% (10% plus 5% billing fee on new installs from 2026-06-30)                   | same page                                                                               |

The repository records no App Store Small Business Program enrollment, so the
standard App Store rates are committed; enrollment moves every App Store row to
15%.

## Free daily caps

`FREE_DAILY_CAPS` in `packages/contracts/types/src/billing-catalog.ts` bounds
what one Free account can make the platform store, serve, send and search in a
UTC day. What the leaders publish, read 2026-09-27:

- **Claude.** "Every plan has usage limits that reset on a rolling five-hour
  session window" and there is no fixed message count; Free "covers everyday
  questions" ([Claude pricing](https://claude.com/pricing)). Free accounts can
  create at most five projects, and retrieval over project knowledge is
  paid-only ([What are projects](https://support.claude.com/en/articles/9517075-what-are-projects),
  updated the week of 2026-09-27). Uploads are 500 MB per file and 20 files per
  chat with no daily upload count, on every plan
  ([Upload files](https://support.claude.com/en/articles/8241126-upload-files-to-claude),
  updated 2026-07-23). Scheduled tasks are Pro and above.
- **ChatGPT.** help.openai.com and chatgpt.com answered 403 to every fetch on
  2026-09-27, so no ChatGPT Free figure is verified here. Search snippets of the
  Free tier FAQ describe everyday chat as unlimited subject to abuse
  safeguards, which matches Claude's no-fixed-count position; that reading is
  unverified.
- **Gemini** (the tie-breaker where both are silent) uses compute-based limits
  that refresh every five hours up to a weekly limit, with no Free number
  published ([Gemini limits](https://support.google.com/gemini/answer/16275805)).

Neither leader publishes a daily cap on stored messages, downloads, emails or
searches, and both bound Free by usage windows plus abuse safeguards. The caps
below are that safeguard, sized so ordinary Free use never meets them:

| Cap                                  | Free limit a UTC day                              | Enforced at                                                                                                                          |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Messages saved                       | 1,000                                             | `persistConversationMessage` for user and system turns, the bulk save route, chat sync push, conversation fork                       |
| Conversations started                | 100                                               | conversation create, chat sync push, conversation fork                                                                               |
| File downloads                       | 500 MiB, five times the 100 MB Free storage quota | `/api/files/[id]` before bytes are served                                                                                            |
| Emails sent on the account's behalf  | 10                                                | team invitation email; the invite link is still returned for manual delivery                                                         |
| Semantic searches of files and chats | 200                                               | the query embedding in `embedTextsMetered`; over the cap, search ranks by full text alone, since Claude Free has no retrieval at all |

A capped write answers 429 with a user-safe message that names the limit, the
reset at midnight UTC and the upgrade path. Paid plans are uncapped. Messages
and conversations are counted from their own tables; downloads, emails and
semantic searches are counted from their `provider_cost_events` rows, which
also carry their cost. Legal and support mail (privacy requests, copyright
notices, support escalations) is never capped, and data export is left to its
own rate limit so a Free account can always take its data.

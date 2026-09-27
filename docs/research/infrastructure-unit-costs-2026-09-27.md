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

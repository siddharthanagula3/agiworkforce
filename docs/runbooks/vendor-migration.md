# Vendor migration

Status: Current
Owner: Platform lead
Last updated: 2026-09-17

What it takes to replace each third-party dependency, and which of them can be
replaced today without a code change. This is the operational companion to
`docs/standards/deprecation-policy.md`, which governs the notice a customer is
owed when a format changes.

Read the seam before believing a row. Where a provider sits behind a factory,
swapping it is configuration. Where it does not, the row says so and names the
work, because a vendor-neutral claim that is not true is worse than an honest
lock-in.

## The seam, per dependency

| Dependency                | Interface                                                         | Adapters that exist today          | Swappable by       |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ------------------ |
| Database                  | `DatabaseAdapter` in `packages/platform/data-layer`               | Neon, plain Postgres               | configuration      |
| Auth                      | `AuthAdapter` in `packages/platform/data-layer`                   | Clerk                              | writing an adapter |
| Key-value + rate limiting | `KeyValueStore` in `packages/platform/key-value`                  | Upstash, Redis, in-memory          | configuration      |
| Object storage            | `ObjectStore` in `packages/platform/object-storage`               | S3-compatible, in-memory           | configuration      |
| Search                    | `SearchProvider` in `packages/platform/data-layer`                | Postgres lexical plus pgvector     | writing an adapter |
| Vector store              | `EmbeddingProvider` in `packages/platform/data-layer`             | pgvector, through the same adapter | writing an adapter |
| Observability             | OpenTelemetry export, `apps/web/lib/observability/otel-config.ts` | any OTLP collector                 | configuration      |
| Error reporting           | `packages/platform/observability`                                 | Sentry                             | writing an adapter |
| Email                     | `apps/web/lib/support/handoff/resend-client.ts`                   | Resend                             | code change        |
| Billing                   | `apps/web/app/api/stripe-webhook`                                 | Stripe                             | code change        |
| Queue and durable runs    | Vercel Workflow                                                   | one                                | code change        |
| Analytics                 | no server-side pipeline                                           | none                               | nothing to move    |
| Hosting                   | the container in `apps/web/Dockerfile`                            | proven weekly off-platform         | see below          |
| CDN                       | platform-managed                                                  | none in this repository            | see below          |

## The rows that are configuration today

**Database.** `createDatabaseClient` picks the adapter. The portability drill
runs the whole application against a plain Postgres container with no platform
services, weekly, in `.github/workflows/web-container-drill.yml`, so this is
measured rather than asserted. Moving a live deployment is a data migration
(`pnpm db:migrate`) plus a connection string, not a code change.

**Key-value.** `AGI_KV_PROVIDER` selects `upstash`, `redis`, `memory` or `none`,
and `resolveKeyValueRuntime` builds the store and the rate limiter from it. A
deployment with a plain Redis gets the sliding-window limiter instead of the
vendor's; behaviour is the same, the implementation is ours.

**Object storage.** `AGI_STORAGE_PROVIDER` selects the adapter. The S3 adapter is
written against the S3 API rather than one vendor's console, so any
S3-compatible store works with an endpoint and credentials.

**Observability.** Traces and metrics go out over OTLP. Pointing them at a
different collector is an endpoint and a header.

## The rows that need an adapter written

**Auth.** `AuthAdapter` is the interface and Clerk is the only implementation.
The migration is in two halves, and the second is the expensive one:

1. Write the adapter. The interface is small: verify a token, refresh a token,
   resolve a subject.
2. Move the accounts. Clerk exports users, and password hashes are exportable in
   a form other providers accept, but every session is invalidated and every
   user signs in again. Organisation membership and roles live in our own tables
   (`organization_members`), not the provider's, so those survive untouched.
   Device credentials are ours as well.

Do not start the second half before the first is in production behind a flag.

**Search and vector.** `SearchProvider` and `EmbeddingProvider` already exist and
are implemented over Postgres full text and pgvector, so a managed search vendor
is a new adapter rather than a rewrite of the call sites. The embedding width is
fixed by the column declaration (`RETRIEVAL_EMBEDDING_DIMENSIONS`), so a provider
with a different width needs a migration and a full re-index, which is the real
cost of that move and not the adapter.

**Error reporting.** The scrubbing and the client wrapper are ours; only the
transport is Sentry's. An adapter alongside `sentryFetchAdapter.ts` is the shape.

## The rows that need a code change

**Email.** Transactional email goes out through one Resend client with the
endpoint written into it. Every caller already goes through
`sendTransactionalEmail`, so the seam exists at the call sites even though the
implementation is single-vendor: introducing a provider interface behind that one
function is the whole change, and no caller moves.

**Billing.** Stripe is not abstracted, and abstracting it is not obviously
correct. Subscriptions, tax, invoicing, webhooks and the customer portal are
deeply vendor-shaped, and an interface wide enough to cover a second provider
would be a rewrite of the billing domain rather than an adapter. The realistic
migration is a parallel implementation with a cutover, not a swap, and the
credit ledger, the entitlement tables and every price are already ours rather
than the vendor's, which is the part that would otherwise be unrecoverable.

**Queue and durable runs.** Durable execution is Vercel Workflow specific. The
transport kind is already named (`CloudAgentTransportKind`) and the inline path
is a working fallback, so the shape of a second transport exists; a second
implementation does not.

## The rows with nothing to move

**Analytics.** There is no server-side product analytics pipeline. The desktop
and VS Code surfaces post telemetry to configurable endpoints, which is already
neutral. Adding a pipeline is new work, not a migration, and it should be built
behind an interface from the start rather than retrofitted.

**CDN and hosting.** Neither is modelled in this repository, because neither is
code here. What is measured is the thing that matters: the weekly container
drill boots the production image with no platform services and asserts the
portability contract, so the application is known to run off-platform. What is
not proven is the surrounding platform behaviour, cron scheduling and durable
workflow execution in particular, and that is the honest limit of the claim.

## Data formats a customer holds

A per-user export exists at `apps/web/app/api/user/export/route.ts`, carries a
`format_version`, and is tested for completeness against the erasure inventory,
so a section that stops being exported fails a test rather than going quiet.

Two gaps, stated plainly because a claim of portability that is not true is worse
than no claim:

- **There is no importer.** The export is a portability artefact, readable by the
  customer and by another tool. Nothing in this repository reads it back.
- **There is no organisation-level export.** The format is per user. An
  enterprise moving a whole workspace has no single artefact to take with them.

Both are on the roadmap rather than in the product. Until they ship, no public
page may describe the product as offering workspace export or import; the claim
tests under `apps/web/__tests__` exist to catch exactly that.

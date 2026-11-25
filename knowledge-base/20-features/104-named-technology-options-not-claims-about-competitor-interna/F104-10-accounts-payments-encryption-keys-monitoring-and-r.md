---
id: "F104-10"
type: "feature"
title: "Accounts, payments, encryption keys, monitoring and release builds"
aliases: ["Accounts, payments, encryption keys, monitoring and release builds", "Identity provider", "Clerk sign-in", "Checkout and Stripe webhook", "Customer-managed keys (CMEK)", "Sentry and OpenTelemetry", "Feature flags", "Release signing", "S104.19", "S104.20", "S104.21", "S104.22", "S104.23", "S104.27"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.19", "S104.20", "S104.21", "S104.22", "S104.23", "S104.27"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "plan:enterprise", "api:POST /api/checkout", "api:GET /api/me", "table:organization_encryption_keys", "table:feature_flag_definitions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-10 Accounts, payments, encryption keys, monitoring and release builds

Six platform services around the product. Sign-in goes through a hosted identity provider behind a port. Checkout creates payment sessions and verifies webhooks. Enterprise workspaces can wrap keys with AWS, GCP or Azure key services. Errors and traces export when configured. Flags live in the database. Releases are signed in CI.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.19](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10419), [S104.20](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10420), [S104.21](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10421), [S104.22](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10422), [S104.23](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10423), [S104.27](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10427).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides sign-in (web and mobile), paid-plan checkout and webhooks, customer-managed encryption keys, error and trace export, per-user feature flags and entitlement bundles, and signed desktop, Windows and mobile builds.

**Why it exists.** The brief names these as the product's account, payment, key, monitoring, flag and release layers (S104.19 to S104.23, S104.27) (doc: knowledge-base/data/area-briefs/104-named-technology-options-not-claims-about-competitor-interna.md).

**Who uses it.** Every signed-in person (sign-in, flags), buyers (checkout), enterprise admins (keys), developers and operators (monitoring, CI).

**Problems it solves**

- Secure account identity without custom passwords code.
- Reliable plan changes from verified payment events.
- Enterprise control of data keys.
- Seeing production errors with the build that caused them.
- Turning features on and off per user or workspace.
- Shipping installers that operating systems trust.

**Use cases**

- Sign in on web or mobile.
- An admin attaches a customer-managed key to the workspace.
- A developer reads an error in the error tracker.
- Staff turn a capability off with a kill switch.

## 2. User experience

**Where to find it**

- Web: sign-in shows 'Sign in to AGI' / 'Create your AGI account' (Provider.tsx:5-21).
- Web: billing return page /billing after checkout (checkout/route.ts:501).
- Web: workspace console section 'Encryption key' (WorkspaceEncryptionKey.tsx:369).
- Mobile: the app wraps the root in ClerkProvider (apps/mobile/app/_layout.tsx:994).
- Developers: CI workflow files under .github/workflows.

**Before you start**

- Hosted identity configured with its keys (names only: CLERK_SECRET_KEY is read, health-check.test.ts:32).
- Checkout needs STRIPE_SECRET_KEY and the gate not set to off (checkout/route.ts:58-62,178-181).
- Keys need an Enterprise plan and workspace admin permission (keys-access.ts:25-45).

**Screens and controls**

- Identity hosted sign-in UI.
- Keys: view, provision, change, revoke, rewrap (keys/route.ts:357-360).
- Flags: admin feature-flags API (app/api/admin/feature-flags).

**Journey**

1. Sign in; the web proxy applies identity middleware to routes.
2. The client calls /api/me to read the entitlement bundle and enabled flags.
3. To buy: checkout creates a subscription session and redirects; the webhook later updates the plan.
4. Admin: choose provider, key URI and region; the server tests the key and wraps a data key.

**What the person sees and gets**

- Checkout refusals: 'Paid-plan checkout is not available yet. Local and BYOK are free.' (checkout/route.ts:178-181).
- Key errors: 'Managing your own encryption key requires an active Enterprise plan...' (keys-access.ts:31-37).
- /api/me returns plan, flags, capability handshake (me/route.ts:197-340).

**Settings**

- STRIPE_CHECKOUT_ENABLED (example file ships false) (.env.example:231-232).
- AGI_PLATFORM_KEY_PROVIDER and related key variables (platform-keys.ts:11-16).
- Observability: AGI_OTEL_EXPORTER_ENDPOINT, AGI_OTEL_SERVICE_NAME, AGI_OTEL_HEADERS, AGI_OTEL_SAMPLE_RATIO, AGI_OTEL_SLOW_SPAN_MS, SENTRY_DSN (otel-config.ts:17-22; sentry-shared.ts:19-25).
- FEATURE_FLAG_DEFINITION_CACHE_TTL_MS (flag-config.ts:4).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Identity is chosen in one place through a port, so the provider can change by configuration plus an adapter (identity.ts:11-30). The web client provider is Clerk with telemetry off (Provider.tsx:24-30) and loads only on routes that need it (BrowserIdentityBoundary.tsx:7-20). The proxy builds its middleware from the port (proxy.ts:30).
- Mobile uses the Clerk Expo provider with a token cache (apps/mobile/app/_layout.tsx:58-59,994).
- Checkout checks CSRF, the enabled gate, rate limit and plan-change rules, reuses or creates a customer, refuses a second live subscription, and creates a subscription-mode session (checkout/route.ts:169-200,372-500).
- Webhooks verify the signature with a 60-second tolerance, check idempotency, then dispatch about 20 event types (verify.ts:14-45; stripe-webhook/route.ts:48-76).
- Key providers: AWS, GCP and Azure providers are built only if their credentials exist, so an unconfigured one cannot answer; a local provider exists outside production only (kms-providers.ts:13-14,353-370; organization-encryption-keys.ts:231-242).
- Keys are Enterprise-gated and owner-gated for revoke (keys-access.ts:25-60).
- Error tracking starts only in production with a DSN; trace export starts only with an endpoint; platform keys are preloaded at boot (instrumentation.ts:80-125; sentry-shared.ts:23-25).
- Flag definitions are read from feature_flag_definitions with a cache of 30 seconds by default and a fail-closed mode (flag-store.ts:111-170; flag-config.ts:18); /api/me evaluates flags and kill switches per subject (me/route.ts:236-300).
- Desktop macOS release signs, notarizes and staples installers with App Store Connect credentials (release-desktop-cloud.yml:212-236,272); Windows release uses Azure artifact signing (build-windows-release.yml:136,229); CI has jobs for guards, lint, typecheck, build, security, E2E (ci.yml:22-1833).

**Incomplete**

- Checkout may be off in an environment: the example env sets it false (.env.example:232).
- Own checkout flow on Local and BYOK: not required, they are free (checkout/route.ts:178-181).

**Present but disconnected or switched off**

- Monitoring does nothing without a DSN or endpoint (sentry-shared.ts:23-25; instrumentation.ts:96-120).
- Mobile and extension have no error-tracking package in their manifests; desktop has one (apps/desktop/package.json:93) - mobile, extension: none found.

**Not available**

- CLI, VS Code and Chrome sign-in providers not read here.

## 4. Required behaviour

**Established requirements**

- Encryption keys are held in a key ring and can be wrapped by a cloud KMS (AWS, GCP, Azure). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.19)
- Sign-in on web and mobile goes through a hosted authentication provider behind an identity port. (source: S104.20 (same brief))
- Payments run through a payment provider with checkout sessions and verified webhooks. (source: S104.21 (same brief))
- Errors and traces are exported to an observability platform. (source: S104.22 (same brief))
- Features are gated by a server-side flag system with stored definitions and per-subject evaluation. (source: S104.23 (same brief))
- CI builds and tests every change; release pipelines sign and notarize installers. (source: S104.27 (same brief))
- Secrets are never committed; security behavior fails closed. (source: doc: AGENTS.md section 6)
- No mock production paths, silent failures or unused abstractions. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A webhook with a bad signature gets 400 and an audit entry; a valid one is processed once even if sent twice.
2. Checkout with the gate off returns the 'not available yet' message and creates no session.
3. A second checkout for an account with a live subscription is refused.
4. With no AWS credentials, an organization key using AWS cannot be resolved rather than falling back.
5. A non-Enterprise workspace is refused when provisioning a key.
6. With no DSN in production no error client starts and boot succeeds.
7. A flag kill switch removes the capability in /api/me.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and BYOK users need no payment because they are free [inferred] (checkout/route.ts:178-181).
- Sign-in is required for Cloud only; whether it is required for Local on each app is a separate question: unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a monitoring path for mobile and extension if required.
- [proposed] Record the signing identity check in a runbook.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BrowserIdentityProvider | `apps/web/lib/identity/Provider.tsx` | Hosted sign-in provider, telemetry off. |
| service | identity port | `apps/web/lib/server/identity.ts` | Single place choosing the provider. |
| service | web proxy | `apps/web/proxy.ts` | Routing middleware using the identity middleware and CSP. |
| component | mobile root layout | `apps/mobile/app/_layout.tsx` | ClerkProvider with token cache. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Creates subscription checkout sessions. |
| endpoint | POST /api/stripe-webhook | `apps/web/app/api/stripe-webhook/route.ts` | Receives and dispatches payment events. |
| service | verify | `apps/web/app/api/stripe-webhook/lib/verify.ts` | Signature check and rate limit. |
| service | idempotency | `apps/web/app/api/stripe-webhook/lib/idempotency.ts` | Event de-duplication. |
| service | kms-providers | `apps/web/lib/crypto/kms-providers.ts` | AWS, GCP and Azure key providers. |
| service | platform-keys | `apps/web/lib/crypto/platform-keys.ts` | Platform data key provider selection. |
| service | organization-encryption-keys | `apps/web/lib/server/organization-encryption-keys.ts` | Per-workspace key ring and registry. |
| endpoint | /api/settings/organization/keys | `apps/web/app/api/settings/organization/keys/route.ts` | View, provision, change, revoke keys. |
| component | WorkspaceEncryptionKey | `apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx` | Key management UI. |
| table | organization_encryption_keys | `apps/web/db/neon/0230_job_origin_region_and_azure_kms.sql` | Stores wrapped keys and descriptors. |
| service | instrumentation | `apps/web/instrumentation.ts` | Boot: platform keys, error client, trace export. |
| service | sentry-shared | `apps/web/lib/sentry-shared.ts` | DSN and release resolution. |
| config | otel-config | `apps/web/lib/observability/otel-config.ts` | Trace export environment names. |
| service | flag-store | `apps/web/lib/feature-flags/flag-store.ts` | Definitions and overrides with cache. |
| table | feature_flag_definitions / feature_flags | `apps/web/db/neon/0211_feature_flag_targeting.sql` | Stored flags. |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Entitlement bundle, flags, kill switches. |
| config | desktop release workflow | `.github/workflows/release-desktop-cloud.yml` | Sign and notarize macOS installers. |
| config | windows release workflow | `.github/workflows/build-windows-release.yml` | Windows signing. |
| config | mobile release workflow | `.github/workflows/release-mobile.yml` | Mobile build and store submission. |
| config | CI workflow | `.github/workflows/ci.yml` | Guards, lint, typecheck, tests, E2E. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person signs in on the hosted identity UI; session token returns to the app. | outside service | Provider.tsx:24-30; _layout.tsx:994 |
| Web proxy and API routes verify the session token through the identity port. | our servers | identity.ts:35-50; proxy.ts:30 |
| Client reads /api/me for plan, flags and capability handshake. | our servers | me/route.ts:197-340 |
| Checkout creates a payment-provider session; the person pays on the hosted page. | outside service | checkout/route.ts:496-501 |
| The provider sends a signed webhook; the server verifies, de-duplicates, then updates plan state. | our servers | stripe-webhook/route.ts:48-76; verify.ts:14-45 |
| A workspace key is wrapped or unwrapped by the customer's key service for sealing data. | outside service | kms-providers.ts:124-352 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account identity and session | Hosted identity provider; local profile rows in Neon | Provider is source of identity | Account erasure runs as a queued job (job-handlers.ts:290-300). |
| Billing state and webhook events | Neon (profiles, subscriptions, event idempotency) | Server only | billing retention cron exists (vercel.json enforce-billing-retention). |
| Wrapped workspace keys | organization_encryption_keys | Server only | Retired keys kept for decryption until rewrap (organization-encryption-keys.ts:100-170). |
| Flag definitions and overrides | feature_flag_definitions, feature_flags | Cached 30 seconds in the server process | Archived rather than deleted (flag-store.ts:30). |

**Models and providers.** None of these six services calls a model. Billing entitlements decide which models an account can reach (me/route.ts:197-240).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in needed for checkout, keys and /api/me. |
| Permissions | Keys: workspace console permissions admin.policy.view and admin.policy.manage; revoke is Primary Owner only (keys-access.ts:44-60). |
| Subscription | Customer-managed keys require the Enterprise controls capability (keys-access.ts:25-37). Checkout starts subscriptions; own plan names: unknown. |
| Limits and metering | Checkout and webhook rate limits (checkout/route.ts:184; verify.ts:12-16); KMS request timeout 10 seconds (kms-providers.ts:26-30). |
| Feature flags | STRIPE_CHECKOUT_ENABLED; feature flag kill switches and rollout rings (me/route.ts:236-300). |
| Model compatibility | not applicable to these services. |
| Provider restrictions | Identity: one provider through the port; payment: one provider; KMS: AWS, GCP, Azure. |
| Local mode | Local mode needs no payment (checkout/route.ts:178-181). Whether Local mode requires sign-in depends on each app: unknown from the files read. Keys, flags and monitoring are server features. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Checkout disabled or no secret | Validation error with 'not available yet' message. | checkout/route.ts:178-181 |
| Billing lookup fails | 503 'Billing details could not be verified. No checkout was created; please retry.' | checkout/route.ts:68-69,392-400 |
| Live subscription exists | Conflict refusal. | checkout/route.ts:485-492 |
| Bad webhook signature | 400 and audit entry. | verify.ts:40-45 |
| Provider credentials absent | Provider not built; resolving a key for it fails. | kms-providers.ts:13-14,353-370 |
| Key ring changed mid-request | Conflict asking to reload. | organization-encryption-keys.ts:130-140 |
| Flag store unreadable | Non-strict reads return no definitions; strict reads throw. | flag-store.ts:170-190 |
| Kill-switch read fails | Capabilities are reported as shipped, with an error log. | me/route.ts:256-262 |
| Accessibility | Key UI has a labelled spinner (WorkspaceEncryptionKey.tsx:377); wider accessibility not read. | WorkspaceEncryptionKey.tsx:377 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/checkout/route.test.ts`: Checkout route.
- `apps/web/app/api/stripe-webhook/lib/__tests__/route.test.ts`: Webhook route.
- `apps/web/app/api/stripe-webhook/lib/__tests__/delivery-guarantees.test.ts`: Webhook delivery guarantees.
- `apps/web/lib/crypto/kms-providers.test.ts`: KMS providers.
- `apps/web/lib/crypto/kms-providers.timeout.test.ts`: KMS request deadline.
- `apps/web/app/api/settings/organization/keys/__tests__/route.test.ts`: Keys route.
- `apps/web/lib/feature-flags/__tests__/flag-store-governance.test.ts`: Flag store.
- `apps/web/lib/feature-flags/__tests__/evaluate-flags.test.ts`: Flag evaluation.
- `apps/web/lib/feature-flags/__tests__/every-kill-switch.test.ts`: Kill switches.
- `apps/web/lib/identity/token.test.ts`: Identity token handling.
- apps/web/lib/identity/__tests__/browser-provider-routes.test.ts (not found) (not found): Which routes load the browser provider.

**Test scenarios**

- **Webhook signature**
  1. Post an event with a wrong signature to the webhook route.
  - Expected: 400 Invalid signature.
- **Webhook replay**
  1. Send the same valid event twice.
  - Expected: Second delivery does not change state again.
- **Checkout off**
  1. Set the gate to false.
  2. Call checkout as a signed-in user.
  - Expected: 'not available yet' error; no session.
- **Key without credentials**
  1. Attach an AWS key to an Enterprise workspace in an environment with no AWS credentials.
  - Expected: Provider unconfigured error; nothing is written.
- **Flag change**
  1. Change a flag definition.
  2. Wait past the cache time.
  3. Call /api/me.
  - Expected: New value appears in feature_flags.

**Where to look when it fails**

- Logs 'Stripe webhook signature verification failed', 'Webhook verified', 'Refusing checkout: another subscription checkout...'.
- Errors KmsRequestError and CmekProviderUnconfiguredError.
- Log '[feature-flags] definitions unreadable'.
- Config state metric component platform-keys and error-tracking (instrumentation.ts:80-120).
- Tables organization_encryption_keys, feature_flag_definitions, feature_flags.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Mobile and extension have no error-tracking client found.** Affects: Mobile, Chrome.. Evidence: apps/mobile and apps/extension package.json show no @sentry package; desktop has one (apps/desktop/package.json:93). Work needed: Decide if required and add.
- **Checkout ships disabled in the example environment.** Affects: Web purchasers where the gate is false.. Evidence: .env.example:232; checkout/route.ts:58-62. Work needed: Owner decision per environment.
- **Sign-in providers of CLI, VS Code and Chrome not read.** Affects: Those apps.. Evidence: not read. Work needed: Read and record.
- **No end-to-end verification record that a release is signed on every platform in this read.** Affects: Release engineers.. Evidence: workflow files only. Work needed: Run the release verification script and store its result.

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- plan:enterprise
- api:POST /api/checkout
- api:GET /api/me
- table:organization_encryption_keys
- table:feature_flag_definitions

## Unknown

- Whether CLI, VS Code and Chrome use the same identity provider.
- Whether CI has ever run a release end to end (no log read).
- Plan names that include each capability.
- Retention of error events in the observability platform.
- Windows and mobile signing outcomes (workflows read, runs not read).

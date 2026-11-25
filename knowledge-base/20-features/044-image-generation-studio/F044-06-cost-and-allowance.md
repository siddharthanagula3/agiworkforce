---
id: "F044-06"
type: "feature"
title: "Cost and allowance"
aliases: ["Generation-cost indication", "Remaining-generation allowance", "Image cost", "Image allowance", "Image quota", "Usage", "spend cap"]
area: "44 Image-generation studio"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.14", "S44.15"]
depends_on: ["F044-01", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-model-catalog-and-routing", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "plan:premium"]
basis: "code inspection"
second_reader: "4 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-06 Cost and allowance

Not shown to users. The server reserves an estimated cost before each image, settles it after, and a workspace spend cap can refuse the request. The monthly image quota is null on the Pro, Max and Enterprise plan entries and unset on Free. No app shows an image price or a count of images left; only refusal messages point to Usage.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.14](../../10-requirements/capabilities/044-image-generation-studio.md#s4414), [S44.15](../../10-requirements/capabilities/044-image-generation-studio.md#s4415).

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

**What it does.** Would show what an image costs and how many generations remain. Today the server meters usage and enforces limits, and the apps show only the refusal text when a limit is hit. (apps/web/app/api/media/image/lib/managed-image-generation.ts:703-756; apps/mobile/src/features/chat/actions/mediaGenerationError.ts:7-8)

**Why it exists.** Inference cost is a first-class design constraint and image generation is expensive (rate limit comment: expensive operation) (doc: AGENTS.md section 7; apps/web/lib/rate-limit.ts:384-388). Users would expect to know what a generation uses. The brief marks both items not applicable on every app. (brief S44.14, S44.15)

**Who uses it.** Would be: paying users watching spend; workspace admins using spend caps.

**Problems it solves**

- Surprise charges or blocked requests.
- Knowing when a limit will reset.

**Use cases**

- See 'about 1 credit' before sending (not built).
- See '8 images left today' for a free offer (not built).
- Hit a spend cap and be told to see Usage (built as an error).

## 2. User experience

**Where to find it**

- No cost or remaining count in image mode on Web, Desktop, Mobile or CLI (ChatComposerNew.tsx:6254-6460; AddToChatSheet.tsx:1003-1046; apps/cli/src/cloud/image.rs:236-258).
- When a limit is hit: Mobile shows "You've reached your plan's usage limit for now. See Usage in Settings for when it resets." (apps/mobile/src/features/chat/actions/mediaGenerationError.ts:7-8). Web maps quota error codes to a 'view_usage' recovery action (apps/web/lib/hooks/useMediaGeneration.ts:208) and maps upgrade, subscribe and manage_billing recovery actions (useMediaGeneration.ts:124-131). top_up is a declared action type but nothing in this mapping returns it, and a 402 with no recognised code falls back to 'upgrade' (useMediaGeneration.ts:121-131,205-210).

**Before you start**

- Not applicable: no control exists.

**Screens and controls**

- None for cost or allowance. The free image offer is decided internally from a catalogue that carries remainingToday, but no display of it was found (apps/mobile/src/features/model-picker/freeQuotaCatalogue.ts:186-196).

**Journey**

1. 1. Person sends an image request.
2. 2. If the plan, spend cap or provider quota refuses, a message appears.
3. 3. Otherwise the image is made and nothing about cost or remaining count is shown.

**What the person sees and gets**

- Refusal errors: 403 plan_upgrade_required, 403 subscription_required, 402 or 429 insufficient_quota, spend-limit refusal from the compute gate (managed-image-generation.ts:118-132,159-170,196-211; route.ts:86-89).
- CLI prints a summary of model, provider and settings but no cost (apps/cli/src/cloud/image.rs:236-258).

**Settings**

- Workspace spend cap is set elsewhere (managed-compute-gate); not part of image mode.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Spend cap is checked before any reservation (apps/web/app/api/media/image/generate/route.ts:86-89).
- Cost is estimated per provider, quality and count, converted to a charge, and reserved with a lease that outlives all job attempts (image-generation-provider.ts:344-375; managed-image-generation.ts:703-756).
- Failed, cancelled and unsaved images release the reservation at zero charge to the account. For unsaved output the provider cost is still recorded as an undelivered cost in the ledger (recordUndeliveredImageCost, actualCostCents, taskOutcome 'undelivered') (image-job-executor.ts:111-135,137-160,783-799; media-image-generate.test.ts:1048,2014-2084).
- Web and Mobile map quota refusals to messages and recovery actions; Web maps upgrade, subscribe, manage_billing and view_usage, and top_up is declared but never returned (useMediaGeneration.ts:121-131,205-210; runImageGenerationTurn.ts:362-366).
- Rate limit 10 requests per minute, fail closed (apps/web/lib/rate-limit.ts:384-388).

**Incomplete**

- Monthly image quota field imageQuotaPerMonth is null on the Pro, Max and Enterprise plan entries (packages/contracts/types/src/model-catalog.ts:1292,1338,1389); the Free entry (line 1234) does not set it, and the field is optional (lines 1103-1104). So no per-plan image count is applied from it. An imageSyntheticTokenCost of 50,000 is defined (model-catalog.ts:1293) but has no consumer outside the type, these entries and tier-policies.test.ts:123, so it is not used in any runtime path.
- The mobile response type has a cost_estimate field that the route never sets (apps/mobile/src/features/image/services/imagegen.ts:25; apps/web/app/api/media/image/lib/managed-image-generation.ts:949-969).

**Present but disconnected or switched off**

- Limited free media offers carry a daily count (up to 10 images per UTC day, per docs) that decides whether an offer is shown, but the count itself is not shown (doc: docs/product/definition.md:342-347; freeQuotaCatalogue.ts:186-196).

**Not available**

- Cost indication before or after generating: Web, Desktop, Mobile, CLI, Chrome.
- Remaining-allowance display: Web, Desktop, Mobile, CLI, Chrome.

## 4. Required behaviour

**Established requirements**

- Before or after generating, the user sees what the image costs (credits or money). (source: S44.14 (brief; status not applicable on every app))
- User sees how many image generations remain in their allowance before hitting a limit. (source: S44.15 (brief; status not applicable on every app))
- Unknown availability preserves the draft and asks for retry, not Upgrade; free limited media is capped at 10 images per user per UTC day when inventory permits. (source: doc: docs/product/definition.md:342-347)
- Every subscription capability connects to one AGI Subscription system covering entitlements, usage accounting, quotas and limits. (source: task context (established requirement))

**Acceptance criteria**

1. A request refused for plan returns 403 plan_upgrade_required with current_plan and required_plans.
2. A request refused by the workspace spend cap is refused before any usage is reserved.
3. A refused or failed image leaves usage settled at zero charge for the account.
4. Today: no cost or remaining count is shown in image mode on any app.
5. If a display is added: it must come from the same subscription and usage source as the Usage screen, never a copy of plan numbers in the client (AGENTS.md section 4).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'not applicable' likely records that no allowance exists to display (imageQuotaPerMonth is null on Pro, Max and Enterprise and unset on Free) [inferred from model-catalog.ts:1234,1292]; it may not mean the feature is out of scope.
- Cost display must obey any product policy for Free users; none was found in the project docs I read [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Return the settled charge in the generate and status responses and show it on the image card and in the CLI summary.
- [proposed] Show remaining free offers only if the product decision allows meters on the Free plan.
- [proposed] Link the refusal message directly to the Usage screen on Web and Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | buildSpendLimitGateResponse | `apps/web/lib/managed-compute-gate.ts` | Workspace spend cap checked at route.ts:88-89. |
| endpoint | POST /api/media/image/generate (cost gates) | `apps/web/app/api/media/image/generate/route.ts` | Rate limit, then CSRF validation and adult-eligibility age gate (buildAdultEligibilityGateResponse, gate 'media-image') (lines 34-52), managed gate, org policy, spend gate (lines 39-89). |
| service | estimateImageCostMicrousd | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Per-provider cost estimate by count and quality (lines 344-375). |
| service | reserveManagedUsageRequest | `apps/web/lib/services/managed-usage-request-service.ts` | Atomic reservation against plan limits (line 738); called at managed-image-generation.ts:745. Throws ManagedUsageRequestError, mapped by managedUsageErrorResponse (managed-image-generation.ts:118-132). |
| table | managed_usage_requests | `apps/web/lib/services/managed-usage-request-service.ts` | Reservation and settlement rows. |
| job | settleFailure and completion settlement | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Release or finalize the reservation (lines 137-232,812-830); recordUndeliveredImageCost books provider cost for undelivered output (lines 111-135,783-799). |
| service | evaluateManagedComputeSubscriptionAccess | `apps/web/lib/services/managed-compute-access.ts` | Subscription state check (called at managed-image-generation.ts:174). |
| config | BILLING_PLAN_CAPABILITY_TIERS | `packages/contracts/types/src/billing-catalog.ts` | Which plans include image_generation: PRO_TIERS (line 341), set at line 356. |
| config | Plan entries imageQuotaPerMonth | `packages/contracts/types/src/model-catalog.ts` | Null monthly quota on Pro, Max and Enterprise (lines 1292,1338,1389); unset on Free (line 1234). |
| config | image-generation rate limit | `apps/web/lib/rate-limit.ts` | 10 per minute, fail closed (lines 384-388). |
| hook | media paywall mapping | `apps/web/lib/hooks/useMediaGeneration.ts` | Quota error to recovery action, retry-after cap (lines 121-131,135,205-210). |
| service | mediaGenerationError (Mobile) | `apps/mobile/src/features/chat/actions/mediaGenerationError.ts` | Usage-limit message (lines 7-8). |
| service | freeQuotaCatalogue (Mobile) | `apps/mobile/src/features/model-picker/freeQuotaCatalogue.ts` | Free media offer with remainingToday, not displayed (lines 160-196). |
| endpoint | GET /api/models/free-quota | `apps/web/app/api/models/free-quota/route.ts` | Publishes limited free media admission (line 67). |
| service | CLI image summary | `apps/cli/src/cloud/image.rs` | Prints model and settings, no cost (lines 236-258). |
| service | imagegen.ts ImageGenResponse | `apps/mobile/src/features/image/services/imagegen.ts` | Has an unused cost_estimate field (line 25). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The request passes CSRF validation, the adult-eligibility (18 and over) age gate and the rate limit, then the managed compute gate, organization policy and the workspace spend cap check. | our servers | route.ts:34-89 |
| The server estimates cost and reserves it atomically against the plan. A 402 or 429 raised by reserveManagedUsageRequest is mapped to insufficient_quota (managedUsageErrorResponse, lines 118-132); only a failure that is not a ManagedUsageRequestError becomes 503 billing_unavailable (757-766). | our servers | managed-image-generation.ts:118-132,703-767 |
| After the attempt, the reservation is finalized at the settled cost, or released at zero charge to the account for failure, refusal or cancel. For unsaved output the provider cost is recorded as undelivered cost. | our servers | image-job-executor.ts:111-160,812-830 |
| The client shows a refusal message only; no figure is returned to display. The client is the browser on Web and the app on Mobile and Desktop. | device | runImageGenerationTurn.ts:362-366; managed-image-generation.ts:949-969 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reservation and settlement rows (cost, plan tier, status, lease) | table managed_usage_requests (Neon Postgres) | Server held; the Usage screens read from the subscription system | Unknown |
| Undelivered-cost record for refused or unsaved output (provider cost as actualCostCents, taskOutcome 'undelivered') | Recorded by recordUndeliveredImageCost (image-job-executor.ts:111-135,734) | Server held | Unknown |

**Models and providers.** Estimate depends on the provider: openai uses a quality-based estimate per image; google uses the catalog per-image cost when present, else a fallback table (image-generation-provider.ts:344-375). Cost is therefore model-dependent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Clerk account (getClerkAuthUser); usage is accounted per user and workspace. CSRF validation and an 18-and-over adult-eligibility gate (buildAdultEligibilityGateResponse, gate 'media-image') run before the cost gates: the rate limit is applied first, then the age gate, then the managed compute gate, then org policy, then the spend cap. Reservation is keyed on userId, with the scoped organizationId and tenant check also used (route.ts:34-52; managed-image-generation.ts:719-731). |
| Permissions | Workspace spend cap and organization policy can refuse (route.ts:70-89). |
| Subscription | Image generation needs an active subscription (403 subscription_required) on pro, max, max_15x, team, team_premium or enterprise (image_generation: PRO_TIERS, billing-catalog.ts:341,356) and must pass evaluateManagedComputeSubscriptionAccess; other plans get 403 plan_upgrade_required with required_plans, so a Free account is refused by the managed route (managed-image-generation.ts:159-211). Limited free media is a separate offer (doc: docs/product/definition.md:342-347); how it reaches this route is not shown. |
| Limits and metering | Reservation before the job and settlement after; 10 requests per minute; monthly image quota null on the Pro, Max and Enterprise entries and unset on Free (model-catalog.ts:1234,1292,1338,1389); free offers up to 10 images per UTC day (doc: docs/product/definition.md:344). |
| Feature flags | none found in the code for cost display. |
| Model compatibility | Cost varies by model and provider; no model is excluded for cost reasons in the code opened. |
| Provider restrictions | Providers google and openai only (F044-01). |
| Local mode | Not applicable: image generation is not available in Local mode, so no metering applies on device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Spend cap reached | Refused before reservation by the compute gate. | route.ts:86-89 |
| Quota declined | 402 or 429 insufficient_quota (raised by reserveManagedUsageRequest, mapped by managedUsageErrorResponse); Mobile shows the usage-limit message; Web recovery action view_usage. | managed-image-generation.ts:118-132; runImageGenerationTurn.ts:362-366; useMediaGeneration.ts:208 |
| Billing store unavailable | 503 billing_unavailable, only for a failure that is not a ManagedUsageRequestError. | managed-image-generation.ts:757-766 |
| Failed, refused, cancelled or unsaved image | Not charged to the account. For unsaved output the provider cost is still recorded as an undelivered cost in the ledger. | media-image-generate.test.ts:1048,2014,2050; image-job-executor.ts:111-135,783-799 |
| Retry after failure | One durable job holds one reservation across its automatic attempts, so the account is not charged twice. The provider cost is incurred again per attempt, and undelivered attempts are recorded as undelivered cost. That a client-initiated retry reuses the reservation is not shown by the cited lines. | managed-image-generation.ts:742-745; image-job-executor.ts:109-110; apps/mobile/__tests__/imagegen-idempotency.test.ts:53 |
| Free account | Refused by the managed route (403 subscription_required or plan_upgrade_required) before any plan check; the page does not trace how the limited free image offer reaches this route. | managed-image-generation.ts:159-211 |
| Loading, offline, accessibility | not handled in the code (no cost or allowance display exists). | No cost or allowance UI found in ChatComposerNew.tsx, AddToChatSheet.tsx or apps/cli/src/cloud/image.rs |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-image-generate.test.ts`: Reservation lifecycle and settlement at provider cost, safe quota error on declined reservation, failure at zero cost, refused and unsaved images charged nothing (lines 988-1061,2014-2084).
- `apps/web/__tests__/api/media-image-cancel.test.ts`: Cancel settlement (names only).
- `apps/web/__tests__/api/media-image-retry.test.ts`: Retry on same reservation (names only).
- `apps/web/lib/free-quota-media-units.test.ts`: Free quota media units (name only).
- `packages/contracts/cloud-contracts/src/__tests__/free-media-availability.test.ts`: Free media availability logic (name only).
- `apps/mobile/__tests__/free-image-offer.test.ts`: Free image offer keeps the original prompt and does not reroute edits (lines 30,49).

**Test scenarios**

- **Quota refusal**
  1. Use an account whose reservation will be declined.
  2. Send an image request.
  - Expected: 402 or 429 insufficient_quota; Mobile shows the usage-limit message; no image.
- **Spend cap**
  1. Set a workspace spend cap already reached.
  2. Send an image request.
  - Expected: Refused before any reservation row is created.
- **Failure settles zero**
  1. Force the provider to fail.
  - Expected: managed_usage_requests row released with no charge.
- **No cost shown today**
  1. Generate an image on each app.
  - Expected: No cost or remaining count is displayed anywhere (current behaviour).
- **Rate limit**
  1. Send 11 image requests in a minute.
  - Expected: The 11th gets 429 from the rate limiter.

**Where to look when it fails**

- Table managed_usage_requests; event image_refund_settlement_unrecorded and image_completion_settlement_unrecorded (image-job-executor.ts:158,827).
- Error codes insufficient_quota, plan_upgrade_required, subscription_required, billing_unavailable.
- Header named by MEDIA_DIAGNOSTIC_HEADER for tracing.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No cost indication on any app.** Affects: Web, Desktop, Mobile, CLI, Chrome. Evidence: brief S44.14; managed-image-generation.ts:949-969 returns no cost. Work needed: Decide policy, return settled cost, display it, test it.
- **No remaining-allowance display; image monthly quota is null on Pro, Max and Enterprise and unset on Free.** Affects: All apps. Evidence: model-catalog.ts:1234,1292,1338,1389; brief S44.15. Work needed: Define whether an image allowance exists in the subscription system, then display it.
- **Mobile type declares cost_estimate that the server never returns.** Affects: Mobile. Evidence: imagegen.ts:25 vs managed-image-generation.ts:949-969. Work needed: Remove the field or populate it.
- **Brief marks S44.14 and S44.15 'not applicable' while the Should lines describe user-facing needs.** Affects: Planning. Evidence: brief S44.14, S44.15. Work needed: Owner to confirm the intended status.

**Depends on**

- F044-01
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-model-catalog-and-routing
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- plan:premium

## Unknown

- Whether a Usage screen lists image generations, and how.
- Whether the product allows meters for Free users; not established from project docs I read.
- Exact retention of usage rows.
- Which price the account is actually charged for an image: only the estimate path was read.
- How the limited free image offer reaches the managed image route, which refuses Free accounts (managed-image-generation.ts:159-211).

## Second reader's check

A second reader checked 11 statements of this page against the code: 4 correct, 7 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Failure, refusal, cancel and unsaved images release or settle at zero charge" The code shows: The account is released. Failure and cancel go through settleFailure with actualCostMicrousd 0 (image-job-executor.ts:137-160). An unsaved image calls recordUndeliveredImageCost, which records the real provider cost as actualCostCents in the cost ledger with taskOutcome 'undelivered' (image-job-executor.ts:111-135, 783-799). The user is not charged, but the platform books a provider cost. (apps/web/app/api/media/image/lib/image-job-executor.ts:111-135,137-160,783-799). **Corrected:** Failed, cancelled and unsaved images release the reservation at zero charge to the account. For unsaved output the provider cost is still recorded as an undelivered cost in the ledger.
- **Partly wrong (section 3):** "imageQuotaPerMonth is null on the three plan entries inspected" The code shows: The null values are at model-catalog.ts:1292, 1338 and 1389 (the pro, max and enterprise entries). The free entry (line 1234) has no image fields at all, so the field is unset there rather than null. The field is optional (line 1103). imageSyntheticTokenCost is referenced only in the type, these three entries and tier-policies.test.ts:123, so it is not used in any runtime path. (packages/contracts/types/src/model-catalog.ts:1103-1104,1234,1292-1293,1338,1389; packages/contracts/types/src/__tests__/tier-policies.test.ts:123). **Corrected:** Pro, Max and Enterprise set imageQuotaPerMonth to null, and Free does not set it. imageSyntheticTokenCost (50,000) has no consumer outside a test. Section 7 should not say 'null on every plan'.
- **Partly wrong (section 6):** "A refusal returns 402 or 429 insufficient_quota, or 503 billing_unavailable (managed-image-generation.ts:118-132,703-767). The Runs-on column says the client refusal message is shown on 'device'." The code shows: The citation 118-132 is not the quota refusal. Lines 118-132 hold managedUsageErrorResponse, which maps status 402 or 429 to type 'insufficient_quota' and anything else to 'invalid_request_error'. The 503 billing_unavailable fallback is at 757-766. The 402/429 status comes from ManagedUsageRequestError thrown by reserveManagedUsageRequest, and the page does not trace that. The 403 subscription_required, subscription gate and plan_upgrade_required checks sit at about lines 159-211. Also the 'device' row covers Web, which is a browser client. (apps/web/app/api/media/image/lib/managed-image-generation.ts:118-132,159-211,757-766). **Corrected:** The 402 or 429 is raised by reserveManagedUsageRequest and mapped by managedUsageErrorResponse (118-132). Only a failure that is not a ManagedUsageRequestError becomes 503 billing_unavailable (757-766). Repoint the line citations.
- **Partly wrong (section 7):** "Image generation is a plan capability (Premium and above) (billing-catalog.ts:356)" The code shows: billing-catalog.ts:356 sets image_generation: PRO_TIERS. PRO_TIERS (line 341) is pro, max, max_15x, team, team_premium and enterprise, so it includes the team tiers. The route also needs an active subscription (403 subscription_required) and passes evaluateManagedComputeSubscriptionAccess (managed-image-generation.ts:159-211). The page does not mention that Free users are refused by the managed route. (packages/contracts/types/src/billing-catalog.ts:341,356; managed-image-generation.ts:159-211). **Corrected:** Image generation needs an active subscription on pro, max, max_15x, team, team_premium or enterprise. Other plans get 403 plan_upgrade_required with required_plans.
- **Partly wrong (section 7):** "Account: signed-in account; usage accounted per user and workspace" The code shows: The route needs a Clerk user (getClerkAuthUser), CSRF validation and an adult-eligibility age gate (buildAdultEligibilityGateResponse, gate 'media-image') before any cost gate. Reservation is keyed on userId, and the scoped organizationId and tenant check are also used. The page lists none of the CSRF or age-gate rules. (apps/web/app/api/media/image/generate/route.ts:34-52; managed-image-generation.ts:719-731). **Corrected:** Add that CSRF validation and an 18-and-over eligibility gate run before the rate limit result is used. The rate limit is applied first, then the age gate, then the managed compute gate, then org policy, then the spend cap.
- **Partly wrong (section 8):** "Retry after failure reuses the same reservation, so no double charge (managed-image-generation.ts:742-744)" The code shows: Lines 742-744 are only a comment: the durable job holds one reservation across every attempt, so the lease must outlive the schedule. That supports reuse within one job (the job-level retry in image-job-executor). It does not show that a client-initiated retry reuses the reservation. recordUndeliveredImageCost says 'a retry pays the provider again' (image-job-executor.ts:109-110), so the provider is charged per attempt even though the account is not. (managed-image-generation.ts:742-745; image-job-executor.ts:109-110). **Corrected:** One durable job holds one reservation across its automatic attempts, so the account is not charged twice. The provider cost is incurred again per attempt, and undelivered attempts are recorded as undelivered cost.
- **Partly wrong (section 2/8):** "Web maps quota error codes to a 'view_usage' recovery action (useMediaGeneration.ts:208) and lists upgrade, subscribe, manage billing, top up (124-131)" The code shows: Lines 124-131 hold the type MediaPaywallRecoveryAction and the PAYWALL_ERROR_RECOVERY map: insufficient_credits to upgrade, plan_upgrade_required to upgrade, subscription_required to subscribe, subscription_inactive to manage_billing. top_up appears only in the type, in no map entry. view_usage is returned at line 208 via classifyManagedQuotaErrorCode. A bare status 402 also maps to 'upgrade' (about line 210). (apps/web/lib/hooks/useMediaGeneration.ts:121-131,205-210). **Corrected:** top_up is a declared action but nothing in this mapping returns it. A 402 with no recognised code falls back to 'upgrade'.

**Facts the page missed**

- The image route runs an adult-eligibility (age) gate and CSRF validation before the cost gates, and the page's rules table omits both (apps/web/app/api/media/image/generate/route.ts:34-52).
- Provider cost is recorded for undelivered images and charged again per attempt, even though the account is released (apps/web/app/api/media/image/lib/image-job-executor.ts:109-135,783-799).
- The managed route needs an active subscription (403 subscription_required) and passes evaluateManagedComputeSubscriptionAccess before any plan check, so a Free account is refused here. The page does not say how the limited free image offer reaches this route (apps/web/app/api/media/image/lib/managed-image-generation.ts:159-211).

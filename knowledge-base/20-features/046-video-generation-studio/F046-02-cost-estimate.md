---
id: "F046-02"
type: "feature"
title: "Cost estimate"
aliases: ["Video cost note", "About (amount) note", "video-cost-estimate", "Estimated or actual credit use (S46.27)", "estimateVideoCredits"]
area: "46 Video-generation studio"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:max_15x", "plan:enterprise", "file:apps/web/features/chat/components/Composer/VideoCostEstimate.tsx", "file:apps/web/lib/billing/credit-estimates.ts", "file:packages/contracts/types/src/model-catalog.ts", "table:video_generation_jobs", "api:POST /api/media/video/generate", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "F046-01", "F046-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-02 Cost estimate

Before sending a video, the web composer shows 'About <credits>' next to the controls, computed from the model catalog price for the chosen model, shape and length, and turns warning-coloured when it exceeds the credits available. The server computes and reserves the real cost. Mobile has an equivalent line but is off in v1. Chrome shows nothing.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.27](../../10-requirements/capabilities/046-video-generation-studio.md#s4627).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a rough credit cost for the clip before the person presses send, and warns when it is more than the credits they can spend now. The server independently computes the cost from the same catalog and reserves it.

**Why it exists.** Video is expensive and metered by credits. The person should see the likely cost, and be told a failed video costs nothing, before committing.

**Who uses it.** Paid-plan users choosing video options on web (and the public desktop), and mobile users when video is released.

**Problems it solves**

- Surprise cost after sending.
- Sending a clip the account cannot cover.
- Uncertainty about whether a failure is charged.

**Use cases**

- Compare the cost of 5 s at 720p with 10 s at 1080p by changing the menus.
- See the warning when available credits are lower than the estimate.
- Read on hover that the final cost settles on delivery.

## 2. User experience

**Where to find it**

- Web composer in video mode, at the right of the aspect, quality and length menus: a small note reading 'About <amount>' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6704-6712; VideoCostEstimate.tsx:46-48).
- Mobile add-to-chat sheet under the video menus: 'About <amount> for a <n>-second clip; a failed video costs nothing.' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1150-1164), unreachable while FEATURES.videoGen is false.
- Chrome and CLI and VS Code: none.

**Before you start**

- Video mode on with a paid (non-promotional) model selected: the note is not rendered for a promotional model (ChatComposerNew.tsx:6704).
- Web: usage summary loaded for the over-balance check; without it the note still shows but never warns (VideoCostEstimate.tsx:27-28).

**Screens and controls**

- Small text note with role='note', data-testid video-cost-estimate, title and aria-label carrying the full sentence (VideoCostEstimate.tsx:34-44).
- Warning colour class text-warning-text when the estimate exceeds spendable credits, otherwise muted (VideoCostEstimate.tsx:42).

**Journey**

1. 1. Enter video mode and pick model, aspect, quality and length.
2. 2. The note updates immediately from the catalog price.
3. 3. Hover or focus the note to read the full sentence.
4. 4. If it is more than available credits, read the warning sentence before deciding to send.
5. 5. Send; the server re-computes and reserves the cost (route.ts:1223-1237, 1442-1453).

**What the person sees and gets**

- Normal: 'About X' with full text 'This video is estimated at X. The final cost settles when it is delivered, and a failed video costs nothing.' (VideoCostEstimate.tsx:31-33).
- Over balance: 'This video is estimated at X, more than the Y you have available right now.' (VideoCostEstimate.tsx:29-30).
- If the catalog has no price for the combination the note is absent (VideoCostEstimate.tsx:25).
- If credits are short at send, the server returns a quota error (402 or 429 mapped to insufficient_quota) (route.ts:324-334).

**Settings**

- None specific. Credit amounts follow the plan and the credit conversion (chargeCreditsForMicrousd).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: VideoCostEstimate is rendered in video mode and uses estimateVideoCredits(model, resolution, aspect, duration) with the shared catalog pricing (VideoCostEstimate.tsx:24; apps/web/lib/billing/credit-estimates.ts:93-108; packages/contracts/types/src/model-catalog.ts:2519-2580).
- Spendable credits are computed as the tightest plan window plus bonus plus purchased credits (apps/web/lib/hooks/useManagedUsageSummary.ts:163-172).
- Server cost: from the model's pricing formula or per-second price; a resolution with no published price is refused with video_resolution_unpriced (route.ts:485-521).
- Server checks the monthly video-seconds allowance before any job exists (route.ts:1238-1256) and reserves the estimate (route.ts:1442-1453).
- A failure before the provider starts settles the reservation at 0 (route.ts:1497-1529).

**Incomplete**

- Mobile shows the line but does not compare it with the balance (AddToChatSheet.tsx:1150-1164).
- The client estimate assumes audio whenever the model supports it (credit-estimates.ts:106) and ignores candidate count n; the server uses the requested audio flag (route.ts:1207-1208).
- Brief S46.27 says estimated 'or actual' cost; no screen showing the actual cost after delivery was found.

**Present but disconnected or switched off**

- Mobile: built, hidden by FEATURES.videoGen=false (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Chrome side panel shows no estimate (apps/extension/src/side_panel.ts has no cost note for video turns).
- CLI and VS Code: no video.

## 4. Required behaviour

**Established requirements**

- The user sees the estimated or actual credit cost of a video before or after generating. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.27)
- A failed video costs nothing and the final cost settles on delivery. (source: apps/web/features/chat/components/Composer/VideoCostEstimate.tsx:32-33; apps/web/app/api/media/video/cancel/route.ts:57)
- Pricing and plan inclusion come from the shared catalog, never from hardcoded values in a consumer. (source: doc: AGENTS.md section 4)
- Inference cost is a first-class design constraint and is shown honestly. (source: doc: AGENTS.md section 7)

**Acceptance criteria**

1. Changing resolution or length on web changes the 'About' amount; changing to a model without a price removes the note.
2. With available credits lower than the estimate, the note has the warning colour and its aria-label contains 'more than'.
3. With the usage summary not loaded the note still shows and has no warning.
4. The note is absent when a promotional (free offer) model is selected.
5. A request for a resolution with no published price returns code video_resolution_unpriced and creates no job.
6. A video that fails before delivery leaves no net charge (reservation settled at 0 or released).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The client estimate and the server reservation should agree for the same inputs because both read the catalog; the credit conversion between catalog cents and credits was not traced.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a unit test for VideoCostEstimate (none exists).
- [proposed] Show the same over-balance warning on mobile and the actual settled cost after delivery.
- [proposed] Include audio choice and candidate count in the estimate if they become selectable.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VideoCostEstimate | `apps/web/features/chat/components/Composer/VideoCostEstimate.tsx` | Renders the note and the over-balance warning (16-49). |
| component | ChatComposerNew mount point | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Mounts the note after the menus (6704-6712). |
| service | estimateVideoCredits | `apps/web/lib/billing/credit-estimates.ts` | Converts catalog video cost to credits (93-108). |
| hook | useManagedUsageSummary / spendableCreditsNow | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Loads the usage summary and computes spendable credits (126-172). |
| service | videoGenerationCostMicrousd | `packages/contracts/types/src/model-catalog.ts` | Shared cost function (2566-2580) and calculateCatalogVideoCostCents (2519-2563). |
| service | getVideoCostCents (server) | `apps/web/app/api/media/video/generate/route.ts` | Server cost and unpriced-resolution refusal (485-521). |
| service | assertTierUnitAllowance (video_seconds) | `apps/web/lib/services/tier-unit-quota-service.ts` | Monthly video-seconds allowance (57, 96-103, 165-168). |
| service | reserveManagedUsageRequest / finalizeManagedUsageRequest | `apps/web/lib/services/managed-usage-request-service.ts` | Credit reservation and settlement (used at route.ts:1442, 1499). |
| screen | Mobile estimate line | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Computes (303-327) and renders (1150-1164) the estimate. |
| table | video_generation_jobs.estimated_cost_cents | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Stores the estimated cost per job (103). |
| service | video-job-reconciliation-service | `apps/web/lib/services/video-job-reconciliation-service.ts` | Settles the cost on delivery or failure. |
| test | video-resolution-pricing test | `packages/contracts/types/src/__tests__/video-resolution-pricing.test.ts` | Pricing coverage. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer computes the credit estimate from the bundled catalog for the shown model, resolution, aspect and duration. | device | VideoCostEstimate.tsx:24; credit-estimates.ts:93-108 |
| The composer compares it with spendable credits from the usage summary, which it fetches from the server. | device and our servers | useManagedUsageSummary.ts:126-172; VideoCostEstimate.tsx:23-28 |
| On send the server recomputes the cost in cents, checks the monthly seconds allowance and reserves credits. | our servers | route.ts:1223-1256, 1442-1453 |
| On delivery the reconciler settles the reservation; on failure it releases it. | our servers | video-job-reconciliation-service.ts (finishFailed at 497-503); video-generation-jobs.ts:936 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Estimated cost in cents on the job | video_generation_jobs.estimated_cost_cents | Server-side | With the job row; retention not read. Cost is whole cents only (audit/registers/known-flaws.md row BILLING-VIDEO-COST-CENTS-ONLY-01). |
| Credit reservation and settlement | managed usage ledger | Server-side | Not read. |

**Models and providers.** Prices come from the model catalog entry (videoGeneration.pricing formula or per-second price); no provider call is made to estimate.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the usage summary is account-scoped. |
| Permissions | Estimate display has no separate permission. Sending is gated as in F046-01. |
| Subscription | Video is Ultra and Enterprise only (billing-catalog.ts:357). The note is not shown for a promotional free-offer model. |
| Limits and metering | Credits (estimate and reservation), monthly video-seconds allowance, one-admission-at-a-time lock (route.ts:1238-1256, 1412-1432). |
| Feature flags | Mobile FEATURES.videoGen=false hides the mobile line. |
| Model compatibility | No note when the catalog has no price for the model and tuple (VideoCostEstimate.tsx:25). |
| Provider restrictions | Runway withheld, so a Runway price is never reserved (video-provider-release-policy.ts:17). |
| Local mode | No video and no estimate in Local mode (mobile blocks it before the sheet is used: resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No price for the combination | Note not shown on web; server refuses an unpriced resolution with 400 video_resolution_unpriced or 503 'Pricing is not configured for <model>'. | VideoCostEstimate.tsx:25; route.ts:500-520 |
| Usage summary not loaded or errored | Note shows without warning (available is null). | VideoCostEstimate.tsx:27-28; useManagedUsageSummary.ts:163-165 |
| Estimate above balance | Warning colour and sentence; send is not blocked on the client; the server decides. | VideoCostEstimate.tsx:28-30, 42 |
| Small amounts | One decimal under 10 credits, none otherwise. | VideoCostEstimate.tsx:29 |
| Allowance used up | Server error video_seconds_monthly_limit_reached with message that the monthly video allowance is used up. | tier-unit-quota-service.ts:165-168; route.ts:1238-1256 |
| Accessibility | role='note' and the full sentence in aria-label; keyboard focus on a non-interactive span is not provided, so 'focus' reading depends on screen-reader browse mode [inferred]. | VideoCostEstimate.tsx:34-44 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/video-resolution-pricing.test.ts`: Every resolution the model offers is priced; flat rate not above per-resolution rates.
- `packages/contracts/types/src/__tests__/video-generation-catalog.test.ts`: Per-tuple pricing from exact pixel dimensions and no collapsing of aspect ratios.
- `apps/web/__tests__/api/media-video-generate.test.ts`: Route reserves the catalog formula cost for an OpenRouter tuple (line 557).
- `apps/web/lib/billing/plan-credits.test.ts`: Plan credit maths (file exists; video relevance not read).

**Test scenarios**

- **Estimate follows controls**
  1. Web, video mode, a priced model.
  2. Change length from the shortest to the longest option.
  3. Read the note.
  - Expected: The amount grows with length; hovering shows the full sentence.
- **Over-balance warning**
  1. Use an account with few spendable credits.
  2. Pick the longest, highest-quality option.
  - Expected: Warning colour and 'more than the ... you have available right now' in the aria-label.
- **Failed video is free**
  1. Start a video that fails at the provider.
  2. Check the usage ledger and the job row.
  - Expected: Reservation released or settled at 0; no net charge.
- **Server vs client agreement**
  1. Record the note amount.
  2. Send and read the reserved estimate (estimated_cost_cents on the job).
  - Expected: Amounts agree after the cents-to-credits conversion; record any difference.
- **Mobile line**
  1. Build mobile with the flag on in a test build.
  2. Open the sheet in video mode.
  - Expected: Line appears with the clip length; no over-balance warning (known gap).

**Where to look when it fails**

- Error codes video_resolution_unpriced, video_seconds_monthly_limit_reached, insufficient_quota.
- Log 'Pre-job video settlement could not be recorded' and 'Video settlement alert...' for settlement problems (route.ts:1524-1526).
- Tables video_generation_jobs (estimated_cost_cents) and the managed usage ledger.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/046-video-generation-studio.md](../../70-qa/test-plans/mobile/046-video-generation-studio.md)

## 10. Gaps and dependencies

- **No test covers VideoCostEstimate or the mobile estimate line.** Affects: Web, mobile. Evidence: Search of test folders for video-cost-estimate and estimateVideoCredits found no test. Work needed: Add component tests for normal, over-balance, no-price and no-usage cases.
- **Mobile does not warn when the estimate exceeds spendable credits.** Affects: Mobile (when released). Evidence: AddToChatSheet.tsx:1150-1164. Work needed: Reuse the spendable-credits comparison.
- **No place shows the actual settled cost after delivery, though the brief says 'estimated or actual'.** Affects: Web, mobile. Evidence: Searched composer, message bubble and library; none found. Work needed: Decide whether to show the actual cost in the clip details.
- **Chrome sends a video with no estimate.** Affects: Chrome. Evidence: videoGenerationClient.ts:126; no cost note in side_panel.ts video path. Work needed: Add the note or a fixed disclosure.
- **The estimate ignores the candidate count n and assumes audio.** Affects: Web. Evidence: credit-estimates.ts:93-108; route.ts:1044, 1207. Work needed: Align with whatever options become selectable.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:max_15x
- plan:enterprise
- file:apps/web/features/chat/components/Composer/VideoCostEstimate.tsx
- file:apps/web/lib/billing/credit-estimates.ts
- file:packages/contracts/types/src/model-catalog.ts
- table:video_generation_jobs
- api:POST /api/media/video/generate
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- F046-01
- F046-03

## Unknown

- How catalog cents convert to the credits the person sees (chargeCreditsForMicrousd) and whether it equals what is reserved.
- Whether any other screen shows the actual cost.
- Retention of settlement records.
- Whether the limited free video offer path shows any cost note.

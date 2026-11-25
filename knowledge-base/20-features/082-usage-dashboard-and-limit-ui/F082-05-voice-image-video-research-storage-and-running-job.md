---
id: "F082-05"
type: "feature"
title: "Voice, image, video, research, storage and running jobs"
aliases: ["This month", "Allowances", "Monthly allowances", "File storage", "Responses running now", "Voice minutes", "Image count", "Video seconds", "Computer use", "S82.06", "S82.07", "S82.08", "S82.09", "S82.11", "S82.12"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S82.06", "S82.07", "S82.08", "S82.09", "S82.11", "S82.12"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-observability-and-operations", "api:GET /api/usage/limits", "table:managed_usage_requests", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:free", "F082-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-05 Voice, image, video, research, storage and running jobs

Shows usage of the non-text allowances: voice minutes, images, video seconds and computer-use requests under 'This month', plus how many responses run now, and file storage. Web and mobile show the monthly card and running count. Only mobile shows a storage card. Research appears in the history. CLI, VS Code and Chrome show none of this.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.06](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8206), [S82.07](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8207), [S82.08](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8208), [S82.09](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8209), [S82.11](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8211), [S82.12](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8212).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** GET /api/usage/limits returns the plan, period reset, metered units, monthly image usage, running response count and file storage in one reply (apps/web/app/api/usage/limits/route.ts:85-101). Web and mobile render parts of it.

**Why it exists.** Voice, image and video draw on separate allowances and storage has its own cap. A person needs to see them to avoid a refusal. The brief requires voice, image, video, research, storage and active job count (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.06 to S82.09, S82.11, S82.12).

**Who uses it.** Paid subscribers who use voice, image or video generation, upload files, or run several responses at once.

**Problems it solves**

- Refusals that came with no warning.
- Not knowing why a new response is queued: 'Responses running now' shows the concurrency ceiling.
- Upload failures when storage is full.

**Use cases**

- A user reads 'Voice 12 of 60 minutes' under 'This month' (format at apps/web/features/settings/sections/UsageSection.tsx:763-784).
- A user reads 'Responses running now 2 of 3 at a time' (apps/web/features/settings/sections/UsageSection.tsx:815-825).
- A mobile user reads 'File storage' with a meter (apps/mobile/src/features/settings/cloud-usage/index.tsx:577-603).
- A user reads 'About N minutes of voice left at today's price' (apps/web/features/settings/sections/UsageSection.tsx:786-812).

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Settings, Usage. The card 'This month' (units and images) and the rows 'Voice' estimate and 'Responses running now' inside 'Plan usage limits' (apps/web/features/settings/sections/UsageSection.tsx:839-844, 1405-1409). There is no storage card on the web Usage page; project storage is on the knowledge files panel (apps/web/features/projects/components/KnowledgeFilesPanel.tsx).
- Mobile: Settings, Usage. Cards 'This month', 'File storage' and the row 'Responses running now' (apps/mobile/src/features/settings/cloud-usage/index.tsx:522-603).
- CLI, VS Code, Chrome: none.

**Before you start**

- Paid non-contract plan, Cloud mode. Web requests the limits only for those accounts (apps/web/features/settings/sections/UsageSection.tsx:1227-1231). Mobile requests them for a non-Free signed-in Cloud account (apps/mobile/src/features/settings/cloud-usage/index.tsx:910-917).

**Screens and controls**

- Rows with labels 'Voice', 'Video', 'Computer use', 'Images' and a bar when a monthly cap exists, else '<n> <unit>, no monthly cap' (apps/web/features/settings/sections/UsageSection.tsx:763-784, 855-863).
- Retry link when this month's read fails (apps/web/features/settings/sections/UsageSection.tsx:848).

**Journey**

1. Open Usage as a paid user.
2. The page requests /api/usage/limits in addition to the summary.
3. Read 'This month' with its reset date.
4. Read the running-response row and the voice estimate in the plan card.
5. On mobile, scroll to 'File storage' and read used and limit.

**What the person sees and gets**

- 'Resets <date and time>' under 'This month'.
- '<used> of <limit> <unit> used' with a progress bar.
- Image row: '<n> images · <credits>'.
- Storage: '<used> of <limit>' with a meter, or used only when no limit.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The limits route returns planTier, periodStart, resetAt, units, images, responses, storage and voiceMinuteCredits and sets Cache-Control no-store (apps/web/app/api/usage/limits/route.ts:85-102).
- Units are voice minutes, video seconds and computer-use requests with consumed, soft and hard limit per plan (apps/web/lib/services/tier-unit-quota-service.ts:274-291; packages/contracts/types/src/account-usage-client.ts:11-17).
- On a plan with a free voice allowance, consumed voice minutes come from that allowance (apps/web/app/api/usage/limits/route.ts:79-96).
- Images are counted for the current calendar month from settled image requests (apps/web/lib/services/account-usage-history-service.ts:299-327).
- The running count reads the live turn slots and returns null when it cannot (apps/web/lib/rate-limit.ts:1445-1461; apps/web/app/api/usage/limits/route.ts:44-54).
- Storage is the file storage meter for the user or organization; each half is null if its read failed (apps/web/lib/server/file-storage.ts:77-91).
- Web shows units, images, running responses and a voice estimate (apps/web/features/settings/sections/UsageSection.tsx:786-869, 1405-1409). Mobile shows units, images, running responses and a storage card (apps/mobile/src/features/settings/cloud-usage/index.tsx:522-603).
- The web card hides rows with no limit and no use, and hides the whole card when empty (apps/web/features/settings/sections/UsageSection.tsx:831-836).
- Research usage is a workload row in the history (apps/web/lib/billing/usage-attribution.ts:34-35; apps/web/features/settings/sections/UsageSection.tsx:1139-1143).

**Incomplete**

- The web Usage page has no storage display, although the API returns it (apps/web/features/settings/sections/UsageSection.tsx has no storage render).
- Mobile 'This month' shows no voice estimate row (apps/mobile/src/features/settings/cloud-usage/index.tsx:522-575).
- Research has no allowance meter, only a share in the history (apps/web/features/settings/sections/UsageSection.tsx:1139-1143).
- The Free voice allowance is computed by the API but web and mobile do not request limits for Free accounts (apps/web/features/settings/sections/UsageSection.tsx:1228; apps/mobile/src/features/settings/cloud-usage/index.tsx:910-911).

**Present but disconnected or switched off**

- Mobile Usage-credits card and store-sold items depend on the build flag nativePurchases, currently false (apps/mobile/src/features/billing/storePurchases.json:2). This does not hide the allowance cards.

**Not available**

- CLI, VS Code and Chrome: no allowances, storage or running count (no reads of /api/usage/limits found in those apps).
- Running count is null when no key-value store is configured or the plan has no limit (apps/web/lib/rate-limit.ts:1449-1452).

## 4. Required behaviour

**Established requirements**

- Users can see voice usage, image usage and video usage against any allowance. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.06, S82.07, S82.08)
- Users can see how much usage went to research. (source: S82.09 (same brief))
- Users can see storage used against the plan storage limit. (source: S82.11 (same brief))
- Users can see how many jobs or responses are running now, ideally against the plan's concurrent limit. (source: S82.12 (same brief))
- An unreadable running count is reported as unknown, not zero. (source: apps/web/app/api/usage/limits/route.ts:44-54; apps/web/app/api/usage/limits/route.test.ts:157)
- A Free account's voice minutes come from its monthly allowance, not the paid ledger. (source: apps/web/app/api/usage/limits/route.test.ts:112)

**Acceptance criteria**

1. As a paid user, 'This month' shows each unit with a limit and its reset date.
2. A unit with no cap reads 'no monthly cap'.
3. When the running-count read fails, the API returns responses null and the UI shows no running row.
4. Mobile shows a 'File storage' card with used and limit when the server returns bytes.
5. If the storage read fails, the storage card is hidden.
6. The API refuses a caller who is not signed in.
7. Images appear only after at least one image request this month.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The web Usage page should show storage, because the brief marks web 'done' for S82.11 [inferred from the brief; current code shows none].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'File storage' card on web using the same limits reply.
- [proposed] Add the voice estimate row to mobile.
- [proposed] Show research as a named allowance if the plan ever gives one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/usage/limits | `apps/web/app/api/usage/limits/route.ts` | One reply with units, images, responses, storage and voice price. |
| service | readTierUnitUsage | `apps/web/lib/services/tier-unit-quota-service.ts` | Consumed and limit per metered unit. |
| service | readMonthlyImageUsage | `apps/web/lib/services/account-usage-history-service.ts` | Image count and credits this month. |
| service | readManagedTurnSlots | `apps/web/lib/rate-limit.ts` | Running responses against the plan limit. |
| service | readFileStorageMeter | `apps/web/lib/server/file-storage.ts` | Storage used and limit. |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free voice allowance and consumed seconds. |
| service | live-voice-billing | `apps/web/lib/voice/live-voice-billing.ts` | Credits per voice minute. |
| schema | AccountUsageLimitsResponse | `packages/contracts/types/src/account-usage-wire.ts` | Shared type and parser (lines 60-110, 166). |
| config | MONTHLY_METERED_UNIT_COPY | `packages/contracts/types/src/account-usage-client.ts` | Labels and unit words for voice, video, computer use. |
| component | MonthlyAllowancesCard, AllowanceRow, VoiceEstimateRow, RunningResponsesRow | `apps/web/features/settings/sections/UsageSection.tsx` | Web rendering. |
| component | AllowancesCard and StorageCard | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile rendering. |
| component | StorageMeterBar | `apps/mobile/src/features/settings/StorageMeterBar.tsx` | Mobile storage meter. |
| service | fetchUsageAllowances | `apps/mobile/services/usage.ts` | Mobile read of /api/usage/limits. |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Web project storage display, outside the Usage page. |
| endpoint | GET /api/projects/{id}/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Returns storage meter for a project (line 52). |
| test | limits route test | `apps/web/app/api/usage/limits/route.test.ts` | Route behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Usage page opens for a paid account and requests /api/usage/limits. | device | apps/web/features/settings/sections/UsageSection.tsx:1227-1231 |
| Server resolves the entitled plan, then reads units, images, running turns and storage in parallel. | our servers | apps/web/app/api/usage/limits/route.ts:68-78 |
| If the plan has a free voice allowance, the server replaces voice consumed with the allowance reading. | our servers | apps/web/app/api/usage/limits/route.ts:79-96 |
| The server sends the reply with no-store caching. | our servers | apps/web/app/api/usage/limits/route.ts:102 |
| The client parses with the shared parser and renders cards, hiding empty ones. | device | apps/web/features/settings/sections/UsageSection.tsx:1229, 831-836 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unit counters, image requests, file bytes, active turn slots | Server database (counters and managed_usage_requests), a key-value store for turn slots, file storage sums. Exact counter table names not opened. | Read only here. | Unit counters reset on the monthly period (apps/web/lib/services/tier-unit-quota-service.ts:279-283). Turn slots expire by TTL (apps/web/lib/rate-limit.ts:1456). |

**Models and providers.** Voice price per minute depends on the live voice model slot for the plan (apps/web/app/api/usage/limits/route.ts:32-40). Image and video use are counted regardless of provider. No provider is called to read this.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. API key with usage:read works (apps/web/app/api/usage/limits/route.ts:59). |
| Permissions | User-scoped connection, with the organization id used for the storage scope (apps/web/app/api/usage/limits/route.ts:73-77). |
| Subscription | Units and caps vary by plan (apps/web/lib/services/tier-unit-quota-service.ts:288). Web and mobile Free views do not request it. |
| Limits and metering | Monthly caps per unit, concurrency limit per plan (getPlanMaxConcurrentTurns at apps/web/lib/rate-limit.ts:1449), storage limit per plan. Exact values are configuration and were not opened. |
| Feature flags | none found in the code. |
| Model compatibility | Voice minute price depends on the live voice backend chosen for the plan. |
| Provider restrictions | none found in the code. |
| Local mode | Local-only voice, image and storage do not use these meters; mobile Usage in Local mode shows a banner and makes no limits request (apps/mobile/src/features/settings/cloud-usage/index.tsx:1038, 910-917). Local inference is free of any paid plan (doc: task product context). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading this month's usage' text with spinner on web, a loading indicator on mobile. | apps/web/features/settings/sections/UsageSection.tsx:847; apps/mobile/src/features/settings/cloud-usage/index.tsx:542 |
| Error | 'Could not load this month's usage.' with retry. | apps/web/features/settings/sections/UsageSection.tsx:62, 848 |
| Empty | Card hidden when no unit has a limit or use and no images. | apps/web/features/settings/sections/UsageSection.tsx:836 |
| Running count unavailable | API returns responses null and the row is not shown. | apps/web/app/api/usage/limits/route.ts:44-54; apps/web/features/settings/sections/UsageSection.tsx:816 |
| Storage read fails | usedBytes or limitBytes null; mobile card hides when used is null. | apps/web/lib/server/file-storage.ts:77-91; apps/mobile/src/features/settings/cloud-usage/index.tsx:579 |
| Plan cannot be resolved or counter read fails | 500 'Failed to fetch usage limits' with no cause. | apps/web/app/api/usage/limits/route.ts:103-105; apps/web/app/api/usage/limits/route.test.ts:170-185 |
| Unlimited unit | Shown as '<n> <unit>, no monthly cap' without a bar. | apps/web/features/settings/sections/UsageSection.tsx:768-775 |
| Accessibility | Mobile storage meter has a spoken label with used and limit. | apps/mobile/src/features/settings/cloud-usage/index.tsx:598 |
| Offline | not handled in the code beyond the error and retry. | searched apps/web/features/settings/sections/UsageSection.tsx and apps/mobile/src/features/settings/cloud-usage/index.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/limits/route.test.ts`: Free voice from allowance, paid ledger path, units and credits, unknown running count, 500 cases, auth refusal.
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: 'This month' refresh along with plan windows.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile Usage screen including allowances (individual cases not all verified).
- `apps/mobile/src/features/settings/__tests__/storageUsage.test.ts`: Mobile storage usage helpers (contents not opened).
- `apps/web/__tests__/api/mission-usage-boundary.test.ts`: Not opened; name only.

**Test scenarios**

- **Monthly units**
  1. Use an account that has used voice this month.
  2. Open web Usage.
  - Expected: 'This month' lists Voice with used and limit and a reset date.
- **No cap unit**
  1. Use a plan where a unit has no hard limit.
  - Expected: Row reads '<n> <unit>, no monthly cap'.
- **Running count**
  1. Start two responses at once.
  2. Open Usage.
  - Expected: 'Responses running now 2 of <limit> at a time' or no row if unreadable.
- **Mobile storage**
  1. Upload files.
  2. Open mobile Usage.
  - Expected: 'File storage' shows used and limit with a meter.
- **Web storage gap**
  1. Open web Usage with uploaded files.
  - Expected: No storage card (known gap).
- **Free account**
  1. Open Usage as Free.
  - Expected: Upgrade prompt only; no allowances.

**Where to look when it fails**

- Log 'Failed to fetch usage limits'.
- Log 'Running response count unavailable' (warn).
- Log 'File storage meter: plan read failed' or 'usage read failed'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Web Usage page has no storage meter while the brief marks it done.** Affects: Web and hosted Desktop. Evidence: apps/web/features/settings/sections/UsageSection.tsx (no storage reference); apps/web/app/api/usage/limits/route.ts:99. Work needed: Render a storage card from limits.data.storage.
- **Research has no meter or allowance, only a history share.** Affects: All apps. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1139-1143. Work needed: Product decision on whether research gets its own allowance.
- **Brief code reference for research points to unrelated code.** Affects: Documentation. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4303. Work needed: Correct to usage-attribution.ts:30-37.
- **Free voice allowance is computed but never shown on web or mobile Free views.** Affects: Free users. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1228. Work needed: None if Free is Upgrade-only by decision; otherwise add.
- **The draft says the 'Allowances card' and 'Storage card' exist on web; web has a 'This month' card and no storage card.** Affects: Testers. Evidence: apps/web/features/settings/sections/UsageSection.tsx:841. Work needed: Correct wording.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-observability-and-operations
- api:GET /api/usage/limits
- table:managed_usage_requests
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:free
- F082-02

## Unknown

- Unit caps per plan (tier-unit-quota-service constants not opened).
- Names of the counter tables behind readConsumedTierUnits.
- What storageUsage.test.ts and mission-usage-boundary.test.ts assert.
- Whether any other web screen shows account-wide storage.
- How the Electron Desktop shows the same page (not run).

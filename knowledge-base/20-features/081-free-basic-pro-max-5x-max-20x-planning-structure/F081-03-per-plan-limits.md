---
id: "F081-03"
type: "feature"
title: "Per-plan limits"
aliases: ["Per-plan limits", "BILLING_PLAN_PRODUCT_LIMITS", "Product limits table", "Projects, storage, context, concurrency, upload limits", "Generation settings by plan (S81.14)", "Manual model choice and reasoning effort gating", "S81.10 S81.11 S81.12 S81.13 S81.14"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S81.10", "S81.11", "S81.12", "S81.13", "S81.14"]
depends_on: ["F081-01", "F081-04", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "table:media_assets", "table:project_knowledge_files", "table:user_projects", "api:GET /api/me", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-03 Per-plan limits

Each plan has fixed product limits in one table: project count, file storage, answers running at once, uploads per day and large chat files. Free plan users also cannot pick a model by hand and cannot raise reasoning effort above the model default. Context size is not a plan limit; it follows the models the plan may use.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.10](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8110), [S81.11](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8111), [S81.12](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8112), [S81.13](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8113), [S81.14](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8114).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Holds numbers per plan in BILLING_PLAN_PRODUCT_LIMITS (packages/contracts/types/src/billing-catalog.ts:580-740) and enforces them when a project is created, a file is added or a turn starts. A separate model policy decides manual model choice and reasoning effort (packages/contracts/types/src/model-catalog.ts:1245-1260,2618-2650).

**Why it exists.** To keep cost bounded per plan and to make plans differ in things other than credits.

**Who uses it.** People creating projects, uploading files, running several chats, picking models or effort; engineers setting plan limits.

**Problems it solves**

- One free account storing unlimited files
- Many parallel answers on a cheap plan
- Free users choosing the costliest models
- A limit message that does not say what to do

**Use cases**

- Add knowledge files to a project until the storage limit message appears
- Attach a file bigger than 25 MiB to a chat message
- Start a second answer while the first runs on Free or Basic
- Open the model picker on Free and see manual choice and higher effort locked

## 2. User experience

**Where to find it**

- Web: Pricing page comparison table rows 'Projects', 'Knowledge storage', 'Largest file upload', 'Chats at once', 'Context window' (apps/web/app/pricing/page.tsx:793-860; packages/ui/i18n/locales/en/pricing.json:225-241)
- Web: project Knowledge files list shows storage used and limit (apps/web/app/api/projects/[id]/knowledge-files/route.ts:52-64)
- Web: composer model picker and reasoning effort control (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1303-1316)
- Desktop (public Electron app): same web screens
- Mobile: plans screen shows a context line per plan; model picker marks locked models (apps/mobile/src/features/settings/plans/index.tsx:70; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:313)
- CLI: model picker marks Cloud rows the tier cannot route (apps/cli/src/tui/widgets/model_picker.rs:196-210)
- VS Code and Chrome: model picker gating (Chrome apps/extension/src/features/cloud-bridge/managedModelPicker.ts:137,337)

**Before you start**

- Signed-in Cloud account for managed limits
- Large chat files also need the server flag CHAT_LARGE_FILES_ENABLED set to 'on' and readiness checks to pass (apps/web/lib/server/chat-file-intake/readiness.ts:41)

**Screens and controls**

- Web project knowledge panel with storage meter
- Web composer attach control; upload size and count come from limits the server hands out at sign-in (apps/web/features/chat/lib/composer-attachment-limits.ts:13; apps/web/app/api/me/route.ts:345)
- Web composer effort chips, with gated chips on plans without manual model selection (ComposerFooter.tsx:1311-1313)

**Journey**

1. Person adds a file or sends a message with an attachment
2. The client checks against the limits the server published
3. The server checks size, daily count and storage again and refuses with a message and an upgrade link when over
4. Starting a turn takes a concurrency slot; a second turn over the limit is refused
5. Choosing a model or effort is clamped to what the plan allows

**What the person sees and gets**

- Storage: '<Plan> accounts include <size> of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' (apps/web/lib/services/free-plan-entitlements.ts:37-47)
- Projects: 'Your <Plan> plan includes N project folders. Upgrade your plan to add more, or delete an existing folder to make room.' (free-plan-entitlements.ts:54-68)
- File size: '<Plan> accounts can upload files up to N MB each. Upgrade for larger files.' code attachment_over_plan_limit (apps/web/lib/server/attachment-allowance.ts:112-127)
- Daily uploads: '<Plan> accounts can upload N files a day... after midnight UTC' code daily_upload_limit_reached (attachment-allowance.ts:169-215)
- Concurrency: 'Your plan allows N responses at a time...' HTTP 429 code concurrent_turn_limit_reached (apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:14-55)
- Concurrency limiter down: 503 concurrency_limiter_unavailable with Retry-After 30 (turn-slot.ts:21-33)

**Settings**

- Reasoning effort and thinking switch in the composer; stored per conversation or globally (ComposerFooter.tsx:1014-1031)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Limits table (billing-catalog.ts:580-740): projects Free 5, all paid unlimited; knowledge storage Free 500 MiB, Basic 4 GiB, Premium 20 GiB, Max 50 GiB, Ultra 100 GiB, Team 25 GiB, Team Premium computed from price, Enterprise custom; answers at once Free 1, Basic 1, Premium 3, Max 5, Ultra 10, Team 3, Team Premium 5; daily uploads Free 5, others unlimited
- Inline attachment limit is 25 MiB and 20 files per message on every plan (packages/contracts/types/src/attachment-policy.json:2; billing-catalog.ts:545-546)
- Large chat file limit 500 MiB per file for paid plans only; daily large-file bytes Basic 2 GiB, Premium 10 GiB, Max 25 GiB, Ultra 50 GiB (billing-catalog.ts:550-570,625-680)
- Storage enforced on chat attachment completion, project knowledge files and large-file seal (apps/web/lib/server/chat-attachment-completion.ts:388; apps/web/lib/server/project-knowledge-files.ts:268; apps/web/lib/server/chat-file-intake/seal.ts:342)
- Project count enforced on create (apps/web/app/api/projects/route.ts:163)
- Concurrency enforced with a Redis sorted set, a 360 second age-out and release when the stream ends (apps/web/lib/rate-limit.ts:1306,1366-1440; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:109-163)
- Server publishes plan-specific attachment limits in the account response (apps/web/lib/server/attachment-allowance.ts:88-100; apps/web/app/api/me/route.ts:345); mobile stores them (apps/mobile/src/features/billing/store.ts:105)
- Manual model choice is off for Free only; Basic, Premium and Team share the paid policy; Max, Ultra and Team Premium map to the Max policy (model-catalog.ts:1693-1714,1245-1247)
- Reasoning effort above a model's default is cut off for plans without manual selection, in the UI chips and again on the server (model-catalog.ts:2618-2650; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826-1840)
- Chrome applies the same effort split (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:337)

**Incomplete**

- The plan 'context window' is only display: the largest context among models the plan may use; no per-request plan clamp exists (model-catalog.ts:3077-3090; used only in apps/web/app/pricing/page.tsx:229 and apps/mobile/src/features/settings/plans/index.tsx:70)
- Large chat files depend on a server flag and readiness gaps flag, plan, origin, schema, scanner; when not ready the product says 'Files this large aren't available yet.' (attachment-allowance.ts:50-52; readiness.ts:21)
- Effort gating on mobile, CLI and VS Code was not traced; only web and Chrome effort splits were found

**Present but disconnected or switched off**

- Large chat files stay off unless CHAT_LARGE_FILES_ENABLED is 'on' (readiness.ts:41-43); production value unknown

**Not available**

- No per-plan upload-size difference for normal attachments: every plan has the same 25 MiB (billing-catalog.ts:545-546)
- Per-plan context clamp: none found in the code
- Web monthly download caps exist but are outside the six items here (billing-catalog.ts:524-545)

## 4. Required behaviour

**Established requirements**

- Each plan has its own upload-size limit, stated to users and enforced on upload. (source: S81.10 (brief; brief marks web and desktop missing, code differs, see gaps))
- Each plan has its own storage limit, stated and enforced when files are added. (source: S81.11 (brief))
- Each plan has its own context-size limit, stated and enforced per request. (source: S81.12 (brief))
- Each plan has its own limit on simultaneous responses, stated and enforced per turn. (source: S81.13 (brief))
- Plans differ in generation settings (reasoning effort, manual model choice); the UI shows gated options and the server clamps requests to the plan. (source: S81.14 (brief))
- Storage, download and concurrency allowances are owned by BILLING_PLAN_PRODUCT_LIMITS, not display rounding. (source: doc: docs/product/commercial.md 'Plan Presentation And Usage Windows')
- A refusal names the consequence and the fix (upgrade or delete). (source: doc: AGENTS.md section 9 (user-facing actions and messages))

**Acceptance criteria**

1. Free: creating a sixth project is refused with the project-limit message; Basic and above are not refused
2. Free: adding files past 500 MiB total is refused with the storage message naming the plan
3. A 26 MiB file on a plan without large-file readiness is refused with 413 and code attachment_over_plan_limit or chat_attachment_needs_project
4. A sixth upload in a UTC day on Free is refused with daily_upload_limit_reached
5. On Free and Basic, a second simultaneous Cloud answer returns 429 concurrent_turn_limit_reached; on Premium the fourth does
6. On Free, manual model choice is locked and effort chips above default are marked gated; sending a higher effort is clamped by the server
7. Pricing row 'Chats at once' shows 1, 1, 3, 5, 10 for Free, Basic, Premium, Max, Ultra

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the plan context value is derived from allowed models, a per-request plan clamp is not needed for correctness; the model's own window is the limit [inferred from model-catalog.ts:3077-3090]
- Storage is counted per workspace scope (user and organization) [inferred from apps/web/lib/server/file-storage.ts:30-60]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the large-file limit on the pricing page only when the feature flag is on, so the table matches what works
- [proposed] Add the same clamped-effort test for mobile, CLI and VS Code as web has (EffortEntitlementHonest.test.tsx)
- [proposed] Rename the pricing row 'Context window' to say it is the largest model window, not a plan quota

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | BILLING_PLAN_PRODUCT_LIMITS | `packages/contracts/types/src/billing-catalog.ts` | Per-plan numbers (lines 524-740) and getters (741-845) |
| config | attachment-policy.json | `packages/contracts/types/src/attachment-policy.json` | Inline attachment size 26214400 bytes (line 2) |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | Project, connector and storage limits and their messages |
| service | file-storage | `apps/web/lib/server/file-storage.ts` | Counts used bytes and asserts storage is available (lines 30-95) |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Storage check when a knowledge file is registered (line 268) |
| service | chat-attachment-completion | `apps/web/lib/server/chat-attachment-completion.ts` | Storage check on chat attachment completion (line 388) |
| service | attachment-allowance | `apps/web/lib/server/attachment-allowance.ts` | Size, daily count, large-file allowance and limits handed to clients |
| service | chat-file-intake readiness and quotas | `apps/web/lib/server/chat-file-intake/readiness.ts` | Flag and readiness for large chat files |
| endpoint | POST /api/projects | `apps/web/app/api/projects/route.ts` | Project count limit (line 163) |
| endpoint | GET /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Lists files and returns the storage meter (lines 52-64) |
| service | rate-limit acquireManagedTurnSlot | `apps/web/lib/rate-limit.ts` | Concurrency slot with age-out (lines 1306-1440) |
| service | turn-slot | `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts` | Wraps a turn in a slot and builds the refusal (lines 14-163) |
| service | model-catalog tier policy and effort split | `packages/contracts/types/src/model-catalog.ts` | normalizeProductTier, manualModelSelection, splitEffortsByEntitlement, getPlanContextWindowTokens |
| service | resolveRequestEffort | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server clamp of requested effort to the plan (line 1826) |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Effort chips and gating (lines 1303-1316) |
| hook | composerAttachmentLimits | `apps/web/features/chat/lib/composer-attachment-limits.ts` | Client attachment limits from server or plan fallback |
| service | managedModelPicker (Chrome) | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome model access and effort gating (lines 137, 337) |
| screen | Mobile ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model lock by tier (line 313) |
| store | Mobile tier store | `apps/mobile/src/features/billing/store.ts` | Applies server attachment limits (line 105) |
| config | CLI model picker tier lock | `apps/cli/src/tui/widgets/model_picker.rs` | Marks Cloud models the tier cannot route (line 210) |
| test | attachment-allowance tests | `apps/web/lib/server/__tests__/attachment-allowance.test.ts` | Upload admission |
| test | turn-slot tests | `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.test.ts` | Concurrency refusal |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After sign-in the server hands the client the plan's attachment limits in the account response. | our servers | apps/web/app/api/me/route.ts:345; apps/web/lib/server/attachment-allowance.ts:88-100 |
| The client blocks a file over the published size or count before upload. | device | apps/web/features/chat/lib/composer-attachment-limits.ts:13-28 |
| The server admits the upload: plan size, daily count in a key-value store, then storage used plus incoming bytes against the plan limit. | our servers | apps/web/lib/server/attachment-allowance.ts:169-215; apps/web/lib/server/file-storage.ts:64-75 |
| A chat turn takes a concurrency slot keyed by user; over the limit returns 429. | our servers | apps/web/lib/rate-limit.ts:1366-1415; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:109-130 |
| The slot is released when the stream ends, errors or is cancelled, or ages out after 360 seconds. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:61-92; apps/web/lib/rate-limit.ts:1306 |
| The requested effort is clamped to the plan before the model call. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826-1840 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Files and their byte sizes | tables media_assets and project_knowledge_files | Server; all apps read through the web API | Counted until deleted_at or superseded (file-storage.ts:30-56) |
| Daily upload counter | key-value store key agi:uploads:daily:<user>:<UTC day> | Server only | Expires after 2 days (attachment-allowance.ts:196-203) |
| Concurrent turn slots | key-value sorted set agi-turns:<user> | Server only | Removed on release or after 360 seconds (rate-limit.ts:1306-1325) |

**Models and providers.** Concurrency and storage are model agnostic. Manual model choice and effort depend on the model catalog entry (reasoning ladder) and the plan tier (SYS-model-catalog-and-routing). The effort clamp applies for providers whose models accept an effort value (request-processor.ts:1806-1840).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account with a plan. A request with an unknown plan gets zero upload size and zero projects (billing-catalog.ts:741-760, test titles 'fails unknown cloud tiers closed'). |
| Permissions | Limits follow the plan of the person, or of the seat holder inside a workspace (apps/web/lib/server/file-storage.ts:58-62). |
| Subscription | Table above; Enterprise values are 'custom' and treated as no enforceable limit (billing-catalog.ts:787-790). |
| Limits and metering | Storage bytes summed across media_assets and project_knowledge_files; daily uploads per UTC day; concurrency by live slots; no metering in credits for these. |
| Feature flags | CHAT_LARGE_FILES_ENABLED='on' for large chat files; Redis outage policy decides if the concurrency limiter fails open or closed (apps/web/lib/rate-limit.ts:1330-1345). |
| Model compatibility | Model access by plan is separate: Free sees only models named free; paid plans see economy models; Premium adds pro additions; Max adds flagship additions (packages/contracts/types/src/model-catalog.ts:2196-2243). |
| Provider restrictions | None found in the code for these limits. |
| Local mode | Local and own-key tiers have unlimited projects, storage, concurrency and daily uploads in the table and no large chat files (billing-catalog.ts:583-618). Server-side checks do not run for Local; where local file storage limits are set on each device: not found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Storage full | Validation error with plan name and size | apps/web/lib/services/free-plan-entitlements.ts:37-47 |
| Storage meter read fails | Meter fields come back null and a warning is logged | apps/web/lib/server/file-storage.ts:77-95 |
| Daily upload count cannot be kept | Upload is refused rather than let through uncounted | apps/web/lib/server/attachment-allowance.ts:163-168,184-210 |
| Concurrency store not configured | Follows the Redis outage policy: admit with a warning, or refuse with 503 | apps/web/lib/rate-limit.ts:1330-1345 |
| Tab closed mid-stream | Slot ages out after 360 seconds | apps/web/lib/rate-limit.ts:1296-1306 |
| Large files not ready | Product says 'Files this large aren't available yet.' | apps/web/lib/server/attachment-allowance.ts:50-52 |
| Offline | not handled in the code for these checks beyond failing the request | apps/web/lib/server/attachment-allowance.ts:169 |
| Free plan media | Image and video are shown as 'limited' only when a time-limited free offer exists | apps/web/features/models/lib/free-media.ts:50-83 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: Project limits, twenty files per message, large-file fields per tier, daily uploads, unknown plan gets nothing (test titles lines 295-590)
- `apps/web/lib/server/__tests__/attachment-allowance.test.ts`: Upload admission; contents not read
- `apps/web/lib/server/chat-file-intake/__tests__/quotas.test.ts`: Large-file quotas; contents not read
- `apps/web/features/chat/lib/__tests__/composer-attachment-limits.test.ts`: Client attachment limits; contents not read
- `apps/web/lib/services/free-plan-entitlements.test.ts`: Project, connector and storage limits; contents not read
- `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.test.ts`: Concurrency refusal; contents not read
- `apps/web/lib/__tests__/rate-limit.test.ts`: Rate limit and slots; contents not read
- `apps/web/features/settings/sections/__tests__/EffortEntitlementHonest.test.tsx`: Effort entitlement in settings; contents not read
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome model picker and effort gating; contents not read
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: VS Code picker tier gate; contents not read
- `packages/contracts/types/src/__tests__/model-catalog.free-plan-reach.test.ts`: Models reachable on Free; contents not read

**Test scenarios**

- **Project limit**
  1. On a Free test account create five projects
  2. Create a sixth
  - Expected: Sixth is refused with 'Your Free plan includes 5 project folders...'; on Basic it succeeds
- **Storage limit**
  1. On Free add knowledge files totalling over 500 MiB
  - Expected: The file that crosses the limit is refused with the storage message; meter in the list shows used and limit
- **Concurrency**
  1. On Free start a long Cloud answer
  2. Start a second in another tab
  - Expected: Second gets 429 concurrent_turn_limit_reached with the plan's limit and active count in headers; after the first ends a new one works
- **Upload size and daily count**
  1. On Free upload one file of 30 MiB
  2. Upload six small files in one UTC day
  - Expected: First is refused (size or needs project); sixth small file refused with daily_upload_limit_reached; Basic has no daily count
- **Effort gating on Free**
  1. On Free open the composer effort control on a reasoning model
  2. Send a request with a higher effort through the API
  - Expected: Chips above default are marked gated; the server uses the default effort
- **Large file flag**
  1. On a Premium account with the large-file flag off upload a 100 MiB file
  - Expected: Refused with the large files unavailable message; with flag and readiness on it is accepted up to 500 MiB

**Where to look when it fails**

- Logs 'GOV-3: concurrent-turn ceiling unenforceable' and 'Concurrent-turn ceiling reached; rejecting turn' (rate-limit.ts:1330-1345; turn-slot.ts:115-122)
- Error codes attachment_over_plan_limit, daily_upload_limit_reached, chat_large_files_unavailable (attachment-allowance.ts:45-52)
- Response headers X-AGI-Concurrent-Turn-Limit and X-AGI-Concurrent-Turns-Active (turn-slot.ts:19-20)
- media_assets and project_knowledge_files byte sums (file-storage.ts:30-56)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Mobile: [70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- CLI: [70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- VS Code: [70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Chrome: [70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **Brief says upload-size limits are missing on web and desktop; the code has them: the inline limit is 25 MiB for every plan and a 500 MiB large path for paid plans. The real gaps are that the inline limit does not differ by plan and that the large path needs a server flag** Affects: Web and Electron desktop users; testers using the brief. Evidence: packages/contracts/types/src/billing-catalog.ts:545-570; apps/web/lib/server/attachment-allowance.ts:78-100,235-260; apps/web/lib/server/chat-file-intake/readiness.ts:41. Work needed: Correct the brief; owner decision on whether the 25 MiB inline limit should differ per plan; confirm production value of the flag
- **Context size is not a plan limit and is not enforced per plan, only shown** Affects: Pricing comparison readers; all apps. Evidence: packages/contracts/types/src/model-catalog.ts:3077-3090. Work needed: Relabel as the largest model window or add a real plan clamp
- **Draft expectation that Basic gets 3 answers at once is wrong: Basic is 1; Premium 3; Max 5; Ultra 10** Affects: Docs and testers. Evidence: packages/contracts/types/src/billing-catalog.ts:590-680. Work needed: Use the catalog values in docs
- **Storage enforcement line in the brief (knowledge-files route line 227) does not exist; the route is 113 lines and enforcement lives in project-knowledge-files.ts** Affects: Engineers following the brief. Evidence: apps/web/app/api/projects/[id]/knowledge-files/route.ts; apps/web/lib/server/project-knowledge-files.ts:268. Work needed: Fix the brief reference
- **Effort and manual model gating on mobile, CLI and VS Code is not established; only web and Chrome effort splits were found** Affects: Mobile, CLI and VS Code Free users. Evidence: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:313; apps/cli/src/tui/widgets/model_picker.rs:210. Work needed: Trace each app and add tests
- **Desktop upload and storage limits for the Tauri build are not traced; the public desktop uses web** Affects: Internal Tauri desktop. Evidence: apps/desktop/electron/config.ts:17,64. Work needed: Confirm Tauri build is not shipped or trace its limits

**Depends on**

- F081-01
- F081-04
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- table:media_assets
- table:project_knowledge_files
- table:user_projects
- api:GET /api/me
- mode:cloud

## Unknown

- Production value of CHAT_LARGE_FILES_ENABLED and scanner readiness
- Team Premium knowledge storage in bytes (computed from the rate card, not evaluated)
- Effort and manual model gating on mobile, CLI and VS Code
- Per-device storage limits in Local mode
- Whether the Tauri desktop build ships

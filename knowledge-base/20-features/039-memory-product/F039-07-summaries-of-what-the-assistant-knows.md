---
id: "F039-07"
type: "feature"
title: "Summaries of what the assistant knows"
aliases: ["What AGI knows about you", "Memory summary", "Reflect", "Work in progress", "Recap", "profile summary (S39.07)", "preference summary (S39.08)", "ongoing-work summary (S39.09)", "About you / Your preferences"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S39.07", "S39.08", "S39.09"]
depends_on: ["SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "SYS-execution-boundaries", "surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "mode:local", "table:user_memories", "table:web_conversations", "table:web_messages", "table:user_settings", "api:GET /api/reflect", "api:GET /api/memory/summary", "api:POST /api/memory/summary", "file:apps/web/lib/services/memory-summary-service.ts", "file:apps/web/lib/services/reflect-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-07 Summaries of what the assistant knows

Three views of what AGI has learned. Web Settings, Memory has a model-written card, "What AGI knows about you", with About you and Your preferences. Reflect (web, mobile) lists "Work in progress", built from chat history, not memories. Mobile "Memory summary" only groups saved facts. CLI, VS Code and Chrome have none.

Area: [39. Memory product](README.md). Requirement items: [S39.07](../../10-requirements/capabilities/039-memory-product.md#s3907), [S39.08](../../10-requirements/capabilities/039-memory-product.md#s3908), [S39.09](../../10-requirements/capabilities/039-memory-product.md#s3909).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a signed-in person read a short account of what AGI knows about them. The web card gives lines about who they are and how they like answers. Reflect gives a list of chats that look like ongoing work. The mobile Memory summary screen groups the saved facts as Pinned, Learned from chats and Added by you.

**Why it exists.** The brief (S39.07, S39.08, S39.09) requires the person to be able to read what the assistant learned about them, their preferences and their ongoing work, so memory is inspectable and not a black box. docs/product/experience-contract.md:28 asks for inspectable memory.

**Who uses it.** Signed-in people who have memory turned on and want to check or correct what AGI remembers. Support staff and testers use it to see the effect of saved memories.

**Problems it solves**

- The person cannot tell, from a long list of single facts, what the assistant believes about them.
- The person cannot see which chats AGI treats as continuing work.
- A wrong or stale fact is easier to spot in a short summary and then fix in the list below it.

**Use cases**

- On web, open Settings, Memory, press Summarise my memories and check the About you and Your preferences lines.
- On web or mobile, open Reflect and read Work in progress to see which chats ran over several days or had several follow-ups.
- On mobile, open Memory, then Memory summary to see pinned facts, facts learned from chats and facts typed by hand, on the device.
- After deleting a memory, reload the summary and see that the old line is gone only once the summary is written again.

## 2. User experience

**Where to find it**

- Web: Settings, Memory section, card titled "What AGI knows about you" (apps/web/features/settings/components/MemorySummaryCard.tsx:153; hosted at apps/web/features/settings/sections/MemorySection.tsx:493).
- Web: Settings, Reflect section, heading "Work in progress" (apps/web/features/settings/sections/ReflectSection.tsx:296; the section is registered in apps/web/features/settings/components/WebSettingsModal.tsx:298).
- Mobile: Settings, Reflect row, screen with heading "Work in progress" (apps/mobile/app/(app)/settings/reflect.tsx:498; row at apps/mobile/src/features/settings/index.tsx:838).
- Mobile: Settings, Memory, row "Memory summary" (apps/mobile/app/(app)/settings/memory.tsx:558), screen title "Memory summary" (apps/mobile/app/(app)/settings/memory-summary.tsx:44).
- Desktop (Tauri code in apps/desktop/src): Settings, Reflect tab renders the recap but no ongoing-work list was found in it (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:1241; apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx has no ongoingWork reference). The Electron desktop shows the hosted web app (doc: AGENTS.md section 5), so it gets the web screens [inferred].
- CLI, VS Code and Chrome: not present (no code found).

**Before you start**

- Signed in to an AGI account for the web card and for Reflect.
- Memory switched on. Reflect also needs the generate-from-history setting not switched off (apps/web/lib/services/reflect-service.ts:65).
- For the web card, at least one saved memory in the current workspace; otherwise the card says nothing is saved (apps/web/features/settings/components/MemorySummaryCard.tsx:173).
- Mobile Reflect is reached through the Cloud settings route only (apps/mobile/src/features/settings/index.tsx:838-843).

**Screens and controls**

- Web card: buttons "Summarise my memories" (first time) or "Update summary", "Try again" after a load error, lists headed "About you" and "Your preferences", and an "Updated <date>" label (MemorySummaryCard.tsx:179,199).
- Web Reflect: range dropdown labelled "Reflect range" (30 days, 3 months, 6 months, year), button labelled "Refresh recap" (ReflectSection.tsx:114), and a link to Personalization settings when memory is off (ReflectSection.tsx:137).
- Mobile Reflect: range selector, "Retry loading Reflect" button and "Open memory settings" button (reflect.tsx:269-305).
- Mobile Memory summary: read-only sections Pinned, Learned from chats, Added by you, and a footer line naming the memory count and date (consolidation.ts:113; memory-summary.tsx:44).

**Journey**

1. 1. Open Settings, then Memory (web) or Memory, then Memory summary (mobile).
2. 2. Web: the card loads the last stored summary for the current memories (GET /api/memory/summary).
3. 3. Press Summarise my memories (or Update summary) to ask our servers to write a new one.
4. 4. Read the About you and Your preferences lines; the footer shows the date it was written.
5. 5. To change a line, edit or delete memories in the list below; the card reloads, and the summary shows as not written until you update it.
6. 6. For ongoing work: open Reflect, pick a range, read Work in progress; each row shows the project, the days active, the number of follow-ups and the last active date.

**What the person sees and gets**

- Spinner with label "Loading your memory summary" while loading.
- "Nothing is saved yet, so there is nothing to summarise." when there are no memories.
- "AGI has not summarised your saved memories yet." before the first write; "Your memories do not say enough yet to summarise." when the model found nothing.
- Error text with "Try again"; write failure text "The summary could not be written right now. Try again in a few minutes."
- Reflect: "Building your recap..." while loading; "Memory is off" panel with a settings link; "Reflect could not load" with a retry control.

**Settings**

- Memory on/off and Save memories from chats (the generate-from-history flag) decide whether Reflect is allowed (reflect-service.ts:65).
- No setting turns the web summary card off separately [inferred from the absence of one in MemorySection.tsx].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web profile and preference summary exists: POST /api/memory/summary writes About and Preferences lines (up to 6 lines of 240 characters each) from up to 200 memories, and GET returns the cached one (apps/web/app/api/memory/summary/route.ts:29,69; packages/contracts/cloud-contracts/src/memory-summary.ts:5).
- The summary is cached for 30 days under a fingerprint of memory ids and update times plus the workspace, so any edit makes the stored summary stale (apps/web/lib/services/memory-summary-service.ts:35; fingerprint function in the same file).
- Summary generation is metered: it reserves usage under the feature name memory_summary and is rate-limited to 10 per hour (memory-summary-service.ts:28,200; apps/web/lib/rate-limit.ts:287).
- Web Reflect builds Work in progress from conversations that span more than one day or have at least 3 user messages, newest first, at most 6 (reflect-service.ts:19,104; packages/contracts/cloud-contracts/src/conversations.ts:308).
- Reflect excludes temporary chats and chats that contain a cloud agent run, and only reads the signed-in owner's chats in the active workspace (reflect-service.ts:327,335).
- Reflect refuses with code memory_required (HTTP 409) when memory is off (apps/web/app/api/reflect/route.ts:37).
- Mobile Reflect shows Work in progress and a Memory is off state (reflect.tsx:251,498), fetching /api/reflect (apps/mobile/src/features/reflect/service.ts:39).
- Mobile Memory summary groups local or cloud memories on the device with no network call (apps/mobile/app/(app)/settings/memory-summary.tsx:40; apps/mobile/src/features/memory/services/consolidation.ts:113).

**Incomplete**

- Ongoing work is built from conversations, not from memories as the brief's Should line says (reflect-service.ts:104,277). Memory only acts as a switch.
- Mobile Memory summary is a grouping of stored facts, not a written profile or preference summary; the page footer says "Generated from N memories" although no model is used (memory-summary.tsx:40; consolidation.ts:113).
- Desktop (Tauri) Reflect tab fetches the recap but shows no ongoing-work list (CloudReflectSection.tsx; grep for ongoingWork found nothing).

**Present but disconnected or switched off**

- The summary cache is skipped when no key-value store is configured; the GET then returns an empty summary even after a write (memory-summary-service.ts, readCachedMemorySummary returns null without a store). Whether production has the store is unknown.

**Not available**

- Profile summary and preference summary on mobile as model-written text: not built, and a decision says it will not be (docs/decisions/2026-09-27-founder-decisions.md:294).
- Any of the three summaries in CLI, VS Code and Chrome: no code found.
- The brief and decision D-2026-09-28-17 say web and desktop show no profile summary; the web card exists in code (git commit 997be012c4), so those documents are out of date.

## 4. Required behaviour

**Established requirements**

- The user can read a summary of what the assistant learned about them as a person. (source: brief S39.07 Should)
- The user can read a summary of the preferences the assistant learned from memory. (source: brief S39.08 Should)
- The user can read a summary of the ongoing work or projects the assistant knows they pursue. (source: brief S39.09 Should)
- Memory is inspectable, scoped, and every entry exposes provenance, last update, edit, exclusion, export and deletion. (source: docs/product/experience-contract.md:28)
- Mobile does not add a generated profile summary because the leaders show none (S39.07 mobile). (source: docs/decisions/2026-09-27-founder-decisions.md:294)

**Acceptance criteria**

1. On web with at least one memory, Settings, Memory shows the card "What AGI knows about you"; pressing Summarise my memories shows About you and Your preferences lines, each at most 6.
2. With zero memories the card says nothing is saved and pressing nothing calls a model (route.ts:79 gate is skipped when no memories).
3. After editing or deleting a memory the card reloads and the old summary is no longer returned until the person updates it.
4. In a personal workspace the summary uses only personal memories; in a workspace it uses only that workspace's memories.
5. Reflect with memory on lists at most 6 Work in progress rows, each from a non-temporary chat that spans more than one day or has at least 3 user messages.
6. Reflect with memory off returns 409 memory_required and shows the Memory is off panel on web and mobile.
7. The mobile Memory summary lists Pinned, Learned from chats and Added by you facts and works offline in Local mode.
8. If the model call fails the card keeps working and shows the retry message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's "built from memories" wording for Work in progress should be read as "allowed by the memory setting" because the code reads chats [inferred from reflect-service.ts:277-345].
- Electron desktop gets the web card because it shows the hosted web app [inferred from AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the summary card to the desktop Tauri Memory tab and to the mobile Memory screen in Cloud mode, reusing /api/memory/summary.
- [proposed] Change the mobile footer from "Generated from" to "Grouped from" so it matches what the screen does.
- [proposed] Update the brief and D-2026-09-28-17 to say the web card exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Reflect recap builder | `apps/web/lib/services/reflect-service.ts` | Reads chats, builds stats, topics and the ongoing-work list; checks memory setting |
| endpoint | GET /api/reflect | `apps/web/app/api/reflect/route.ts` | Validates range and timezone, returns recap or 409 memory_required |
| component | ReflectSection | `apps/web/features/settings/sections/ReflectSection.tsx` | Web Reflect screen with Work in progress list |
| hook | useReflectRecap | `apps/web/features/settings/hooks/use-reflect-recap.ts` | Fetches recap bound to the active workspace owner |
| screen | Mobile Reflect | `apps/mobile/app/(app)/settings/reflect.tsx` | Mobile recap with Work in progress |
| service | Mobile reflect service | `apps/mobile/src/features/reflect/service.ts` | Calls /api/reflect and maps memory_required |
| component | CloudReflectSection (desktop) | `apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx` | Tauri Reflect tab, no ongoing-work list |
| service | fetchCloudReflectRecap | `apps/desktop/src/api/cloudAccountSettings.ts` | Desktop fetch of the recap |
| endpoint | GET and POST /api/memory/summary | `apps/web/app/api/memory/summary/route.ts` | Reads cached summary; writes a new one with CSRF, workspace access gate and rate limit |
| service | memory-summary-service | `apps/web/lib/services/memory-summary-service.ts` | Prompt, route admission, usage lease, parsing, 30-day cache |
| component | MemorySummaryCard | `apps/web/features/settings/components/MemorySummaryCard.tsx` | Web card with About you and Your preferences |
| schema | MemorySummaryResponseSchema | `packages/contracts/cloud-contracts/src/memory-summary.ts` | Shared shape and line limits |
| screen | Mobile Memory summary | `apps/mobile/app/(app)/settings/memory-summary.tsx` | On-device grouping of facts |
| service | summarizeMemoryFacts | `apps/mobile/src/features/memory/services/consolidation.ts` | Groups facts into pinned, learned, added by you |
| config | memory-summary rate limit | `apps/web/lib/rate-limit.ts` | 10 writes per hour |
| table | web_conversations / web_messages | `apps/web/lib/services/reflect-service.ts` | Source rows for Reflect |
| table | user_memories | `apps/web/app/api/memory/summary/route.ts` | Source rows for the summary |
| table | user_settings | `apps/web/lib/services/reflect-service.ts` | Holds the capabilities flags Reflect checks |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Summarise my memories; the card sends POST /api/memory/summary with a CSRF token. | device | apps/web/features/settings/components/MemorySummaryCard.tsx:199 |
| Server reads up to 200 active memories of the current workspace, pinned first. | our servers | apps/web/app/api/memory/summary/route.ts:29 |
| If memories exist, the workspace policy check decides whether managed compute is allowed. | our servers | apps/web/app/api/memory/summary/route.ts:79 |
| Server picks a utility route, reserves usage under memory_summary, and asks the model provider to write About and Preferences lines (low randomness, 600 output tokens, 30 second limit). | outside service | apps/web/lib/services/memory-summary-service.ts:180,200 |
| Reply is cleaned, deduplicated, capped at 6 lines per section and cached for 30 days under a fingerprint of the memories. | our servers | apps/web/lib/services/memory-summary-service.ts:35,80 |
| Reflect: the server reads user-owned chat rows for the range and computes counts, topics and the ongoing-work list in code, then returns it with no-store caching. | our servers | apps/web/lib/services/reflect-service.ts:277; apps/web/app/api/reflect/route.ts |
| Mobile Memory summary groups the facts already held in the app's memory store. | device | apps/mobile/app/(app)/settings/memory-summary.tsx:40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory summary text and generation time | Server key-value store, key prefix agi:memory-summary:, per user and fingerprint | Read by every web session of the account; not copied to other apps | Expires after 30 days; a changed memory set gives a new fingerprint so the old entry is no longer read (memory-summary-service.ts:35) |
| Reflect recap | Not stored; computed per request | No | Response header Cache-Control private, no-store (apps/web/app/api/reflect/route.ts) |
| Mobile memory groups | Computed in memory from the app's memory store | No | Gone when the screen closes |

**Models and providers.** The web summary uses a managed utility route chosen on the server (admitManagedCloudRoute, kind utility); the person cannot choose the model and no model name is fixed in this feature's code (memory-summary-service.ts:180). Reflect and the mobile Memory summary call no model that was found in their code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web card, web and mobile Reflect need a signed-in account (getUserScopedDb in both routes). Mobile Memory summary has no account requirement in Local mode (it reads the device store). |
| Permissions | Rows are read for the signed-in user and the active workspace only (route.ts readMemories; reflect-service.ts query). Workspace policy can refuse generation (route.ts:79). |
| Subscription | The summary write resolves the entitled plan tier and reserves usage under the memory_summary quota feature (route.ts; memory-summary-service.ts:28). Which plans are allowed is unknown. |
| Limits and metering | 10 summary writes per hour per rate-limit bucket (rate-limit.ts:287); 200 memories and 600 output tokens per write; Reflect reads at most 1000 chats (reflect-service.ts:16 MAX_REFLECT_CONVERSATIONS). |
| Feature flags | The capability flags memory and generateFromHistory in user settings gate Reflect (reflect-service.ts:65). No feature flag found for the summary card. |
| Model compatibility | Not applicable to the person's chosen chat model: the summary uses a server-chosen utility route. |
| Provider restrictions | Own-key (BYOK) provider keys are not used for the summary; the managed route is used (memory-summary-service.ts:180) [inferred]. Providers behind the route are not named in this feature. |
| Local mode | The mobile Memory summary works fully on the device in Local mode with no payment or sign-in need. The web summary and Reflect need our servers and an account, and Reflect reads managed cloud activity only (CloudReflectSection.tsx:241). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner labelled Loading your memory summary; Reflect shows Building your recap... | MemorySummaryCard.tsx (Spinner aria-label); ReflectSection.tsx:125 |
| Empty | Nothing is saved yet message; Reflect shows an honest empty recap, not praise | MemorySummaryCard.tsx:173; reflect-service.ts (no conversation activity yet branch) |
| Error and retry | Load error shows Try again; write error keeps the card usable and shows an alert | MemorySummaryCard.tsx (state.status error and writeError) |
| Memory off | Reflect returns 409 memory_required; web and mobile show Memory is off | route.ts:37; ReflectSection.tsx:137; reflect.tsx:251 |
| Timeout | Generation is cut off after 30 seconds and surfaces as service unavailable | memory-summary-service.ts (MEMORY_SUMMARY_TIMEOUT_MS); route.ts handleCreateSummary |
| Cancel and superseded request | Mobile Reflect aborts an in-flight request when the range changes or the screen closes | apps/mobile/__tests__/ReflectScreen.test.tsx:103,135 (test titles) |
| Offline | Mobile Reflect shows 'Check your connection and try again'; web card shows the load error. No offline cache for the web card | reflect.tsx:94; MemorySummaryCard.tsx |
| Accessibility | Card is a labelled region with aria-busy; Reflect charts expose text figures | MemorySummaryCard.tsx (aria-labelledby, aria-busy); ReflectSection.tsx:226 |
| Account or workspace switch | Hook binds the request to the admitted workspace owner and retires stale requests | apps/web/features/settings/hooks/use-reflect-recap.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/reflect-service.test.ts`: Recap aggregation, empty recap, memory and history gate, owner binding and exclusion of temporary and agent chats (test titles)
- `apps/web/lib/services/__tests__/reflect-withdrawal.test.ts`: Counts only kept turns and leaves out withdrawn chats (test titles)
- `apps/web/app/api/reflect/route.test.ts`: Owner-only load, query validation, memory-required response, 401 without session
- `apps/web/features/settings/sections/ReflectSection.test.tsx`: Real activity render, range refetch, refresh, memory-required state and its links, chart accessibility
- `apps/web/features/settings/hooks/__tests__/useReflectRecap.test.tsx`: Reflect hook behaviour
- `apps/web/app/api/memory/summary/route.test.ts`: GET cached summary, empty GET, POST generation at plan tier, workspace check skipped with no memories, failure message, CSRF refusal
- `apps/web/lib/services/__tests__/memory-summary-service.test.ts`: Parsing of the two sections, repeats and cap, fingerprint order and workspace sensitivity
- `apps/web/features/settings/components/__tests__/MemorySummaryCard.test.tsx`: Write only when asked, empty state, write failure keeps card usable
- `apps/mobile/__tests__/ReflectScreen.test.tsx`: Header, abort on new range and unmount, no publish of a superseded result
- `apps/mobile/__tests__/ReflectScreenPrivacyCopy.test.tsx`: Disclosure that recaps use chat titles and opening messages on the server
- `apps/mobile/__tests__/MemorySummaryScreen.test.tsx`: Facts under derived groups, count line, empty store, memory-off warning, Cloud boundary wording

**Test scenarios**

- **Write a web summary**
  1. Sign in on web with memory on and 3 or more memories.
  2. Open Settings, Memory.
  3. Press Summarise my memories.
  - Expected: About you and Your preferences lines appear, each at most 6, with an Updated date.
- **Summary goes stale after an edit**
  1. Write a summary.
  2. Edit one memory in the list.
  3. Reload the card.
  - Expected: The card shows it has not been summarised yet until Update summary is pressed.
- **Workspace separation of the summary**
  1. Switch to a workspace that has different memories.
  2. Open Settings, Memory.
  3. Write a summary.
  - Expected: Lines reflect only that workspace's memories, never the personal ones.
- **Reflect with memory off**
  1. Turn memory off in Settings, Memory.
  2. Open Reflect on web and on mobile.
  - Expected: Both show Memory is off with a link to memory settings; the API answers 409 memory_required.
- **Ongoing work rule**
  1. Have one chat that spans two days and one temporary chat with 5 messages.
  2. Open Reflect, range 30 days.
  - Expected: Only the two-day chat appears under Work in progress.
- **Mobile grouping offline**
  1. On mobile in Local mode switch to airplane mode.
  2. Open Memory, Memory summary.
  - Expected: Pinned, Learned from chats and Added by you groups show with a count footer.

**Where to look when it fails**

- Server log line '[memory-summary] generation failed', '[memory-summary] usage reservation refused', '[memory-summary] cache read failed' (route.ts; memory-summary-service.ts).
- HTTP 409 with error.code memory_required from /api/reflect.
- HTTP 429 from the memory-summary rate limit bucket.
- Tables user_memories, user_settings (settings.capabilities), web_conversations, web_messages.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)

## 10. Gaps and dependencies

- **No profile or preference summary on desktop (Tauri), mobile (Cloud mode), CLI, VS Code and Chrome** Affects: Desktop, mobile, CLI, VS Code, Chrome users. Evidence: Grep of apps/desktop/src, apps/mobile, apps/cli, apps/extension-vscode, apps/extension found /api/memory/summary only in web code. Work needed: Decide per app (mobile has a standing decision against it); add a card reusing the endpoint where wanted
- **Ongoing work is derived from chats, not memories** Affects: Brief item S39.09 and testers reading it. Evidence: reflect-service.ts:104,277. Work needed: Correct the brief wording or change the source
- **Desktop Tauri Reflect shows no Work in progress list** Affects: Desktop (Tauri build) users. Evidence: apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx. Work needed: Render recap.ongoingWork as web does
- **Docs say web shows no summary** Affects: Anyone reading the decision record. Evidence: docs/decisions/2026-09-27-founder-decisions.md:294 versus MemorySummaryCard.tsx. Work needed: Update the decision text and the brief
- **Mobile footer says Generated though nothing is generated by a model** Affects: Mobile users. Evidence: memory-summary.tsx footer text. Work needed: Reword
- **Free-plan access to summary writes is unverified** Affects: Free users on web. Evidence: route.ts:79 and admitManagedCloudRoute outcome not traced. Work needed: Trace admission for the Free plan and record it
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- SYS-execution-boundaries
- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- mode:local
- table:user_memories
- table:web_conversations
- table:web_messages
- table:user_settings
- api:GET /api/reflect
- api:GET /api/memory/summary
- api:POST /api/memory/summary
- file:apps/web/lib/services/memory-summary-service.ts
- file:apps/web/lib/services/reflect-service.ts

## Unknown

- Whether the Free plan may write a summary (admission result not traced).
- Whether production configures the key-value store the summary cache needs.
- Whether the Electron desktop build shows the web card (inferred from AGENTS.md, not run).
- Which provider and model the utility route picks at run time.
- No test run results exist in files; nothing here was run.

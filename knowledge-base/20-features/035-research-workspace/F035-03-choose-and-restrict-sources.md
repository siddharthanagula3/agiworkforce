---
id: "F035-03"
type: "feature"
title: "Choose and restrict sources"
aliases: ["Source selection", "Add a source", "Only this site", "Never this site", "My files", "Connected app", "research_sources", "allow_domains", "deny_domains", "S35.05", "S35.06", "S35.07", "S35.08", "S35.16"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.05", "S35.06", "S35.07", "S35.08", "S35.16"]
depends_on: ["F035-02", "F035-01", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:research_reports", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-03 Choose and restrict sources

On the plan card the person can limit a run to chosen sites, exclude sites, include their own indexed files and read connected apps. The server enforces site rules when each source is ingested and narrows them by workspace and agent rules. Web and mobile have it; adding sources to a running run is not built.

Area: [35. Research workspace](README.md). Requirement items: [S35.05](../../10-requirements/capabilities/035-research-workspace.md#s3505), [S35.06](../../10-requirements/capabilities/035-research-workspace.md#s3506), [S35.07](../../10-requirements/capabilities/035-research-workspace.md#s3507), [S35.08](../../10-requirements/capabilities/035-research-workspace.md#s3508), [S35.16](../../10-requirements/capabilities/035-research-workspace.md#s3516).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Sends research_sources (files, allow_domains, deny_domains, connectors) with the approved plan. The server filters every source against the site rules, searches the account's indexed files before the loop and reads chosen connected apps in the first gathering round [route.ts:624-633; research-loop.ts:855-880,3175].

**Why it exists.** People need to restrict where a report's evidence comes from; the experience contract says source controls are enforced, not just prompted (doc: docs/product/experience-contract.md:781).

**Who uses it.** Paid-plan people who want trusted sites only, or want their own documents and work apps in a report; API developers.

**Problems it solves**

- Untrusted sites in a report.
- Own documents ignored by web research.
- Admin site rules bypassed.

**Use cases**

- Only nature.com and who.int.
- Never a named blog.
- Include indexed files and a connected drive.

## 2. User experience

**Where to find it**

- Web and Desktop: 'Sources for this run' strip above the plan card while it waits; text 'Searching the whole web. Add a source to narrow it.' [ResearchActivity.tsx:690].
- Mobile: options block under the plan, with a files toggle, 'Only these sites', 'Never these sites' and 'Connected apps' [ResearchPlanOptions.tsx:272-299].

**Before you start**

- A plan waiting for approval.
- Connected apps only when the account has connected ones (option hidden otherwise) [ResearchActivity.tsx:757-760 region; WebChatPage.tsx:6172-6185].

**Screens and controls**

- Web: select 'Add a source' with the choices 'Only this site', 'Never this site', 'My files', 'Connected app'; a text box 'nature.com, who.int' (aria-label 'Site to add'); 'Choose an app' select; button 'Add'; chips (excluded shown as 'Never <site>') with a remove X [ResearchActivity.tsx:199-205,727-790].
- Domains split on space, comma or semicolon; any invalid token blocks the whole entry (Add stays disabled, aria-invalid) [ResearchActivity.tsx:173-196,417-423].
- Mobile: domain fields with remove buttons ('Remove <domain> from this research run'), connector checkboxes from useChatConnectorOptions [ResearchPlanOptions.tsx:150,212,296-316].

**Journey**

1. Wait for the plan card.
2. Add site rules, My files or connected apps.
3. Press Start research (web) or Approve plan (mobile).
4. The run reads only allowed sources; the report names a connected app that could not be searched.

**What the person sees and gets**

- Chips for each chosen source.
- Plan steps 'Search your connected apps' then one 'Search <app>' step per app, failed with a note when not read [research-loop.ts:2818-2900].
- Citations numbered the same for web, file and connected-app sources [research-loop.ts:855-880].

**Settings**

- Workspace web domain policy and agent site lists narrow the choice [request-processor.ts:5267-5290].
- Per-chat connector switches and temporary chats remove connectors [research-run-options.ts:46-63].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Request schema: files boolean, up to 32 allow and 32 deny domains, up to 8 connectors [request-processor.ts:727-736; research-sources.ts:19,149].
- Narrowing: workspace, then agent, then request; empty intersection is refused with 403 sites_outside_workspace_policy or sites_outside_agent_policy [request-processor.ts:931-973,5278-5290].
- Enforcement at ingestion in SourceAggregator.add; search backend also gets the policy [research-loop.ts:864-880,2650].
- File search: retrieval index, up to 12 files, failure returns empty and the run continues on the web [research-file-source-service.ts:29-60; research-sources.ts:20].
- Connected apps: up to 3 queries, 6 sources and 3 fetches per app; outcomes read, partial, failed, unsearchable, unavailable [research-connector-source-service.ts:17-19,119-168]; apps denied for the chat are dropped, and blocked apps refused [research-run-options.ts:46-63; route.ts:615-623].
- Mobile controls and request building [chatExecutionStore.ts:3413-3425].

**Incomplete**

- File sources and connector reads are added with chosenByReader true, so site rules do not filter them (by design, [inferred]) [research-loop.ts:864-866].
- Read connector results mark the run as holding sensitive and untrusted content, which makes later tool calls stricter [research-loop.ts:2890-2893].

**Present but disconnected or switched off**

- Brief marks mobile source rows missing; code shows mobile controls, so the brief is stale.

**Not available**

- Adding a source to a run already running: the UI offers sources only while the plan waits [ResearchActivity.tsx:459,680]; the steer box text 'Add a focus, a question or a source to cover' is free text guidance, not a source [ResearchActivity.tsx:589]. No endpoint found that adds a source (searched the run routes).
- CLI, VS Code, Chrome: no controls.

## 4. Required behaviour

**Established requirements**

- A panel lets the user choose which sources (web, sites, files, connected apps) a run may use. (source: brief S35.05)
- The user can restrict a run to or away from chosen sites and the run respects it. (source: brief S35.06)
- The user can add uploaded files as sources. (source: brief S35.07)
- The user can add connected work apps as sources. (source: brief S35.08)
- The user can add sources to a run that is already running (not built anywhere). (source: brief S35.16)
- Allowed source controls are enforced, not just included in a prompt. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. With allow_domains set, no citation comes from another domain.
2. A deny rule beats an allow rule.
3. An invalid domain is rejected before adding on web.
4. With My files on, an indexed document the person owns can appear in citations; with a failing index the run still completes on the web.
5. A connected app switched off for the chat is not read.
6. A request whose sites are outside the workspace allow list returns 403 sites_outside_workspace_policy.
7. A connected app with no search tool is named in the report as not searched.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- File and connector sources are exempt from site rules because the person picked them.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Allow adding a source during a pause and resume.
- [proposed] Show per-source outcome chips on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchActivity source picker | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Add a source UI, domain parsing, chips |
| hook | researchRunControls provider | `apps/web/features/chat/pages/WebChatPage.tsx` | Connected app options for the picker |
| hook | useChatStream research_sources | `apps/web/lib/hooks/useChatStream.ts` | Builds the research_sources body |
| other | research source helpers | `packages/contracts/types/src/research.ts` | addResearchSource, removeResearchSource, researchSourceRequest |
| schema | research_sources schema | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validation and domain narrowing |
| service | research-sources | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Domain policy, narrowing, file and connector prompts |
| service | SourceAggregator | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Enforces domain policy and numbers sources |
| service | searchResearchFileSources | `apps/web/lib/services/research-file-source-service.ts` | Searches the retrieval index for the question |
| service | readResearchConnectorSources | `apps/web/lib/services/research-connector-source-service.ts` | Reads connected apps through search and fetch tools |
| service | scopeResearchConnectors | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Drops connectors switched off for the chat |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Loads files and connector ids before the loop |
| table | retrieval index | `apps/web/db/neon/0202_retrieval_index.sql` | Index the file search reads |
| component | ResearchPlanOptions | `apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx` | Mobile source and deliverable controls |
| store | chatExecutionStore research_sources | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile request fields |
| test | ResearchActivity.sources tests | `apps/web/features/chat/components/research/ResearchActivity.sources.test.tsx` | Picker behaviour |
| test | research-sources tests | `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-sources.test.ts` | Domain rules and file source list |
| config | openapi research_sources | `apps/web/public/openapi.json` | Public contract for the fields |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Choices are read when Start is pressed and sent as research_sources. | device | ResearchActivity.tsx:808-815; useChatStream.ts:4601-4613 |
| Server narrows the site rules by workspace and agent policy or refuses. | our servers | request-processor.ts:5267-5290 |
| Server searches the person's indexed files before the loop. | our servers | route.ts:624-633 |
| Loop reads connected apps in round 1 through each app's search tool. | outside service | research-loop.ts:3175; research-connector-source-service.ts:79-168 |
| Each web result is checked against the site rules before it is kept. | our servers | research-loop.ts:864-866 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source selection | research_reports (sourceSelection) and client run state runConfig | server side | with the report and conversation |
| Connector and file content snippets | citations in the report row (snippets up to 1,200 characters per connector source) | server side | with the report |

**Models and providers.** Web search by the serving route's native search or the generic backend; connected apps by their own MCP search and fetch tools; file search by the retrieval index (semantic) [research-file-source-service.ts:36-45].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Connector tool permissions (allow, ask, deny) and per-chat switches decide which apps are read; temporary chats drop standing approvals; workspace and agent site rules limit sites [research-run-options.ts:46-63,150]. |
| Subscription | Connectors need a paid tier in the billing catalog (connectors: PAID_TIERS) [billing-catalog.ts:348]; research needs pro and above. |
| Limits and metering | Up to 32 site rules per list, 8 connectors, 12 file sources; connector reads are limited per app (3 queries, 6 sources, 3 fetches). |
| Feature flags | None specific. |
| Model compatibility | Not tied to a model. |
| Provider restrictions | Connector needs a deep-research style MCP server with a search tool (openapi.json:802). |
| Local mode | Cloud only. Files searched are the account's server-side index, not local device files. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid domain | Add disabled, no chip. | ResearchActivity.tsx:417-423 |
| Index failure | Empty list, log warning, run continues on web. | research-file-source-service.ts:46-52 |
| Connector search throws | Step marked failed with note; report told the apps could not be searched. | research-loop.ts:2835-2855 |
| Connector unsearchable or failed | Step failed with outcome note. | research-connector-source-service.ts:119,151 |
| Allow list outside workspace | 403 sites_outside_workspace_policy. | request-processor.ts:5278-5290 |
| Same source twice | Not added twice. | research-sources.ts / ResearchActivity.sources.test.tsx |
| No connected apps | Connected app option hidden. | ResearchActivity.tsx:739 |
| Accessibility | Selects and inputs have aria-labels; chips remove buttons are labelled. | ResearchActivity.tsx:735,771 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchActivity.sources.test.tsx`: Domain parsing, add, remove, exclude, connector option
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-sources.test.ts`: Domain policy, allow and deny, file source list
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-run-options.connectors.test.ts`: Connector switched off for chat, lockdown, temporary chat
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-domain-rules.test.ts`: Workspace and agent domain narrowing
- `apps/web/lib/services/__tests__/research-connector-source-service.dial.test.ts`: Connector source reading
- `apps/web/lib/services/__tests__/research-file-source-service.google-user-data.test.ts`: File sources and Google user data marking
- `packages/contracts/types/src/__tests__/research-sources.test.ts`: Source request helpers

**Test scenarios**

- **Allow list**
  1. Add 'Only this site' nature.com
  2. Start a run
  3. Open Sources
  - Expected: Every source is on nature.com or a subdomain
- **Deny beats allow**
  1. Allow example.com and deny www.example.com
  2. Run
  - Expected: No source from the denied host
- **Files**
  1. Index a document
  2. Add My files
  3. Run on a related question
  - Expected: A file appears in sources with the same numbering
- **Index failure**
  1. Break the index in a test environment
  2. Run with My files
  - Expected: Run completes on the web; warning logged
- **Workspace limit**
  1. Set a workspace allow list
  2. Send allow_domains outside it
  - Expected: 403 sites_outside_workspace_policy

**Where to look when it fails**

- Log '[research] file sources unavailable; the run continues on the web alone'.
- Log '[research-loop] connected apps could not be searched'.
- Error codes sites_outside_workspace_policy and sites_outside_agent_policy.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Cannot add sources to a running run** Affects: All apps. Evidence: sources UI only when plan waits (ResearchActivity.tsx:680); no endpoint. Work needed: Allow it while paused or via steer
- **Brief marks mobile missing though mobile has controls** Affects: Documentation. Evidence: ResearchPlanOptions.tsx:272-316. Work needed: Update the brief
- **Mobile has no My files label check or per-source outcome display** Affects: Mobile. Evidence: unknown depth of outcome display (not found). Work needed: Show outcomes
- **No CLI, VS Code, Chrome controls** Affects: Those apps. Evidence: no code. Work needed: Decide scope
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F035-02
- F035-01
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:research_reports
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-memory-projects-and-context

## Unknown

- Whether any other surface or endpoint can add sources to a live run (searched run routes and UI; none found).
- How mobile shows connector outcomes in the report.
- Which connector ids appear in the web picker beyond the connected list (derived in WebChatPage.tsx:6172).

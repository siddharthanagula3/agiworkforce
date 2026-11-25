---
id: "GAPS-AREA-093"
type: "gap-list"
title: "Gaps: Search, retrieval, and context components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 93. Search, retrieval, and context components

79 open gaps that touch this area. Area page: [20-features/093-search-retrieval-and-context-components](../../20-features/093-search-retrieval-and-context-components/README.md).

## CMP-C195

**Compact Instructions section that steers the summary**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: /compact accepts a focus argument, but instruction files are not read for a compaction section.
- Evidence: apps/cli/src/tui/tui_app.rs:7694; searched: Compact Instructions

## CMP-CP271

**Plans folder setting and plan file kept across compaction**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Plans save as files under the config folder, not configurable or re-injected after compaction Plans save as files under the config folder, not configurable or re-injected after compaction.
- Evidence: apps/cli/src/features/plan/plan_mode.rs:318

## CMP-CP37

**Control when conversation history is auto-compacted (window, threshold, off)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: There is no setting to move or turn off the threshold History compacts automatically at a fixed 80 percent of the window and /compact works by hand; there is no setting to move or turn off the threshold.
- Evidence: crates/agiworkforce-agent-core/src/context.rs:71; apps/cli/src/agent/chat.rs:1188

## CMP-DP63

**Automatic context compaction and manual compact**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: There is no command to compact on demand Long chats compact automatically with a marker, but there is no command to compact on demand.
- Evidence: packages/ui/unified-chat/src/components/CompactionMarker.tsx; apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts

## CMP-M28

**Automatic summarising of older messages in long chats**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: The chat only warns near the context limit and offers a fresh chat; the compaction helper is exported but never called (dead code).
- Evidence: apps/mobile/src/features/memory/services/contextBudgeter.ts:114; app/(app)/chat/[id].tsx:2554

## CMP-VP10

**Automatic compaction when the context fills, with settings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Thresholds and the summary prompt cannot be changed The engine compacts automatically at fixed fractions of the context window; thresholds and the summary prompt cannot be changed.
- Evidence: apps/cli/src/agent/chat.rs:1199; crates/agiworkforce-agent-core/src/context.rs:43

## CMP-VP68

**Instruction file size limit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: The limit cannot be changed Instruction files are cut at a fixed 10,000 tokens; the limit cannot be changed.
- Evidence: apps/cli/src/compaction.rs:10

## CMP-WP27

**Long chats are summarized automatically; oversized message error**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md), [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Is gated by a server switch, not a user-facing behavior Server compaction of long chats exists but is gated by a server switch, not a user-facing behavior.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38

## CMP-WP57

**Automatic context management for long chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: The chat shows no context-full notice or summary-and-continue prompt The server compacts long conversations, but the chat shows no context-full notice or summary-and-continue prompt.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts; searched: context window full in apps/web/features/chat

## GAP-AREA093-LW02

**Migration headers say NOT YET APPLIED for the retrieval index, the compaction and manifest columns, and the research cost column. The code depends on all of them. Applied state could not be checked here.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-093
- Detail: Area 93. Search, retrieval, and context components
- Evidence: apps/web/db/neon/0202_retrieval_index.sql:4; apps/web/db/neon/0164_memory_policy_and_context_compaction.sql:3; apps/web/db/neon/0252_context_manifests_and_source_policy.sql:5; apps/web/db/neon/0191_research_report_settled_cost.sql:3

## GAP-AREA093-LW03

**Migration 0282 header calls itself Migration 0280.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-093
- Detail: Area 93. Search, retrieval, and context components
- Evidence: apps/web/db/neon/0282_compaction_summary_coverage.sql:2

## GAP-AREA093-LW05

**Seven source classes declare no producer (producedBy is empty). The helper that lists them has no caller in the code I searched.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-093
- Detail: Area 93. Search, retrieval, and context components
- Evidence: packages/contracts/context/src/context-source.ts:325, 345, 365, 385, 405, 451, 471 (library_file, user_upload, connector_result, web_result, security_policy, template_instruction, local_repository_instruction); helper at context-source.ts:511

## GAP-AREA093-LW08

**A hard-coded search endpoint constant duplicates the host in the JSON registry. AGENTS.md section 4 says endpoints should come from the registry.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-093
- Detail: Area 93. Search, retrieval, and context components
- Evidence: apps/web/lib/web-search/web-search-tool.ts:37 and 263-264; apps/web/lib/web-search/web-search-providers.json:5

## GAP-AREA093-LW09

**The desktop Tauri build has its own search executor. It scrapes an HTML search page and calls a second search API directly, outside the provider list and the web search budget. I did not check its egress policy.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-093
- Detail: Area 93. Search, retrieval, and context components
- Evidence: apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs:290 and 443

## GAP-CAP-context-management-02

**Automatic summarising of older turns: Mobile never summarises. Web chat shows no context-full notice or summary-and-continue prompt (WP57). Behaviour for Local chats on Desktop and mobile is not established. Chrome not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Requirement items: S93.05
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-context-management-07

**What survives compaction: Plan not re-injected; no steering section; fixed instruction size cap.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Requirement items: S93.03
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-context-management-13

**What an attachment puts into the window: No page or code line found that tells the person a large file was only partly read.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md), [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Requirement items: S93.18, S93.19, S93.20, S93.21, S93.22, S93.23, S93.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-context-management-14

**Project knowledge retrieval when it exceeds the window: Project upload failed in the browser run (server error on a missing database column in that local setup). No visible sign of retrieval mode found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md), [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Requirement items: S93.02, S93.08
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-context-management-15

**Per-turn context selection and manifest: Manifest exists server side; no person-facing view found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md), [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Requirement items: S93.01, S93.02, S93.03, S93.04
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-context-management-24

**Past chats as context: Person-facing view not checked here.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Requirement items: S93.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F093-01-01

**Shared-project personal-source rule is never switched on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: Members of shared projects on web.. Work needed: Derive sharedProject from project sharing and pass it at each engine call; add a test through resolveInteractiveTurnContext.
- Evidence: engine.ts:130 reads actor.sharedProject; no caller sets it (turn-context-service.ts:181-185).

## GAP-F093-01-02

**Token budget, versions and overBudget are not used for chat turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: Web Cloud chat; manifests carry no token accounting.. Work needed: Pass the selected model's input budget and the version keys, or remove the unused fields.
- Evidence: turn-context-service.ts:179-196 passes neither budget nor versions; engine.ts:229-250.

## GAP-F093-01-03

**Manifest is not shown to the user and may be lost silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: All Cloud chat users and support.. Work needed: Decide whether a manifest is required evidence; add a read endpoint or screen and await or queue the write.
- Evidence: Write is void and only warns (turn-context-service.ts:199-206); no viewer found in the web code searched.

## GAP-F093-01-04

**Items of a refused class are still read from the database before being refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: Efficiency and privacy review on web.. Work needed: Check admission first and skip load for a refused class.
- Evidence: engine.ts:174 loads, then engine.ts:176 admits.

## GAP-F093-01-05

**Local, own-key, CLI, VS Code and Chrome turns have no equivalent manifest or shared engine.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome in Local and own-key mode.. Work needed: Decide if a device-side manifest is required; document the boundary.
- Evidence: apps/desktop/src/lib/context-precedence.ts:1-9; chatExecutionStore.ts:2800-2813.

## GAP-F093-01-06

**Whether migrations 0252 and 0284 are applied is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-01](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Detail: Affects: All manifest reads and writes.. Work needed: Check migration tracking for each environment.
- Evidence: Headers say NOT YET APPLIED (0252:4, 0284:4).

## GAP-F093-02-01

**Layer names in the brief differ from the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Affects: Anyone reading the brief; web.. Work needed: Update the brief or add 'workspace' and 'skill' layers if required.
- Evidence: S93.03 says system, workspace, project, user, skill; code says system, developer, project, personalized, memory, untrusted_context (instruction-precedence.ts:11-18).

## GAP-F093-02-02

**No runtime check on real turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Affects: Web Cloud chat.. Work needed: Assert the final prompt order per turn or in a guard.
- Evidence: Non-test users of instructionOrderProblems are lib/context/precedence.ts and study-session.ts only.

## GAP-F093-02-03

**Conflict table has no non-test caller.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Affects: Web.. Work needed: Use it where conflicts are reported, or remove it.
- Evidence: Search found resolveInstructionConflict only in the contract and the web re-export.

## GAP-F093-02-04

**Desktop keeps a hand-copied order.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Affects: Desktop Local and own-key turns.. Work needed: Share the contract with desktop or keep the guard test.
- Evidence: apps/desktop/src/lib/context-precedence.ts:1-9.

## GAP-F093-02-05

**No equivalent order for mobile, CLI, VS Code, Chrome Local turns was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-02](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Detail: Affects: Those apps.. Work needed: Establish what each app does and record it.
- Evidence: No matches in the searched folders.

## GAP-F093-03-01

**The brief says the user switch controls summaries; the code has only a server kill switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Affects: All users.. Work needed: Decide if a user switch is required and, if so, add it.
- Evidence: context-compaction.ts:38,59-62; no user setting found.

## GAP-F093-03-02

**Summary always uses a managed route, even if the chat is Local or own-key.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Affects: Local and own-key users on any app that reaches this path.. Work needed: Confirm which modes reach the path; add consent or a local route per AGENTS.md section 6.
- Evidence: context-compaction.ts:164-168.

## GAP-F093-03-03

**No indicator tells the person that earlier turns were summarized.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Affects: Web, desktop, mobile Cloud chats.. Work needed: Add a subtle notice if product wants it.
- Evidence: No UI string found; only a prompt note.

## GAP-F093-03-04

**Apply state of 0164 and 0282 not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Affects: All compaction.. Work needed: Check migration tracking.
- Evidence: 0282 header names itself 'Migration 0280' at line 2.

## GAP-F093-03-05

**Compaction on CLI, VS Code and Chrome extension not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Affects: Those apps.. Work needed: Check each app's own trimming.
- Evidence: No match found in their folders.

## GAP-F093-04-01

**Archived chats can be recalled on the keyword path and in the 2-hour unindexed window.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Detail: Affects: Web Cloud chat.. Work needed: Add coalesce(c.archived,false)=false to both queries and a test.
- Evidence: past-chat-context-service.ts:253-261,342-350 have no archive filter; sibling query has one at project-context-service.ts:248.

## GAP-F093-04-02

**Archive exclusion in the index depends on a migration marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Detail: Affects: Web.. Work needed: Confirm apply state per environment.
- Evidence: 0244 header line 3.

## GAP-F093-04-03

**Local mode on web has no past chats or project files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Detail: Affects: Web Local-model chats.. Work needed: Decide whether a Local source is required; keep consent rules.
- Evidence: turn-context-service.ts:433-437.

## GAP-F093-04-04

**CLI, VS Code and Chrome extension recall not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Detail: Affects: Those apps.. Work needed: Check each app.
- Evidence: No matches found.

## GAP-F093-04-05

**The person cannot see which past chats were used except citations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-04](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Detail: Affects: All Cloud chat users.. Work needed: Optional: show source list.
- Evidence: No viewer found.

## GAP-F093-05-01

**Dead-end after 5 failures for chats, library files, artifacts and reports.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Detail: Affects: Web users of search over those sources.. Work needed: Add retry or a periodic reset; or alert.
- Evidence: retrieval-index-service.ts:803-806; only project files have a retry control (KnowledgeFilesPanel.tsx:125).

## GAP-F093-05-02

**Index and embedding are Cloud-only, even for Local-mode content saved to Cloud.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Detail: Affects: Local users on web, desktop, mobile who also sync.. Work needed: Confirm Local content never reaches the index; document the boundary.
- Evidence: retrieval-embedding-service.ts:215-234.

## GAP-F093-05-03

**Embedding entitlement is evaluated as surface 'web'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Detail: Affects: Users of other apps whose content is indexed.. Work needed: Pass the real surface if rules differ.
- Evidence: retrieval-embedding-service.ts:226-234.

## GAP-F093-05-04

**0202 and 0244 not established as applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Detail: Affects: All indexing.. Work needed: Check migration tracking.
- Evidence: Headers at line 4 and 3.

## GAP-F093-05-05

**No on-device index for mobile or desktop Local search.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-05](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Detail: Affects: Mobile and desktop Local mode.. Work needed: Decide if a local index is required.
- Evidence: Mobile uses string search of stored chats (pastChatContext.ts:37-70).

## GAP-F093-06-01

**Archived exclusion for index search depends on a migration marked not applied; the search SQL itself has no archived filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Detail: Affects: Web, mobile history search.. Work needed: Confirm apply state or add the filter to the SQL.
- Evidence: retrieval-search-service.ts:266-273; 0244:3.

## GAP-F093-06-02

**Role and date filters switch off index results silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Detail: Affects: Web search dialog.. Work needed: Tell the person or apply the filters to the index.
- Evidence: route.ts:399-401.

## GAP-F093-06-03

**Brief says users do not run a search; they do through the web dialog and mobile history search.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Detail: Affects: Documentation.. Work needed: Treat it as a user feature.
- Evidence: GlobalSearchDialog.tsx:492-496.

## GAP-F093-06-04

**No Local or on-device hybrid search.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Detail: Affects: Mobile and desktop Local mode.. Work needed: Decide the local requirement.
- Evidence: pastChatContext.ts:109-117.

## GAP-F093-06-05

**No ranking quality evidence beyond unit tests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-06](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Detail: Affects: All.. Work needed: Build a labelled retrieval evaluation.
- Evidence: Tests use fixed fixtures (search-rank.test.ts).

## GAP-F093-07-01

**Persisted provenance loses the real provider and delivery of generic search results.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: Web, mobile, Chrome Cloud turns. Work needed: Emit provider_id and delivery on source frames or route results through webSearchSources.
- Evidence: assistant-turn-sources.ts:126-143 defaults; no writer of provider_id or delivery in tool-loop.ts or research-loop.ts

## GAP-F093-07-02

**Only one search provider adapter, so fall-through is untested in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: All Cloud search. Work needed: Add a second adapter or drop the unused claim.
- Evidence: web-search-providers.json:1-9

## GAP-F093-07-03

**Desktop internal build, CLI and VS Code use separate search code with different providers and no shared meter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: Tauri build, CLI, VS Code in Local. Work needed: Decide whether Local search should share the adapter list; document the boundary.
- Evidence: search_executor.rs:3; cli mod.rs:330-362

## GAP-F093-07-04

**Local-mode search on web and mobile is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: Local chat users. Work needed: Trace the local runtime and state the rule.
- Evidence: request-processor.ts:4876 comment; no Local search path found

## GAP-F093-07-05

**No explicit search control on the web composer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: Web users who want to switch search off for one chat. Work needed: Confirm the ambient design against docs/product/experience-contract.md 'Tool/research/search selector'.
- Evidence: ComposerPlusMenu.tsx:147-200 labels; ChatComposerNew.tsx:1690-1698

## GAP-F093-07-06

**Approval default for search is a pending founder decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-07](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)
- Detail: Affects: All Cloud users. Work needed: Founder decision, then copy and policy alignment.
- Evidence: docs/decisions/2026-09-10-managed-gateway-routes.md:36-58

## GAP-F093-08-01

**Provider-native fetch bypasses the platform address checks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-08](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)
- Detail: Affects: Cloud turns on routes with native fetch. Work needed: Decide policy and test; document that the provider reads the page.
- Evidence: request-processor.ts:2603-2620

## GAP-F093-08-02

**No fetch metering or document-specific limit found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-08](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)
- Detail: Affects: Cost on Cloud. Work needed: Confirm intended; add a meter if a cost exists.
- Evidence: tool-loop.ts:2730-2751

## GAP-F093-08-03

**Web Local-mode page reading is undefined.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-08](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)
- Detail: Affects: Local users. Work needed: Trace the local runtime.
- Evidence: request-processor.ts:4876 comment

## GAP-F093-08-04

**Three separate fetch stacks (server, CLI, internal Tauri) with separate address rules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-08](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)
- Detail: Affects: Security review. Work needed: Shared test vectors for the address rules.
- Evidence: cli mod.rs:39-300; search_tools.rs:439

## GAP-F093-09-01

**Freshness is computed and stored but not shown or used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-09](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)
- Detail: Affects: All apps. Work needed: Show it or tell the model, or remove it.
- Evidence: search-provider.ts:130-146; no consumer found

## GAP-F093-09-02

**Generic search dates likely persist as indexed time, so freshness is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-09](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)
- Detail: Affects: Web, mobile, Chrome persisted sources. Work needed: Map the date to the published field; add a test.
- Evidence: tool-loop.ts:1544; assistant-turn-sources.ts:138-143

## GAP-F093-09-03

**Weaker-delivery merge is not reached in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-09](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)
- Detail: Affects: Delivery honesty. Work needed: Wire webSearchSources or drop it.
- Evidence: web-search-tool.ts:484-491

## GAP-F093-09-04

**Three URL normalizers with different tracking lists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-09](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)
- Detail: Affects: Dedupe consistency between server and client. Work needed: One shared normalizer.
- Evidence: search-provider.ts:62; citationMarkers.ts:16-18; utils source-url (not read)

## GAP-F093-09-05

**Brief item 'relevance ranking' is evidence-based, not query-based.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-09](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)
- Detail: Affects: Result quality. Work needed: Decide if a query-match signal is wanted.
- Evidence: source-ranking.ts:67-76

## GAP-F093-10-01

**No grounding checker for chat or research.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-10](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)
- Detail: Affects: All Cloud answers. Work needed: Design and build claim-to-source verification and an uncertainty display.
- Evidence: brief S93.27; groundedness.ts only under support/agent

## GAP-F093-10-02

**Locator types: only page, heading, message id and offsets exist; no line, cell, slide, timestamp; no single registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-10](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)
- Detail: Affects: Project files, media, spreadsheets, decks. Work needed: Define the union and fill it during indexing.
- Evidence: project-file-citations.ts:12-19; search/types.ts:208-214

## GAP-F093-10-03

**PublicSourceLocator is never produced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-10](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)
- Detail: Affects: Deep Research reports. Work needed: Set locators when building citations.
- Evidence: research-loop.ts:1002-1010

## GAP-F093-10-04

**Redirect resolution covers two hosts only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-10](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)
- Detail: Affects: Other routing providers. Work needed: Extend the list when a new router appears (it must match the client list).
- Evidence: web-search-tool.ts:779-782

## GAP-F093-10-05

**Persisted citation identity may carry a placeholder provider.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-10](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)
- Detail: Affects: Provenance. Work needed: See F093-07 gap.
- Evidence: assistant-turn-sources.ts:103, 138

## GAP-F093-11-01

**Gaps, deliverable and source selection are not stored with the report.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Web and mobile when a report is reopened. Work needed: Add columns by a new numbered migration and map them.
- Evidence: research-report-service.ts:237-243

## GAP-F093-11-02

**Settled cost column status unknown; migration file says not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Report footer cost. Work needed: Check the migration log and fix the header.
- Evidence: 0191_research_report_settled_cost.sql:3

## GAP-F093-11-03

**0094 header says request-bound, which no longer matches the durable path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Engineers. Work needed: Update the comment.
- Evidence: 0094:20-24; route.ts:634-660

## GAP-F093-11-04

**Deep Research absent on CLI, VS Code and Chrome (declared).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Those apps. Work needed: Product decision.
- Evidence: surface-feature-matrix.md:277-279

## GAP-F093-11-05

**The internal Tauri orchestrator is separate code with its own gating (unknown).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Internal desktop build. Work needed: Confirm retirement or alignment.
- Evidence: orchestrator.rs:135-200

## GAP-F093-11-06

**Citations carry no locator; no grounding check on the report.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: All apps. Work needed: See F093-10.
- Evidence: research-loop.ts:1002-1010; brief S93.27

## GAP-F093-11-07

**No per-user cap on stored reports found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-11](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)
- Detail: Affects: Storage. Work needed: Decide retention.
- Evidence: none found in research-report-service.ts

## GAP-F093-12-01

**Feature not built on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F093-12](../../20-features/093-search-retrieval-and-context-components/F093-12-knowledge-graph-or-wiki.md)
- Detail: Affects: All six apps. Work needed: A product decision on whether to offer it, then a spec under docs/specs/.
- Evidence: brief S93.31 'Status: platform missing'; no code found

---
id: "COMP-research"
type: "competitor-trace"
title: "Deep research"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Deep research: competitors to requirements

Both leaders offer a plan-first, cited, multi-step research mode. ChatGPT adds editable plans, site limits, mid-run steering and PDF export. Claude adds a fixed research model, and Claude Code adds a claim-checking workflow. AGI has most of this on web, desktop and mobile. It lacks it on CLI, VS Code and Chrome. It also lacks conflicting-evidence display. No research run has been seen by a person.

**How the products divide this topic.** Claude (chat) research is documented on support.claude.com. Claude Code (code.claude.com) is a separate coding tool. It ships a bundled /deep-research workflow and web search and fetch tools; chat Claude uses the same /deep-research command name (ch05:55). ChatGPT deep research is documented on help.openai.com. Pages on learn.chatgpt.com describe Codex (the coding tool) and ChatGPT Work. Codex has web search modes, and the catalogue shows no standalone Codex research report. Plan limits: Claude Research is paid only (Pro, Max, Ultra, Team, Enterprise). ChatGPT deep research is limited on Free and Go, included on Plus, maximum on Pro; Enterprise and Edu have caps; Business, Enterprise and Edu use credits. All competitor evidence was reviewed 2026-11-22 from the catalogue only. AGI evidence is code reading, except web-search runs in the web scorecard.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-research-01](#cap-research-01) | Start a deep research run | yes | yes | partly built | code inspected only |
| [CAP-research-02](#cap-research-02) | Review and edit the research plan before it runs | unknown | yes | partly built | code inspected only |
| [CAP-research-03](#cap-research-03) | Clarifying questions before research | unknown | partly | unknown | not verified |
| [CAP-research-04](#cap-research-04) | Choose research sources: web, uploads, connected apps | partly | yes | partly built | code inspected only |
| [CAP-research-05](#cap-research-05) | Restrict research to chosen websites | unknown | yes | partly built | code inspected only |
| [CAP-research-06](#cap-research-06) | Research through connected apps (read-only) | yes | yes | partly built | code inspected only |
| [CAP-research-07](#cap-research-07) | Research on phones | partly | partly | partly built | code inspected only |
| [CAP-research-08](#cap-research-08) | Steer, pause, resume or cancel a run in progress | unknown | yes | partly built | seen failing by a person |
| [CAP-research-09](#cap-research-09) | Live progress and activity view | unknown | yes | built | code inspected only |
| [CAP-research-10](#cap-research-10) | Cited report with outline and full-screen reader | yes | yes | partly built | code inspected only |
| [CAP-research-11](#cap-research-11) | Export a research report | unknown | yes | partly built | code inspected only |
| [CAP-research-12](#cap-research-12) | Research history, reopen and rerun | unknown | partly | partly built | code inspected only |
| [CAP-research-13](#cap-research-13) | Research allowance, cost estimate and limits | partly | yes | partly built | code inspected only |
| [CAP-research-14](#cap-research-14) | Plan access for research | yes | yes | built | code inspected only |
| [CAP-research-15](#cap-research-15) | Which model runs research | yes | yes | built | code inspected only |
| [CAP-research-16](#cap-research-16) | Web search with citations | yes | yes | partly built | seen working by a person |
| [CAP-research-17](#cap-research-17) | Citation display and sources panel | yes | yes | partly built | seen failing by a person |
| [CAP-research-18](#cap-research-18) | Claim cross-checking in research | yes | unknown | not built | not verified |
| [CAP-research-19](#cap-research-19) | Delegated and parallel research agents | yes | unknown | unknown | not verified |
| [CAP-research-20](#cap-research-20) | Page fetch and reading a pasted link | yes | unknown | built | code inspected only |
| [CAP-research-21](#cap-research-21) | Search modes cached, live and off for coding tools | yes | yes | partly built | not verified |
| [CAP-research-22](#cap-research-22) | Research inside projects | yes | yes | unknown | seen failing by a person |
| [CAP-research-23](#cap-research-23) | Company knowledge across connected tools | yes | yes | not built | not verified |
| [CAP-research-24](#cap-research-24) | Admin controls for research and web access | partly | yes | partly built | code inspected only |
| [CAP-research-25](#cap-research-25) | Proactive read-only research | unknown | yes | not built | not verified |
| [CAP-research-26](#cap-research-26) | Completion notice and scheduled research | unknown | unknown | partly built | code inspected only |
| [CAP-research-27](#cap-research-27) | Report to interactive page and other outputs | unknown | unknown | partly built | code inspected only |
| [CAP-research-28](#cap-research-28) | Specialist research: science, clinical and shopping | yes | yes | not built | not verified |

## CAP-research-01 Start a deep research run

A visible entry point that switches a message into a multi-step research run that searches, reads and writes a cited report.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): A plus-menu Research toggle makes Claude run chained multi-step searches over the web and enabled connectors and produce a cited report; needs web search on. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Type /deep-research or choose Research under the plus button; Claude searches the web automatically when helpful, with no toggle. Plans: rolling out. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Three entry points: typing /Deepresearch, choosing Deep research in the + tools menu, or from the sidebar menu. Plans: Varies by plan; limited on Free and Go, included on Plus, maximum on Pro (https://chatgpt.com/pricing). Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md line 340 lists a tool/research/search selector). Every app that can reach AGI servers offers a clear Deep research entry in the composer. It starts a research run, not a normal chat turn.

**With different models, providers and the one subscription.** Any model that passes the research capability check can run it. Entitlement comes from the one AGI Subscription capability check. In Local mode the entry says research needs AGI servers and never silently sends a Local chat to the cloud; a Local-to-cloud move is an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done (shows the hosted web app), mobile done; CLI, VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S12.11, S13.33, S35.01
- Comparison list ids: C264; rows without an id: web row 'Plus menu: Research toggle' (no list_id); web row 'Deep research mode' (no list_id); mobile row 'Deep research for long reports' (no list_id)
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1305`; `apps/web/app/api/llm/v1/chat/completions/route.ts:561-568`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1235`

**Gap.** No entry on CLI, VS Code or Chrome. Free users are denied by the capability handshake. Local-mode behaviour of the toggle was not confirmed in code.

**Acceptance criteria**

1. On web, desktop and mobile, a signed-in paid user sees Deep research in the composer and a run starts from it.
2. A Free user sees one upgrade message and no run starts.
3. Signed out or in Local mode, the toggle states that research needs AGI servers and sends nothing to the cloud without consent.
4. The run uses the model the user picked when it is research-capable.

**Verification: code inspected only.** Ledger S35.01 done for web, desktop, mobile from code. 5-results/web/results.csv has blank results for S35.01. No scorecard or defect row covers a research run.

## CAP-research-02 Review and edit the research plan before it runs

Before searching, the product shows the planned steps and lets the user edit them, then approve.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Describe the outcome, review and edit a proposed plan, follow progress and interrupt to change focus or sources; yields a cited report. Plans: Varies by plan. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 10, 2026: limit research to chosen websites and connected apps, edit the plan beforehand, adjust direction while running, view fullscreen report from a sidebar entry. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (W08 Research: review the plan before approved work begins; cancellation stops new side effects)). Show an editable plan before any search or paid work begins. Cancelling at the plan stops all side effects.

**With different models, providers and the one subscription.** Plan drafting uses the selected research-capable model, so it works across providers. No quota is charged until the user approves. Local mode: not offered because the run needs servers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done, mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.02, S35.04
- Comparison list ids: none matched; rows without an id: web row 'Research plan review before it runs' (no list_id); mobile row 'Review the research plan and answer questions first' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchPlan.tsx:108`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2023`; `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:191`

**Gap.** Objective and deliverable choice (S35.02) is missing on mobile. Nothing on CLI, VS Code, Chrome.

**Acceptance criteria**

1. Start a run and see the plan before any search happens.
2. Edit, add and remove a step, approve, and see the run follow the edited steps.
3. Cancel at the plan and confirm no usage was charged and no search ran.

**Verification: code inspected only.** Not tested by a person; no row in the scorecards or defects file.

## CAP-research-03 Clarifying questions before research

The product asks the user short questions to narrow the task before it starts researching.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 24, 2025: shopping research uses clarifying questions, deep research and memory for a personalized buyer's guide. The catalogue does not describe clarifying questions for general deep research. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (proposed; source: checklist item 82 in docs/product/competitive-guidance.md; no project document requires it). A run may ask clarifying questions before searching, and the user can skip them.

**With different models, providers and the one subscription.** Questions come from whichever research-capable model is chosen. Asking costs no research quota until the run is approved.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Ledger S35.03 says missing on all six apps. The comparison file says web is the same as ChatGPT (ResearchPlan.tsx:23-24), so the two sources disagree. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.03
- Comparison list ids: none matched; rows without an id: web row 'Clarifying questions before research' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchPlan.tsx:19-27`

**Gap.** Ledger and comparison disagree; the code was not re-read to settle it. Mobile has a plan-options component that may cover it.

**Acceptance criteria**

1. A vague request produces questions before searching.
2. Skipping the questions still starts the run.
3. Answers appear in the plan.

**Verification: not verified.** Ledger and comparison contradict each other and no person has run it.

## CAP-research-04 Choose research sources: web, uploads, connected apps

The user picks which sources a run may use, such as the open web, uploaded files and connected apps.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research searches the web and enabled connectors; it needs web search on. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Defaults to public web and uploaded files; supported connected apps (for example Google Drive, SharePoint) read-only; Sites > Manage sites can restrict to given domains or prioritize them. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (allowed source controls are enforced, not just included in a prompt)). Before and during a run, the user chooses web, uploaded files and connected apps. The server enforces the choice; a prompt hint is not enough.

**With different models, providers and the one subscription.** The source filter is applied by AGI code, so it holds for any model or provider. Connected-app reads are cloud work and need the user's connection. In Local mode files stay on the device and web and app sources are unavailable, with that stated.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done; mobile missing; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S10.16, S35.05, S35.07, S35.08, S9.03
- Comparison list ids: WP178, WP80; rows without an id: web row 'Restrict or prioritise sites for research' (no list_id)
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:5037`; `apps/web/app/api/llm/v1/chat/completions/route.ts:624,661`; `apps/web/lib/services/research-connector-source-service.ts:119`; `apps/web/lib/services/research-file-source-service.ts:6`

**Gap.** Comparison marks connected-app research as Partial (WP80, WP178); the exact missing part was not read. Mobile has no source panel.

**Acceptance criteria**

1. Turn off uploads and connected apps and confirm the run reads only the web.
2. Add an uploaded file and see it cited in the report.
3. Disconnect an app and see the run say it was skipped.
4. Try to bypass the choice with a prompt and confirm the server still refuses the excluded source.

**Verification: code inspected only.** No person has run it. Web defect W-11: project file upload and Add text source both failed with a generic error for the Ultra test account, which blocks file-based checks.

## CAP-research-05 Restrict research to chosen websites

The user limits a run to named sites or tells it to prefer them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Sites > Manage sites can restrict to given domains or prioritize them. Apps: web.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Focus on chosen websites and connected apps, redesigned sidebar entry, create and edit the plan, adjust mid-run, fullscreen report view. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (allowed source controls are enforced)). A run can be limited to, or steered towards, chosen domains and the run must obey it.

**With different models, providers and the one subscription.** Enforced in AGI search code, so independent of model and provider. Local mode: no web access, so the control is hidden.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done; mobile missing (M44); CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.06
- Comparison list ids: M44; rows without an id: web row 'Restrict or prioritise sites for research' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchActivity.tsx:146`; `apps/web/app/api/llm/v1/chat/completions/route.ts:538`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:637`

**Gap.** Mobile has no site restriction.

**Acceptance criteria**

1. Restrict to one domain and confirm every cited source is on it.
2. Exclude a domain and confirm it never appears.
3. An unreachable allowed site is reported, not replaced silently.

**Verification: code inspected only.** Ledger S35.06 done from code; no human run.

## CAP-research-06 Research through connected apps (read-only)

Research reads data from apps such as Drive, Gmail, Slack or GitHub that the user connected, and cites it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): During research Claude calls enabled connector tools automatically, including Gmail, Calendar and Docs. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Research runs connector tools without approvals so write tools should be disabled. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): Deep research can use Drive, SharePoint, Dropbox, Box, Outlook, Gmail, Calendar, Linear, GitHub, HubSpot and Teams; Drive sync gives semantic search with admin scoping. Plans: Business, Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt): Deep research can use custom apps for read/fetch actions but not write actions. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md line 175 says connected apps can take part in search and deep research subject to plan, region, role, workspace, interface, route and connection policy). Research may read connected apps the user enabled for the run, and must never run write actions. Each source is cited.

**With different models, providers and the one subscription.** Connector calls are made by AGI harness code, not the model, so any provider works. They count against the one subscription meter. Local mode: connectors are cloud-side, so a Local chat cannot use them without an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done; mobile missing. Comparison rates it Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.08
- Comparison list ids: W209, WP178, WP78, WP80
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2445`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2812-2842`; `apps/web/lib/services/research-connector-source-service.ts:132`

**Gap.** It was not shown that write tools are blocked in research. Comparison says Partial and the exact shortfall was not read.

**Acceptance criteria**

1. Enable one connector, run research, and see its documents cited.
2. Check the run's tool log: no write tool call occurred.
3. Disable the connector and confirm the run cannot read it.
4. Revoke the connection mid-run and see a clear skipped-source notice.

**Verification: code inspected only.** No person has run connected-app research.

## CAP-research-07 Research on phones

What research does on phones: whether the web-only or full set of sources is used.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research started in the mobile app searches the web only without error; use web or Desktop to include connectors, and local MCP servers are never used. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Plan, sources and cited report are listed for web, ios and android; the catalogue does not say whether mobile uses connectors. Plans: Varies by plan. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor behaviour is a silent skip on Claude; AGI's own explicit-boundary requirement). If a phone run uses fewer sources than the web, it says which sources were left out. It never skips them silently.

**With different models, providers and the one subscription.** Same server run for every model and provider. Mobile Local chats do not run research.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: plan, progress, reports, history, rerun and cancel done; sources panel, steering, site limits missing. Export conflicts between ledger and comparison. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.05, S35.08, S35.15, S35.28
- Comparison list ids: M43, M44, MP88
- Code: `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:191`; `apps/mobile/src/features/research/ReportsScreen.tsx:499`; `apps/mobile/stores/chat/chatExecutionStore.ts:1742`

**Gap.** Mobile lacks source choice, site limits and steering (M43). Ledger says no export; comparison says export exists at ReportsScreen.tsx:499.

**Acceptance criteria**

1. Start research on a phone and see the list of sources used.
2. If a source type is unavailable on phone, a visible note says so.
3. Open the same report on web and see the same sources.

**Verification: code inspected only.** No mobile research run in this evidence set was seen by a person.

## CAP-research-08 Steer, pause, resume or cancel a run in progress

While a run works, the user adds guidance, pauses, resumes or cancels without starting over.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 5, 2025: for deep research or Pro runs, click update in the sidebar and send new info without restarting. Apps: web.
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Follow progress and interrupt to change focus or sources. Plans: Varies by plan. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (cancellation stops new side effects; resume an interrupted report without rerunning completed actions unnecessarily)). A running run accepts new guidance and changes course. Cancel stops new side effects. An interrupted run resumes without redoing completed actions.

**With different models, providers and the one subscription.** Steering text goes through the same safety gate as any prompt. Quota already spent stays visible, and cancel stops further charges.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Steering: web and desktop done, mobile missing (M43). Pause and resume, and cancel: web, desktop, mobile done. Adding sources while running (S35.16) missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.15, S35.16, S35.17, S35.18
- Comparison list ids: M43; rows without an id: web row 'Interrupt or steer research while it runs' (no list_id); web row 'Add context to a running deep research' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchActivity.tsx:437,501`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:549`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2141,2349`

**Gap.** No steering on mobile; no add-source during a run. A seen defect shows stopping a web-search turn leaves mixed status text.

**Acceptance criteria**

1. During a run, send new guidance and see the steps change.
2. Pause, close the app, reopen, resume, and see completed steps not repeated.
3. Cancel and confirm no further searches or charges occur.
4. After cancel, one clear state is shown, not contradictory rows.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-5 free, minor: stopping a search mid-turn showed 'Search stopped', 'Search limit reached' and 'Response stopped.' together. That was a web-search turn, not a research run.

## CAP-research-09 Live progress and activity view

A view of the run's phase, searches, sources and time while it works.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Fullscreen report with table of contents, sources used and activity history; downloadable as Markdown, Word or PDF. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 85 (progress, visited sources, no fabricated activity)). Show phase, search and source counts, elapsed time and a timeline of steps, with no invented activity.

**With different models, providers and the one subscription.** Progress comes from AGI harness events, not model claims, so it is the same for any provider.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.09, S35.10, S35.11
- Comparison list ids: none matched; rows without an id: web row 'Deep research report view with outline, sources and downloads' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchActivity.tsx:282,467`; `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:59,194`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1585`

**Gap.** none known in code; not confirmed by a person.

**Acceptance criteria**

1. Counts and time update during a run.
2. Every listed step matches a real tool call in the log.
3. The view survives a page reload mid-run.

**Verification: code inspected only.** No person has seen a run.

## CAP-research-10 Cited report with outline and full-screen reader

The finished report opens in a reader with title, summary, sections, linked citations and a source list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research produces a cited report from chained multi-step searches. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Fullscreen report with table of contents, sources used and activity history. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (W08)). Every factual claim in a report has supporting evidence or an explicit uncertainty note, and each citation resolves to the supporting material.

**With different models, providers and the one subscription.** Report building and citation linking run in AGI code, so the contract holds for any model; a weaker model may return fewer claims but may not drop the citation rule. Reports are stored under the one account and counted by the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done for reader, outline, linked citations, tables and charts, findings per question. CLI, VS Code, Chrome missing. Contradictory evidence (S35.14) and supporting attachments (S35.24) missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.12, S35.13, S35.14, S35.20, S35.21, S35.22, S35.23, S35.24, S4.32, S7.16
- Comparison list ids: none matched; rows without an id: web row 'Saved research reports gallery and table of contents' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchReportView.tsx:649,615,340`; `apps/web/lib/services/research-report-service.ts:213`; `apps/mobile/src/features/research/ReportsScreen.tsx:140,226,250`

**Gap.** No conflicting-evidence display; no attachments; no CLI, VS Code or Chrome reader.

**Acceptance criteria**

1. Open a finished report and click every citation; each opens its source.
2. The outline jumps to each section.
3. A claim without support is marked uncertain.
4. A report made on web opens on mobile with the same sources.

**Verification: code inspected only.** No report has been opened by a person in the supplied results.

## CAP-research-11 Export a research report

Download a finished report as Markdown, Word or PDF with citations kept.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Share icon > Download as PDF yields formatted reports with tables, images and linked citations, for new and past reports. Apps: web.
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Downloadable as Markdown, Word or PDF. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (export and reopen the report with sources intact)). A report exports to common formats and the export keeps citations and the source list.

**With different models, providers and the one subscription.** Export is file work in AGI code, so it needs no model and works for any provider. On desktop and mobile the file is written on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done; mobile ledger says missing while comparison says present; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.28, S36.25
- Comparison list ids: none matched; rows without an id: web row 'Export a research report as Markdown, Word or PDF' (no list_id); mobile row 'Export a research report' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchReportView.tsx:133-137,273,377`; `apps/mobile/src/features/research/ReportsScreen.tsx:499`

**Gap.** Mobile ledger and comparison disagree. Citation-preserving export is missing on mobile (S36.25).

**Acceptance criteria**

1. Export to each format and open it; citations and the source list are present.
2. Reopen the exported report in the app and see the same sources.
3. Export a past report, not only a new one.

**Verification: code inspected only.** No human export check on file.

## CAP-research-12 Research history, reopen and rerun

A list of past reports that can be reopened, plus refresh or rerun.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): Legacy deep research mode was removed; current deep research and past results remain. Plans: All plans.

**AGI requirement** (inferred; source: competitor parity for reopening; refresh and rerun is an AGI addition). Past reports are listed and reopen with their sources. A finished report can be refreshed or rerun.

**With different models, providers and the one subscription.** Reports belong to the account and sync across apps. A rerun is a new metered run under the one subscription and may use a different model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done for history, rerun and partial report; CLI, VS Code missing; Chrome unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.19, S35.25, S35.26, S4.32
- Comparison list ids: none matched; rows without an id: web row 'Saved research reports gallery and table of contents' (no list_id); mobile row 'Deep research reports list' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchReportsGallery.tsx:106`; `apps/web/app/api/research/reports/route.ts:48`; `apps/mobile/src/features/research/ReportsScreen.tsx:222`

**Gap.** Comparing report revisions (S35.27) is missing.

**Acceptance criteria**

1. Finish a report, sign in on another app, and reopen it.
2. Rerun a report and see it as a new entry.
3. A cut-short run opens as a partial report labelled partial.

**Verification: code inspected only.** No person has reopened a report.

## CAP-research-13 Research allowance, cost estimate and limits

Show how many research runs or credits are left, and warn about cost before starting.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research follows normal limits but consumes them faster because of many sources. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Credits cover chat and Claude Code terminal use combined, Research mode overage, and all tokens including project files. Plans: Pro, Max, Ultra. Apps: cli, web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): In-product counter shows remaining tasks; fixed monthly allowances reset 30 days after first use; availability varies by country. Plans: Varies by plan. Apps: web.
  - [https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing](https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing): Deep research 50 credits per task; Edu gets 5 deep research queries per rolling 24 hours. Plans: Business, Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md line 207 (deep research meters provider search cost by the existing policy; limits are config)). Research allowance and cost come from the one AGI Subscription system. Each app shows remaining allowance before a run starts and warns when a run is large. Limits are configuration, not constants. Free users see only an Upgrade prompt, not meters.

**With different models, providers and the one subscription.** Cost is metered from real provider usage, so any model or BYOK route is priced the same way. Local mode costs no AGI usage but cannot run research.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, desktop done; mobile missing; CLI, VS Code, Chrome missing. Web has a cost-estimate component the leaders do not show in this catalogue. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.34, S82.05, S82.09
- Comparison list ids: W35; rows without an id: web row 'Cost estimate before research' (no list_id); web row 'Credit rates shown per model, agent, research and voice' (no list_id)
- Code: `apps/web/features/chat/components/research/ResearchActivity.tsx:474`; `apps/web/features/chat/components/research/ResearchCostEstimate.tsx`; `apps/web/app/api/llm/v1/chat/completions/route.ts:677,775`

**Gap.** Comparison W35 says the counter of runs left is Missing while ledger S35.34 says done; they conflict. Mobile has no allowance view.

**Acceptance criteria**

1. A paid user sees the remaining allowance before starting.
2. A large run shows an estimate and asks to confirm.
3. After the allowance is gone, a clear message appears and no run starts.
4. Free users see Upgrade only.

**Verification: code inspected only.** Ledger E009 (BLOCKED): the Free account usage page showed only waitlist text. No paid meter was seen.

## CAP-research-14 Plan access for research

Which plans include research.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): Research is paid only; artifacts, connectors, voice, web search and memory are on every plan. Plans: Free, Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Deep research by plan: limited on Free and Go; included on Plus; maximum on Pro. Apps for deep research limited on Free and Go, full on Plus and Pro. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-11 (Research on Pro, Max, Team and Enterprise; server refuses what the document denies)). Research access comes from the capability document; every app reads it and the server refuses a request the document denies.

**With different models, providers and the one subscription.** One capability check for every app and provider. Owner decisions say no subscription sales before 2027-01-01, so research is effectively gated off for Free today.

**Current implementation, as this trace read it on 2026-11-24: built.** Web gate and server refusal present; other apps read the same handshake. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `packages/contracts/cloud-contracts/src/capability-handshake.ts:57`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1621-1624`; `apps/web/app/api/llm/v1/chat/completions/route.ts:567`

**Gap.** The decision was based on Claude only because ChatGPT pages were not readable then. The 2026-11-22 catalogue shows ChatGPT gives Free a limited allowance; the owner has not revisited it.

**Acceptance criteria**

1. A Free account cannot start research; the server refuses a hand-made request.
2. A paid account can.
3. Changing the capability document changes all apps without a code edit.

**Verification: code inspected only.** No gate test was run by a person in this evidence set.

## CAP-research-15 Which model runs research

Whether the user's chosen model is used for research, or the product fixes one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research ignores the chat's chosen model and runs on a fixed top model with a fallback; Team and Enterprise members whose admin disabled both models cannot use research. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Runs on the latest model by default; users may pick a legacy model. Apps: web.

**AGI requirement** (stated requirement; source: model agnostic and provider agnostic requirements in the task brief; the gate itself is project code). Research works with any model that declares the research capability, or a tool-capable model with a large enough context window. The user sees which model ran it.

**With different models, providers and the one subscription.** This is the model-agnostic rule itself. Capability data comes from the generated model catalog, never a literal ID in code. A local model qualifies only if it declares the capability, and a Local chat still does not run the cloud loop.

**Current implementation, as this trace read it on 2026-11-24: built.** Web gate built; mobile checks selected model capability. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.32, S17.36, S79.10
- Comparison list ids: none matched; rows without an id: web row 'Which model deep research runs on' (no list_id)
- Code: `apps/web/features/chat/lib/research-capability-gate.ts:1-11`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1616`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:231-233`

**Gap.** The context threshold is a constant in code (500,000); the project says limits should be configuration. Not checked against the catalogue guard.

**Acceptance criteria**

1. Pick a research-capable model and run research; the report names the model.
2. Pick a model without the capability and see research disabled with the reason.
3. Change the catalogue entry and see the gate follow without a code edit.

**Verification: code inspected only.** research-capability-gate.test.ts exists; no human run.

## CAP-research-16 Web search with citations

The assistant searches the live web and answers with inline citations and a source list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Claude searches the live web, shows a searching indicator and answers with citations, links and quotes. Plans: All plans. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research](https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research): Web search suits quick lookups of one or two calls; research suits five-plus-call reports over one to three minutes. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Available to signed-out users and every plan within usage limits; auto-triggered or via Search or / in the composer; inline citations, a Sources list and maps on iOS and Android. Plans: All plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md line 205 (search allowance by plan, config driven)). Search runs automatically when useful, can be forced from the composer, and shows inline citations and a sources list. Free gets 20 included searches per 30 days and paid chat 300; limits stay configuration.

**With different models, providers and the one subscription.** Search is an AGI tool, not a model feature, so any provider can use it. It meters under the one subscription. Local mode has no live web and must say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; Chrome has sources list; CLI and VS Code have search tools (partial). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S36.01, S36.04
- Comparison list ids: C79, CP44, VP16, VP47; rows without an id: web row 'Automatic web search with citations' (no list_id); web row 'Force a search from the composer' (no list_id)
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1592-1611`; `apps/cli/src/features/exec/tools/web/mod.rs:330-360`; `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:915-919`

**Gap.** Missing per comparison: location-aware search (W99), image results (W93), structured live answers (W94), search by image (W98), index-served search (W101).

**Acceptance criteria**

1. Ask a current-facts question and get cited sources without toggling.
2. Force a search from the composer and see the search activity.
3. Hit the allowance and see a clear limit message.
4. In Local mode, the app says live web is unavailable.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-5 (free and subscribed, status partial): search triggered automatically and showed 'Searched the web · 5 sources'. Defects are listed under the citation capability.

## CAP-research-17 Citation display and sources panel

Inline citation chips, a sources list with titles, and hover previews.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Answers carry citations, links and quotes; image results show source links. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Inline citations with hover preview on desktop web, a Sources list, image sources, and maps. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md line 781 (citations resolve to the material supporting the claim)). Each claim carries a marker that identifies its source; the source shows title, site, URL and date when known; unavailable sources are marked.

**With different models, providers and the one subscription.** Citation structure is produced by AGI code from tool results, so it is uniform across models. Local files can be cited with a local path.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done for marker, title, publisher, URL, dates, excerpts, unavailable notice. CLI has URL only. Line, cell, slide, time locators, conflicting sources, restricted and stale notices, correction and replacement: missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S36.01, S36.02, S36.03, S36.04, S36.05, S36.06, S36.08, S36.16, S36.17, S36.18, S36.19, S36.20, S36.21, S36.22, S36.23
- Comparison list ids: W77; rows without an id: web row 'Citations with hover preview and a sources list' (no list_id); web row 'Sources panel and hover citation previews' (no list_id)
- Code: `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`; `apps/web/features/chat/components/messages/MessageBubble.tsx:244,3853`; `apps/mobile/src/features/chat/components/MarkdownInline.tsx:36`

**Gap.** Seen defects: a raw '[7]' marker left in the answer text; chips showing only the domain; duplicate entries and section names as titles in the Sources panel ('Iana', 'References'); favicons requested from a third-party service.

**Acceptance criteria**

1. Every citation chip opens a distinct source with a real page title.
2. No raw marker text remains in the answer.
3. Two chips for the same page appear once.
4. Favicons load without calling an outside service.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-5: raw '[7]' marker (subscribed, minor); Sources panel 'MORE' header, duplicates and poor titles (free, cosmetic); chips show only domain (free, cosmetic); favicons fetched from a third-party service (subscribed, cosmetic).

## CAP-research-18 Claim cross-checking in research

The research workflow tests each claim across sources and drops or flags the ones it cannot support.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/workflows.md](https://code.claude.com/docs/en/workflows.md): Bundled /deep-research workflow fans out web searches across angles, fetches and cross-checks sources, votes on each claim and returns a cited report with refuted claims dropped; unverifiable claims are listed as unverified. Needs the WebSearch tool. Plans: All paid plans, API, Bedrock, Google Cloud Agent Platform, Foundry. Apps: cli, desktop, ide.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity with the Claude Code workflow and checklist item 84 in docs/product/competitive-guidance.md (conflicting evidence, uncertainty)). A research report distinguishes supported, refuted and unverified claims, and shows conflicting sources side by side.

**With different models, providers and the one subscription.** Voting across several model calls multiplies cost, so it must be metered under the one subscription and shown in the cost estimate. A different model may do the checking pass.

**Current implementation, as this trace read it on 2026-11-24: not built.** Conflicting-evidence display is missing on all six apps. The CLI has no /deep-research command. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.14, S36.18
- Comparison list ids: C264, D25
- Code: `searched: deep-research in apps/cli/src, only plan text (comparison C264)` (not found); `searched: citation check, factCheck in apps/web/features/chat/components/artifacts/review (comparison D25)` (not found)

**Gap.** No claim voting, no unverified list, no side-by-side evidence. The reviewer that flags wrong citations (D25) is missing.

**Acceptance criteria**

1. A report lists claims it could not verify.
2. Two sources that disagree are shown together.
3. Refuted claims do not appear as facts.

**Verification: not verified.** Not built per ledger; nothing to test.

## CAP-research-19 Delegated and parallel research agents

Splitting a research job across several helper agents and merging the results.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/sub-agents.md](https://code.claude.com/docs/en/sub-agents.md): Documented patterns: isolate high-volume output, run parallel research subagents, chain subagents in sequence; many detailed results consume main context. Apps: cli, ide, desktop.
  - [https://code.claude.com/docs/en/workflows.md](https://code.claude.com/docs/en/workflows.md): Claude writes a JavaScript script that runs many subagents in the background; suited to audits, migrations and cross-checked research. Plans: All paid plans, API, Bedrock, Google Cloud Agent Platform, Foundry. Apps: cli, desktop, ide.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity with Claude Code; owner has not decided whether coding surfaces get a research run). Coding surfaces can run research through helper agents that return only a summary, with visible cost and a stop control.

**With different models, providers and the one subscription.** Helper agents may use different providers per task and all spend is metered under the one subscription. In Local mode they run on the device with local sources only.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not checked in this pass for CLI and VS Code helper-agent research. Research ledger rows are missing for CLI, VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.01
- Comparison list ids: C264
- Code: `apps/cli/src/agents.rs`; `apps/cli/src/routing/classify.rs`

**Gap.** CLI, VS Code and Chrome have no research run (S35.01 missing for the three).

**Acceptance criteria**

1. From the CLI, run a research job and see helper agents listed.
2. Stop it and see all helpers stop.
3. See the cost used.

**Verification: not verified.** Files were listed, not read for behaviour.

## CAP-research-20 Page fetch and reading a pasted link

The assistant reads a page by URL for research, with caching and limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): WebFetch answers a question about a URL via a separate model call; 15-minute cache, 5-minute download deadline, reads first 100,000 characters; refuses localhost. Apps: cli, ide.
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): With web search on, Claude fetches whole pages from URLs you give it; on Free the full article enters context and can burn much of the usage limit. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 6 (egress passes the host policy)). Pasted links are read in full, refuse local and private addresses, and show when a page could not be read.

**With different models, providers and the one subscription.** Fetching is AGI harness code. A cheaper model may do the reading step; the page text still counts in usage.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and mobile done; CLI partial; VS Code same. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S36.19
- Comparison list ids: CP46; rows without an id: web row 'Read the full page behind a pasted link' (no list_id); mobile row 'Read a web page from a link you paste' (no list_id)
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:988`; `apps/cli/src/features/exec/tools/web/mod.rs:118-126`

**Gap.** CLI summarising is partial; the search call limit per session is missing in the CLI (C78).

**Acceptance criteria**

1. Paste a public URL and get an answer from its content.
2. Paste a localhost URL and be refused.
3. Paste a blocked page and see a clear notice.

**Verification: code inspected only.** No human run.

## CAP-research-21 Search modes cached, live and off for coding tools

The coding tools let users choose search from a stored index, live pages or none, and cap search calls.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): Interactive sessions cap at 200 searches (subagents count), refilling about 100 per hour; the WebSearch backend is not configurable and is unavailable on Bedrock. Apps: cli, ide.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-basic.md](https://learn.chatgpt.com/docs/config-file/config-basic.md): Cached (default) serves an OpenAI-maintained index; indexed gates external access via the index; live fetches fresh pages; disabled turns the tool off. Apps: cli, ide.
  - [https://learn.chatgpt.com/docs/web-search.md](https://learn.chatgpt.com/docs/web-search.md): Local Codex defaults to cached search; full-access runs default to live and --search enables live for a CLI run. Apps: cli, ide, desktop.

**AGI requirement** (inferred; source: competitor parity with Codex and Claude Code). Coding surfaces offer cached, live and off search with a domain allow-list and a per-session call cap.

**With different models, providers and the one subscription.** Mode choice is host config, so any provider works. Off or cached is the safe default in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code partial; CLI call limit and --search flag missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C78, C79, CP44, VP16, VP47
- Code: `apps/cli/src/features/exec/tools/web/mod.rs:379-460`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:458-462`

**Gap.** CLI web search modes and --search flag missing (C79); search call limit missing (C78).

**Acceptance criteria**

1. Switch between cached, live and off and see the behaviour change.
2. Exceed the call cap and see a clear stop message.
3. Set an allowed-domain list and confirm results stay inside it.

**Verification: not verified.** Not run.

## CAP-research-22 Research inside projects

Research and search use a project's files and instructions as context.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects): RAG-enabled projects stay compatible with web search, extended thinking and research; no setup and users cannot toggle it. Plans: Paid plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Canvas, image generation, voice, web search, apps, and on paid plans agent mode and deep research work in projects. Plans: Paid for agent and deep research. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md W05 on project knowledge). A research run started inside a project may use that project's files and instructions, within project permissions.

**With different models, providers and the one subscription.** Project retrieval is AGI code. Project files stay in their trust boundary; Local-project files do not go to the cloud without an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not read in this pass. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP243
- Code: `apps/web/features/projects/components/AddSourcesModal.tsx:308`

**Gap.** Not confirmed that research reads project sources.

**Acceptance criteria**

1. Add a file to a project, run research there, and see it cited.
2. A file from another project is never cited.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-11 (subscribed, blocker): project file upload and Add text source fail with 'Something went wrong on our side. Try again shortly.'

## CAP-research-23 Company knowledge across connected tools

A cited answer drawn from approved company apps while respecting each user's permissions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12489464-use-enterprise-search](https://support.claude.com/en/articles/12489464-use-enterprise-search): Preconfigured project in the sidebar that searches connected company tools with cited answers; works on Desktop and web, not on iOS or Android; counts toward standard limits. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): Composer option that searches connected tools such as Slack, SharePoint, Drive, GitHub and returns cited answers respecting each user's permissions. Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: competitor parity; owner has not set a business-plan scope). Offer a cited answer across connected work apps, respecting each user's access.

**With different models, providers and the one subscription.** Permission checks happen in AGI code, so they hold for any model. Usage is metered under the one subscription.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web (W209); comparison WP78 says partial because only a connector directory exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W209, WP78
- Code: `searched: company knowledge, enterprise search in apps/web (comparison W209)` (not found)

**Gap.** No company-knowledge mode.

**Acceptance criteria**

1. Ask a company question and get an answer citing Slack or Drive items the user can open.
2. A document the user cannot open is never cited.

**Verification: not verified.** Not built.

## CAP-research-24 Admin controls for research and web access

Workspace admins limit or turn off research, search and connected-app use.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans](https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans): Roles can use All capabilities (includes beta and research preview) or All generally available, versus Only selected. Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Admins control access via RBAC; apps must support deep research and be enabled; activity is covered by the Compliance API. Plans: Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Lockdown Mode (opt-in, Jun 4, 2026) restricts live browsing, deep research, agent mode and file downloads to cut prompt-injection exfiltration. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 6 (security fails closed)). Admins can turn research and web search on or off per role. A user-level lockdown can cut outward research paths.

**With different models, providers and the one subscription.** Policy sits in AGI code and wins over any model or plan. Disabled research shows a reason, not a silent failure.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial; desktop admin-set search mode missing (D19). No lockdown mode found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D19, WP289, WP79
- Code: `packages/contracts/types/src/enterprise/workspace-controls.ts:3-18,41,186-192`

**Gap.** No lockdown mode; admin web-search mode on desktop missing.

**Acceptance criteria**

1. An admin turns off research for a role and that role sees it disabled with a reason.
2. The server refuses a hand-made request from that role.
3. The change appears in an audit view.

**Verification: code inspected only.** Not run.

## CAP-research-25 Proactive read-only research

A background helper that researches connected information and keeps private notes without taking actions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/dots/controls.md](https://learn.chatgpt.com/docs/dots/controls.md): The dot researches connected apps and keeps private notes to suggest next steps; the research tools cannot send messages, change content or control browser or computer. Apps: ios, android, desktop, web.

**AGI requirement** (proposed; source: competitor feature; no project document requires it). If AGI offers background research, it is read-only and the user can see what it read.

**With different models, providers and the one subscription.** Would be cloud-side and metered under the one subscription. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on desktop (D37). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D37
- Code: `searched: proactive in apps/web/features/schedules, apps/web/features/chat (comparison D37)` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. The helper lists what it read.
2. It cannot send or edit anything.
3. The user can turn it off.

**Verification: not verified.** Not built.

## CAP-research-26 Completion notice and scheduled research

Tell the user when a run finishes, and rerun research on a schedule.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI addition; the owner has not decided scheduling). A finished or failed run notifies the user in-app and by push. Recurring research is an optional later feature.

**With different models, providers and the one subscription.** Notification is AGI code. Each scheduled run would be metered under the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Completion notice done on web, desktop, mobile; mobile settings switch is Partial (MP88). Scheduled research (S35.32) missing on all. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.32, S35.33
- Comparison list ids: MP88
- Code: `apps/web/lib/services/agent-notification-service.ts:188,224`; `apps/mobile/src/features/settings/notifications/categories.ts:29`

**Gap.** No scheduling; mobile switch partial.

**Acceptance criteria**

1. Close the app during a run and receive a notification when it finishes.
2. A failed run also notifies.
3. Turn off the research notification switch and see none.

**Verification: code inspected only.** Not run.

## CAP-research-27 Report to interactive page and other outputs

Turn a finished report into an interactive page, slides or audio.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI addition; ledger S35.31 and S110.05). A finished report can become an interactive page in one step; slides and audio are optional.

**With different models, providers and the one subscription.** Uses the artifact path for any model. Charged as normal generation.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Interactive page done on web and desktop. Slides (S35.29) and audio (S35.30) missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.05, S35.29, S35.30, S35.31
- Comparison list ids: none matched
- Code: `apps/web/features/chat/lib/visual-intent.ts:104,117`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:801`

**Gap.** Slides and audio missing; mobile missing.

**Acceptance criteria**

1. Convert a report to an interactive page and open it.
2. The page keeps the report's citations.

**Verification: code inspected only.** Not run.

## CAP-research-28 Specialist research: science, clinical and shopping

Research modes tuned for science, medicine or shopping with trusted sources.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16563838-get-started-with-claude-science](https://support.claude.com/en/articles/16563838-get-started-with-claude-science): Beta desktop app where Claude writes and runs code in a sandbox, reads granted folders, pulls from scientific databases via connectors and saves versioned artifacts with provenance. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001202-chatgpt-for-clinicians](https://help.openai.com/en/articles/20001202-chatgpt-for-clinicians): Answers drawn from peer-reviewed studies and guidelines with citations; deep research builds cited literature reports. Plans: Clinicians. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 24, 2025: shopping research makes a personalized buyer's guide with links. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity; owner has not decided scope). Specialist research is optional and comes after the general research mode is solid.

**With different models, providers and the one subscription.** Domain sources are connectors under the same rules; health data needs explicit consent.

**Current implementation, as this trace read it on 2026-11-24: not built.** Science app missing (D38, D58); clinical search missing (W95); shopping research missing (W100). The ledger marks web specialist workspace rows done (S108.09 to S108.22) but those were not read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S108.09, S108.10, S108.17, S108.20, S108.22
- Comparison list ids: D38, D58, W100, W162, W95
- Code: `searched: science in apps, apps/web/features (comparison D58)` (not found); `searched: buyer's guide, shopping research (comparison W100)` (not found)

**Gap.** Dedicated science, clinical and shopping research are not built per comparison.

**Acceptance criteria**

1. Pick the specialist mode and see its trusted source list.
2. Every claim in it carries a citation.

**Verification: not verified.** Not run.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether Free users get a limited research allowance, as ChatGPT does, or none, as Claude and decision D-2026-09-28-11 say. That decision was made before ChatGPT's page could be read.
- Whether research should ask clarifying questions first.
- Whether coding surfaces (CLI, VS Code) and Chrome get their own research run or only search and fetch, and whether to copy the Claude Code claim-voting workflow.
- Whether to build company knowledge across connected tools, and for which plans.
- Whether to add proactive background research like ChatGPT Dot.
- Whether specialist research (science, clinical, shopping) is in scope.
- Whether to offer research in Local mode with local sources only, or keep it cloud-only with a clear label.
- Whether a research run may use a different model for the checking pass than the chat model, and how that is shown.

## Could not establish

- Whether Claude chat has plan editing, site restriction, steering, report export or report history: the catalogue has no such lines, so each is has: unknown.
- How ChatGPT deep research behaves on mobile with connected apps: the catalogue lists mobile but gives no detail.
- Whether Codex has a standalone cited research report: only web search modes appear in the catalogue.
- Whether ledger and comparison disagree because of stale data: S35.03, S35.28 and W35 conflict and the code was not re-read.
- Whether any research run has ever worked end to end for a person: the web scorecard covers web search only (W-5), and 5-results/web/results.csv has blank results for all S35 rows.
- How research behaves in Local mode, and whether helper-agent research exists in CLI and VS Code: not read in code.
- Exact allowance numbers for each leader plan: the catalogue gives only words such as limited, included and maximum, except the Enterprise and Edu rate cards.

---
id: "COMP-tools-and-code-execution"
type: "competitor-trace"
title: "Tools and code execution"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Tools and code execution: competitors to requirements

Tools and code execution: both leaders run sandboxed code, analyse data, make files and ask before app actions. AGI has a wide tool layer on all six apps by code reading. Gaps seen: web code execution awaits a production switch-on, Excel creation failed in the one human web test, and charts, Python-in-canvas, custom connectors and run-code controls are partial or missing. Most items are unverified by a person.

**How the products divide this topic.** Review date 2026-11-22 for all competitor evidence. Claude (chat) and ChatGPT (chat) are the main references: sandbox code, file creation, data analysis, visuals, connector tools and approval cards. Claude Code (code.claude.com) and Codex (learn.chatgpt.com Codex pages) are separate coding tools. They own shell, OS sandbox, permission modes, hooks and background tasks. They connect to the chat products only in places: Claude Code loads claude.ai connectors when the subscription is the active sign-in (cc07:26), and Codex pages share plugin and Work wording with ChatGPT. Claude Cowork (desktop) is part of the Claude app and adds a VM and computer use. Plan limits seen: Claude code execution and file creation is on for Free through Ultra (ch01:255) but default off on Enterprise (ch03:12). ChatGPT data analysis is in the Free tier (oh09:173). One ChatGPT pricing line limits interactive tables and charts to Plus and Pro (cl08-pr01:58), while a help page lists no plan (oh09:36). Web search, memory, scheduling and artifacts are covered by other topics; only their tool-call display is touched here. Competitor names for specific models are left out on purpose.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-tools-and-code-execution-01](#cap-tools-and-code-execution-01) | Sandboxed code execution in chat | yes | yes | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-02](#cap-tools-and-code-execution-02) | Code execution and file creation switch with admin control | yes | partly | partly built | not verified |
| [CAP-tools-and-code-execution-03](#cap-tools-and-code-execution-03) | Network access control for the sandbox | yes | partly | partly built | not verified |
| [CAP-tools-and-code-execution-04](#cap-tools-and-code-execution-04) | Data analysis on uploaded files | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-05](#cap-tools-and-code-execution-05) | Interactive charts and tables from analysis | partly | yes | partly built | not verified |
| [CAP-tools-and-code-execution-06](#cap-tools-and-code-execution-06) | File creation: Word, Excel, PowerPoint, PDF, CSV | yes | partly | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-07](#cap-tools-and-code-execution-07) | Run code from a code block and Python in canvas | unknown | yes | partly built | not verified |
| [CAP-tools-and-code-execution-08](#cap-tools-and-code-execution-08) | Execution output, errors and generated files display | unknown | partly | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-09](#cap-tools-and-code-execution-09) | Code block presentation and actions | unknown | yes | partly built | not verified |
| [CAP-tools-and-code-execution-10](#cap-tools-and-code-execution-10) | Code block live preview (HTML, React, SVG, Mermaid, Vega) | partly | yes | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-11](#cap-tools-and-code-execution-11) | Inline interactive visuals written by the model | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-12](#cap-tools-and-code-execution-12) | Tool approval card | yes | yes | partly built | seen working by a person |
| [CAP-tools-and-code-execution-13](#cap-tools-and-code-execution-13) | Per-tool permission levels for connectors | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-14](#cap-tools-and-code-execution-14) | Account-wide approval mode | yes | yes | partly built | seen working by a person |
| [CAP-tools-and-code-execution-15](#cap-tools-and-code-execution-15) | Tool access mode and on-demand tool loading | yes | unknown | built | code inspected only |
| [CAP-tools-and-code-execution-16](#cap-tools-and-code-execution-16) | Custom connectors and MCP tools | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-17](#cap-tools-and-code-execution-17) | Interactive connector apps in chat | yes | partly | partly built | not verified |
| [CAP-tools-and-code-execution-18](#cap-tools-and-code-execution-18) | Skills with scripts | yes | partly | partly built | not verified |
| [CAP-tools-and-code-execution-19](#cap-tools-and-code-execution-19) | Agent browser and computer use | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-20](#cap-tools-and-code-execution-20) | Site tools exposed by pages (WebMCP) | unknown | yes | partly built | not verified |
| [CAP-tools-and-code-execution-21](#cap-tools-and-code-execution-21) | OS sandbox for shell commands in coding tools | yes | yes | partly built | code inspected only |
| [CAP-tools-and-code-execution-22](#cap-tools-and-code-execution-22) | Hooks that guard or change tool calls | yes | yes | partly built | not verified |
| [CAP-tools-and-code-execution-23](#cap-tools-and-code-execution-23) | Tool call display in the transcript | partly | partly | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-24](#cap-tools-and-code-execution-24) | Tool errors, retry and large-result references | partly | unknown | partly built | seen failing by a person |
| [CAP-tools-and-code-execution-25](#cap-tools-and-code-execution-25) | Tool action receipts and activity review | partly | partly | built | code inspected only |
| [CAP-tools-and-code-execution-26](#cap-tools-and-code-execution-26) | Multi-step tool loop, parallel calls and background tasks | yes | yes | built | seen failing by a person |
| [CAP-tools-and-code-execution-27](#cap-tools-and-code-execution-27) | Execution location and boundary labels | partly | partly | partly built | not verified |
| [CAP-tools-and-code-execution-28](#cap-tools-and-code-execution-28) | Usage accounting for tool and code use | yes | yes | partly built | not verified |

## CAP-tools-and-code-execution-01 Sandboxed code execution in chat

The assistant writes and runs code in an isolated environment and returns the output in the conversation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Claude runs code in a sandbox to build files, charts and Python analysis; isolated per-user containers, task duration caps, injection classifier. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Writes and runs Python in a stateful Jupyter-style sandbox with no external web or API access; users can review code and outputs. Plans: not stated; Free tier includes data analysis (9275245). Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 7.1 (Local tools run on device, fail closed) and docs/product/definition.md line 285 (code execution is a Capability)). Any signed-in or Local user can have the assistant run code in a sandbox and see stdout, errors and files in the transcript. The app says where the code ran.

**With different models, providers and the one subscription.** Offered only on routes whose capability metadata proves tool calling, whatever the provider. Cloud runs are metered under the one AGI Subscription. Local mode runs on the device runtime only; if none exists the app shows the requirement and offers a fork, never a silent cloud run.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S57.10 done on all six apps. Web cloud sandbox needs the production switch (AGI_E2B_EXECUTION and key); desktop model-run code has network forced off. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.12, S57.05, S57.10, S57.11
- Comparison list ids: MP31, MP60, WP159
- Code: `apps/web/lib/e2b/execution-tools.ts:194`; `apps/web/lib/e2b/gate.ts:16`; `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:84`; `docs/decisions/wire-or-cut.md:92`

**Gap.** Web cloud sandbox is not switched on in production per the ledger. Mobile data analysis in a sandbox and run-code are partial. A tool-step failure showed 'No module named pymupdf' in the web sandbox.

**Acceptance criteria**

1. On web as a paid user, ask for the sum of a short number list by code; the transcript shows the code, the output and a finished status.
2. Choose a Local model without tool support; no run-code control is offered and the reason is stated.
3. In Local mode with no local runtime, a code request shows what is needed and offers a fork, with no hosted call.
4. The run counts in Usage once, in the same meter as chat.

**Verification: seen failing by a person.** 6-defects web-problems-seen-in-browser.csv W-15: first tool step failed with ModuleNotFoundError pymupdf, agent recovered on retry. W-9: file tool failed. No run on other apps.

## CAP-tools-and-code-execution-02 Code execution and file creation switch with admin control

A setting that turns code execution and file creation on or off, with organisation owners able to lock it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Settings > Capabilities switch, on by default for Free through Ultra. Plans: Free, Pro, Max, Ultra. Apps: web, desktop, mobile.
  - [https://support.claude.com/en/articles/13779868-migrate-your-organization-from-team-to-enterprise](https://support.claude.com/en/articles/13779868-migrate-your-organization-from-team-to-enterprise): Code execution and file creation is default-off on Enterprise. Plans: Enterprise. Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Admin Canvas code execution toggle, off by default for Enterprise; GPT builders can toggle code interpreter and data analysis. Plans: Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 285). Capabilities settings include code execution, file creation, network egress and domain allow list, and an organisation can disable them.

**With different models, providers and the one subscription.** The switch is model-independent; a switched-off capability hides the tool for every provider. Plan or org limits come from the one entitlement system, not per app.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web capabilities page exists; mobile has a code execution and file creation switch; web admin switches partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.29
- Comparison list ids: WP159, WP99; rows without an id: Code execution and file creation switch (mobile)
- Code: `apps/web/features/settings/sections/CapabilitiesSection.tsx:78`; `apps/mobile/src/features/settings/capabilities/index.tsx:126`

**Gap.** Web admin switches and the internet-access setting are partial per the comparison.

**Acceptance criteria**

1. Turn the switch off; a code request gets a plain statement that code execution is off.
2. Turn it on; the same request runs.
3. An organisation lock stops a member from turning it on.
4. The setting reads the same on web and mobile.

**Verification: not verified.** Code reading only; no scorecard row covers it.

## CAP-tools-and-code-execution-03 Network access control for the sandbox

Controls over what the sandbox may reach: off, package managers only, allowed domains, or all.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Team and Enterprise owners pick off, package managers only (default), plus allowed domains, or all domains minus a blocklist; MCP bypasses this setting. Plans: Team, Enterprise. Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): The data analysis sandbox has no external web or API access (no setting described here). Plans: not stated. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md line 285 lists network egress and domain allow list). Show the network level the sandbox has, default to off for model-run code, and let owners set a domain allow list.

**With different models, providers and the one subscription.** Same rule for every model and provider. Local runs stay offline unless the user opts in. Hosted sandbox time is metered in the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web network levels same as leaders per comparison; cloud session levels and mobile environment select partial; desktop allow-list partial; CLI sandbox network off by default. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP77, MP58, WP218; rows without an id: Network access levels for the sandbox
- Code: `docs/decisions/wire-or-cut.md:92`

**Gap.** Allow-list and per-session levels are partial on cloud sessions, mobile and desktop.

**Acceptance criteria**

1. Default level for model-run code is shown and is no network.
2. Set allowed domains; a request to another domain is refused with a visible reason.
3. The level is shown in the run header.

**Verification: not verified.** Comparison rows and decision log only.

## CAP-tools-and-code-execution-04 Data analysis on uploaded files

Upload a spreadsheet, CSV or document and have the assistant analyse it with code, tables and charts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Sandbox builds PNG charts, Python analysis and ML models and can extract PDF tables. Plans: All plans. Apps: web, desktop, mobile.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Analyses xls, xlsx, csv, PDFs, json, xml, yaml, txt, md; can attach from Drive, OneDrive, SharePoint. Plans: varies by model, plan and workspace. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md line 183 names data analysis as a reference capability). A user can upload tabular data and get computed answers, tables and charts, with the code visible.

**With different models, providers and the one subscription.** Works on any tool-capable model. Files stay on device in Local mode and the analysis runs locally; sending a file to a provider needs consent (requirements.md section 2.5).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web same as leaders; mobile partial; interactive table view partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.10
- Comparison list ids: MP31, WP89; rows without an id: Python data analysis on uploaded files in a sandbox
- Code: `apps/web/lib/e2b/execution-tools.ts:386`

**Gap.** Mobile partial; no drive/OneDrive import evidence checked.

**Acceptance criteria**

1. Upload a three-row CSV and ask for the total; the answer matches and the code can be opened.
2. Ask for a chart; it appears inline.
3. In Local mode the file never leaves the device.

**Verification: not verified.** No scorecard row for data analysis.

## CAP-tools-and-code-execution-05 Interactive charts and tables from analysis

Charts and tables the user can switch between static and interactive, expand, recolor and download.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Claude builds HTML-based charts inline, interactive with buttons and sliders; not rendered in iOS or Android apps. Plans: all users. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis](https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis): Many chart types; only bar, pie, scatter, line are interactive; download PNG, expand, recolor by hex. Plans: not stated. Apps: web.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Interactive tables and charts are Plus and Pro only. Plans: Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Charts from analysis render inline, can be expanded, downloaded and, where simple, switched to interactive.

**With different models, providers and the one subscription.** Rendering is done by AGI from structured data, not by the model, so it works on any provider. No plan gate unless the owner sets one.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Charts with a data table same on web; chart types and static/interactive switch partial on web; missing on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.20
- Comparison list ids: M37, WP67, WP70; rows without an id: Charts with a data table
- Code: `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:115`

**Gap.** Static/interactive switch, more chart types and sortable tables partial; plots missing on mobile, CLI and VS Code.

**Acceptance criteria**

1. A bar chart from a CSV renders inline and downloads as PNG.
2. Toggle to interactive and back on web.
3. A plot from code shows inline on mobile.

**Verification: not verified.** Code reading only.

## CAP-tools-and-code-execution-06 File creation: Word, Excel, PowerPoint, PDF, CSV

The assistant produces real downloadable files, including working formulas.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Builds Excel, PowerPoint, Word and PDF files; max 30MB; counts toward usage limits. Plans: All plans. Apps: web, desktop, mobile.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Generated files expire quickly or fail above 512 MB; file downloads need Code Interpreter for custom GPTs. Plans: not stated. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 6.3 lists generated artifacts). A request for an Office, PDF or CSV file returns a real file that opens, with working formulas in spreadsheets, or a clear reason it could not.

**With different models, providers and the one subscription.** The file tool is an AGI tool, so every tool-capable provider can call it. Usage is metered in the one subscription. In Local mode file creation runs on the device or is hidden.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S57.07-09 done on web, desktop, mobile, Chrome; missing on CLI and VS Code. Web Excel failed in a human test. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.07, S57.08, S57.09
- Comparison list ids: none matched
- Code: `apps/web/lib/services/managed-office-file-service.ts:151`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875`

**Gap.** Excel with a SUM formula failed on Free and Ultra web accounts; a retry gave a false 'tool isn't available'. CLI and VS Code have no document tools.

**Acceptance criteria**

1. Ask for a Word file, an Excel file with a SUM total and a deck in one request; all three open and the sheet total is a formula.
2. If a file cannot be made, the message states the real reason and a retry works.
3. Download works on web and mobile.

**Verification: seen failing by a person.** 5-results web scorecard W-9 (free partial, subscribed fail): Word and PowerPoint real; Excel failed four times.

## CAP-tools-and-code-execution-07 Run code from a code block and Python in canvas

Run a code block shown in a reply, or run Python inside an editable canvas document.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Canvas executes Python with bug-fix passes; admin toggle off by default for Enterprise. Plans: All; Enterprise toggle. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Run Python with bug-fix pass in canvas; later removed from a newer model. Plans: Free, Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A Run action on a code block runs it in the sandbox and shows output beside it.

**With different models, providers and the one subscription.** Runs on the AGI sandbox, not the model, so it is model-independent. Local mode runs on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Run-code done on web, desktop, mobile, CLI, VS Code; Chrome missing; Python in canvas missing; run from a code block partial on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.12, S21.13
- Comparison list ids: MP60, W126, WP109
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3626`; `apps/web/features/chat/components/messages/MessageBubble.tsx:1996`

**Gap.** No Python in canvas; no stdin panel, runtime reset, retry or stop on web and desktop (partial).

**Acceptance criteria**

1. Click Run on a Python block; output shows below it.
2. Stop a long run; it ends and says so.
3. Run again in place.

**Verification: not verified.** Code reading only.

## CAP-tools-and-code-execution-08 Execution output, errors and generated files display

How a run is shown: output panel, separate errors, exit status, duration, files and plots.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Shows pandas DataFrames as interactive tables; users can review code and outputs. Plans: not stated. Apps: web, ios, android.

**AGI requirement** (proposed; source: ledger area 21 items S21.15-S21.20, S21.30). Each run shows stdout, errors apart, exit status, duration, files made and plots, and says when the runtime is unavailable.

**With different models, providers and the one subscription.** Display reads one tool result shape from the shared tool primitive, so it does not depend on the model or provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Output, errors, exit status done on most apps; duration missing on web and desktop; plots missing on mobile, CLI, VS Code; unsupported-runtime state missing on mobile and CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.15, S21.16, S21.17, S21.18, S21.19, S21.20, S21.30
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:84`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4511`; `crates/agiworkforce-protocol/src/tool_primitive.rs`

**Gap.** Duration, plots, unsupported-runtime state and error-line highlight are missing on several apps. A file card in a human web test had no download.

**Acceptance criteria**

1. A failing script shows error text apart from output and a failure status.
2. A script that writes a file lists it with a working download.
3. A run shows its duration.

**Verification: seen failing by a person.** W-15 free: file card Cedar-Bay-Dispatch-Summary.txt had no download and did nothing on click.

## CAP-tools-and-code-execution-09 Code block presentation and actions

Language label, highlighting, copy, download, expand, edit and diffs on code blocks.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Code blocks have language label, copy, direct edit, ask-to-edit and full-screen view. Plans: varies. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Sticky copy button and horizontal scroll for code. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Code blocks show language, highlight, copy, download and open full screen on every app that shows code.

**With different models, providers and the one subscription.** Pure rendering of text, model-independent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Label, highlight, copy, download done on web, desktop, mobile; VS Code and Chrome lack label and highlight; line numbers, wrap and collapse missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.01, S21.02, S21.03, S21.04, S21.05, S21.06, S21.07, S21.08
- Comparison list ids: none matched; rows without an id: Code blocks with highlighting, copy and download; Sticky copy button on long code blocks
- Code: `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:150`

**Gap.** Line numbers, wrapping toggle, collapse missing on all six; Chrome and VS Code gaps.

**Acceptance criteria**

1. Every code block shows a language name and a working copy.
2. Download gives a file with the right extension.
3. Open full screen on web and desktop.

**Verification: not verified.** Code reading only.

## CAP-tools-and-code-execution-10 Code block live preview (HTML, React, SVG, Mermaid, Vega)

Toggle a code block into a rendered, sandboxed preview.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): HTML, React, markdown, mermaid and SVG artifacts still work with file creation on. Apps: web, desktop, mobile.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Preview toggle renders HTML, React, SVG, Mermaid, Vega in a sandbox that may ask permission for outside resources. Plans: varies. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 10.3). Untrusted generated HTML or app code renders only in a cross-origin sandbox without host credentials.

**With different models, providers and the one subscription.** Renderer is AGI-owned and model-independent. Network use from the preview follows the sandbox network rule.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial, mobile partial; HTML artifact preview worked in a human test on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.25
- Comparison list ids: MP26, WP65; rows without an id: Preview HTML, React, SVG and Mermaid code live
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:818`

**Gap.** Vega and some formats partial; after Stop the edited artifact showed as raw HTML code, not a card.

**Acceptance criteria**

1. Toggle preview on an HTML block; it renders and cannot read AGI cookies.
2. Mermaid and SVG blocks render.
3. Stopping mid-write leaves an artifact card, not raw source.

**Verification: seen failing by a person.** W-8 (web): artifact rendered and edited; after Stop the raw HTML showed in chat.

## CAP-tools-and-code-execution-11 Inline interactive visuals written by the model

The model builds diagrams, charts, calculators or forms inline that the user can interact with.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Builds HTML diagrams and charts inline; keep as image, SVG, HTML or artifact; not on iOS or Android. Plans: all users. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt): Answers mix text, charts, forms and buttons; some components keep state after refresh. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/visualizations.md](https://learn.chatgpt.com/docs/visualizations.md): @Visualize makes explorable snapshots, not live dashboards. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). Allow inline interactive visuals, always sandboxed, with a way to keep, copy or save them.

**With different models, providers and the one subscription.** Capability must not depend on one provider; a model that cannot produce the format gets the plain-text answer.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial; mobile inline visuals switch same; export as image/SVG/HTML missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W76, WP64, WP66, WP92; rows without an id: Inline visualizations switch with Beta badge
- Code: none cited

**Gap.** Export of a visual missing on web; saved-as-artifact partial.

**Acceptance criteria**

1. Ask for a compound-interest explorer; sliders change the result.
2. Copy as image or download works.
3. Reduce-visuals setting hides them.

**Verification: not verified.** No scorecard row.

## CAP-tools-and-code-execution-12 Tool approval card

Before a tool or app action runs, a card asks Deny, Allow once, Allow for this chat or Always allow.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Tool requests ask approval with an Allow always option; a Search and tools menu disables tools. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Card with Deny, Allow once, Allow low-risk, Always allow; Always allow withheld in managed workspaces; some actions denied. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 and docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). Actions that write or leave the device ask first, the question names the effect, and the decision binds to the exact pending call.

**With different models, providers and the one subscription.** Policy sits in AGI, not in the model, so it applies to every provider. In Local mode it governs local tools; it never lets a local tool call reach a hosted service.

**Current implementation, as this trace read it on 2026-11-24: partly built.** In-chat card same on web; mobile partial; CLI overlay done; approval stores and exact-call binding done in platform. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S92.13, S92.14, S92.15, S92.16
- Comparison list ids: MP63; rows without an id: In-chat approval card (Deny, Allow once, Allow for this chat, Always allow); Allow always for connector tool approvals
- Code: `apps/web/shared/types/toolApprovalPolicy.ts:1`; `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8`; `apps/cli/src/tui/widgets/approval_overlay.rs:5`

**Gap.** Mobile card partial. A read-only PDF read was labelled 'High risk, can change or delete data' in the web test.

**Acceptance criteria**

1. A write action shows a card naming the effect; Deny stops it.
2. Allow once runs it once; the next call asks again.
3. Answer an approval from a second device; it applies once.
4. A stale answer is refused.

**Verification: seen working by a person.** W-15 subscribed (web): two Allow-once approvals, task finished; defect row: high-risk label on a read-only PDF read.

## CAP-tools-and-code-execution-13 Per-tool permission levels for connectors

Each connector tool can be Allow, Needs approval or Blocked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15183774-connect-to-microsoft-365](https://support.claude.com/en/articles/15183774-connect-to-microsoft-365): Per-tool permissions and per-chat toggle; Always allow per tool. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Per-tool levels Always allow, Needs approval, Always ask. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 18, 2026: choose when ChatGPT asks before using connected apps in Settings > Apps. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Users set a level per connector tool; admins can set a role default; blocked tools are not shown to the model.

**With different models, providers and the one subscription.** Applied before the call is sent to any provider. Admin defaults follow the one entitlement system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Same on web; partial on mobile, CLI and VS Code; role permissions partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S92.13
- Comparison list ids: CP192, MP61, WP174; rows without an id: Per-tool permissions on a connector
- Code: `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:247`

**Gap.** Partial on mobile and role-level conflicts.

**Acceptance criteria**

1. Set one tool to Blocked; the assistant cannot call it.
2. Set Needs approval; a card appears.
3. Setting is the same on web and mobile.

**Verification: not verified.** Code and comparison only.

## CAP-tools-and-code-execution-14 Account-wide approval mode

A default for how often tools ask: always ask, ask before changes, or auto.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Permission modes Manual, auto (classifier), bypassPermissions, dontAsk. Apps: cli.
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Outside Auto mode Claude asks approval to send mail; in Auto mode it may not. Apps: web, desktop.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): App permission modes: always ask, ask before changes. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Codex has a sandbox mode and a separate approval policy. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). One approval default per account, read-only actions run without asking, writes ask. Org owners may forbid autonomous approval.

**With different models, providers and the one subscription.** Setting lives in AGI and travels with the account to all six apps, independent of provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial; CLI sandbox and approval separate, same as leaders. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S92.13
- Comparison list ids: WP162; rows without an id: Approval policy and sandbox are separate settings; Approval modes for tool actions (Manual, Auto, Skip)
- Code: `apps/web/shared/types/toolApprovalPolicy.ts:20`

**Gap.** Web account default partial. The decision says sandboxed code runs without asking in read-only mode, but the web Work test showed approvals.

**Acceptance criteria**

1. Set read-only default; a sandbox run does not ask.
2. Set ask-always; every tool asks.
3. An org rule overrides a user setting.

**Verification: seen working by a person.** W-15 subscribed: approvals appeared in Work mode. Setting itself not tested.

## CAP-tools-and-code-execution-15 Tool access mode and on-demand tool loading

Load connector tools only when needed so many tools do not fill the context.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access](https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access): Auto, Always available, On demand modes per conversation under + > Connectors. Plans: all users. Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/costs.md](https://code.claude.com/docs/en/costs.md): MCP tool definitions deferred by default; only names enter context. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md section on tool search/deferred tool loading; docs/product/definition.md line 285). When many tools are connected, the model is told which exist and loads schemas on request.

**With different models, providers and the one subscription.** A provider-neutral selector; a model without tool calling gets no tools. Lower context use lowers metered cost.

**Current implementation, as this trace read it on 2026-11-24: built.** S57.28 and S57.29 done on all apps; tool access mode same as Claude on web and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.28, S57.29, S92.02, S92.03
- Comparison list ids: none matched; rows without an id: Tool access mode (load tools when needed or keep them loaded); MCP tool search with deferred schemas
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:152`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2690`

**Gap.** VS Code lacks MCP tool loading on demand per comparison; none known otherwise.

**Acceptance criteria**

1. Connect 12 tools; only relevant ones load for a turn.
2. Switch to Always available; all load.
3. Tool search returns a tool by keyword.

**Verification: code inspected only.** Ledger and file check; no human run.

## CAP-tools-and-code-execution-16 Custom connectors and MCP tools

Add your own remote or local MCP server so the assistant can call its tools.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Add a remote MCP server URL under Customize > Connectors; Free limited to one. Plans: All plans (Free: one). Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop): Desktop extensions run Node.js, Python or binary servers; secrets in OS keychain. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps): Owners, admins and authorised members can add custom MCP apps; admins refresh a published app's tool list. Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md lists MCP among provider/tool features). Users can add an MCP server and its tools appear with names, schemas and permission levels.

**With different models, providers and the one subscription.** MCP calls go through AGI regardless of provider. Local servers run on device and are not sent anywhere; remote servers are labelled as outside AGI.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code MCP same as leaders; web add-custom-connector missing; mobile partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W208; rows without an id: MCP servers; Slash command /mcp; MCP servers: view, add and inspect
- Code: none cited

**Gap.** Web cannot add a custom remote connector; many CLI MCP options partial or missing.

**Acceptance criteria**

1. Add an MCP server URL on web; its tools list.
2. Remove it; the tools vanish.
3. A local server stays on the device.

**Verification: not verified.** Comparison rows only.

## CAP-tools-and-code-execution-17 Interactive connector apps in chat

Connector tools that draw live cards or full-screen views in the chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude): Sandboxed iframes with strict CSP; purchases not supported; org owners can disable interactive tool calls. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt): Answers can include tappable buttons, forms, charts; no mention of connector-drawn views. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md section 10.3). Connector views render in a sandboxed frame with no host credentials, and owners can switch them off.

**With different models, providers and the one subscription.** Independent of model; rendering is by AGI.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP167
- Code: none cited

**Gap.** Partial on web; other apps not compared.

**Acceptance criteria**

1. A connector with a view shows an inline card.
2. Disable it by org setting; the card does not render.
3. The frame cannot read AGI storage.

**Verification: not verified.** No human run.

## CAP-tools-and-code-execution-18 Skills with scripts

Folders of instructions and scripts that run in the sandbox when relevant.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12512176-what-are-skills](https://support.claude.com/en/articles/12512176-what-are-skills): Skills load on demand and require code execution; can include scripts in Python or Node. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Workspace agents use tools, apps, skills and files. Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md line 285 lists skills). Skills run in the same sandbox and need code execution on; skill scripts follow the same approval and network rules.

**With different models, providers and the one subscription.** Open skill format works with any provider; skills that need code are hidden when the sandbox is off or the model cannot call tools.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Skills same as leaders on web, CLI, VS Code; bundled reference files and scripts partial on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP169; rows without an id: Skills; Skills on every plan, including Free
- Code: none cited

**Gap.** Scripts in skills partial on web.

**Acceptance criteria**

1. A skill with a script runs it in the sandbox.
2. With code execution off, the skill says it cannot run.
3. Script output shows as a tool call.

**Verification: not verified.** No human run.

## CAP-tools-and-code-execution-19 Agent browser and computer use

The assistant controls a browser or the screen to do tasks, asking before it acts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork) and Claude Code: yes**
  - [https://support.claude.com/en/articles/13364135-use-claude-cowork-safely](https://support.claude.com/en/articles/13364135-use-claude-cowork-safely): Clicks and types after asking permission per application, no sandbox. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
  - [https://code.claude.com/docs/en/computer-use.md](https://code.claude.com/docs/en/computer-use.md): Computer use is a built-in MCP server, off by default; per-session app approval. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11752874-chatgpt-agent](https://help.openai.com/en/articles/11752874-chatgpt-agent): Agent runs in a virtual browser, pausing for confirmation, interruptible. Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 2.5 (consent before sending computer-use screenshots to the provider)). Browser and computer tools run only with consent for each site or app, show screenshots as data sent, and are off in Local mode unless the device runs them.

**With different models, providers and the one subscription.** Only models verified for it get the tools. Hosted browser time is metered in the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S57.13-S57.15: desktop done, CLI/VS Code browser done, Chrome done; computer use desktop only; web and mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.13, S57.14, S57.15
- Comparison list ids: none matched
- Code: `apps/desktop/electron/runtime/dispatcher.ts:837`; `apps/desktop/electron/browser/browserSteps.ts:71`

**Gap.** Missing on web and mobile.

**Acceptance criteria**

1. Desktop asks before using each app.
2. Deny stops the action.
3. Screenshot sending names the provider.

**Verification: not verified.** Ledger only.

## CAP-tools-and-code-execution-20 Site tools exposed by pages (WebMCP)

Websites expose actions that the assistant can call in a built-in browser.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app): Address-bar arrow shows site tools; ChatGPT picks them automatically; activity shows in conversation. Plans: Account dependent. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Page-exposed tools are listed to the user and ask before use.

**With different models, providers and the one subscription.** Model-neutral tool listing.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop and Chrome partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP45, XP29
- Code: none cited

**Gap.** Partial.

**Acceptance criteria**

1. A page with tools shows an indicator.
2. Use of a site tool is shown in the transcript.

**Verification: not verified.** No human run.

## CAP-tools-and-code-execution-21 OS sandbox for shell commands in coding tools

Shell and file actions in the coding tools are confined by the operating system.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): /sandbox confines shell commands on macOS, Linux and WSL2. Apps: cli.
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Shell-mode commands run outside the sandbox. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Sandbox modes and approval policy are two layers; Seatbelt, bwrap/seccomp, Windows MXC. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: AGENTS.md section 6 (fail closed) and docs/decisions/wire-or-cut.md section Sandbox Boundary). Shell tools run in an OS sandbox by default; if the sandbox cannot start, fail closed.

**With different models, providers and the one subscription.** Applies to any model driving the shell. Fully local; no subscription needed for local runs.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI sandbox same as leaders (default on, fail closed); desktop built; VS Code partial; web shell partial; mobile and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.11
- Comparison list ids: VP37; rows without an id: Sandbox on by default; Fail closed when the sandbox cannot run; Slash command /sandbox
- Code: `apps/cli/src/features/exec/tools/mod.rs:552`; `docs/decisions/wire-or-cut.md:92`

**Gap.** Windows sandbox missing in CLI; many managed sandbox knobs missing.

**Acceptance criteria**

1. A command writing outside the workspace is refused.
2. If the sandbox cannot start, the command is refused, not run bare.
3. The sandbox state is visible.

**Verification: code inspected only.** Code and decision log.

## CAP-tools-and-code-execution-22 Hooks that guard or change tool calls

User or admin rules that deny, rewrite, ask about or log tool calls.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/plugins/mods/events.md](https://code.claude.com/docs/en/plugins/mods/events.md): A hook can deny a call, change arguments, retry, return its own result. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/rules.md](https://learn.chatgpt.com/docs/agent-configuration/rules.md): Rules files decide which commands may run outside the sandbox (experimental). Apps: cli, desktop.

**AGI requirement** (inferred; source: competitor parity). Coding surfaces support hooks on tool use with deny, ask and log.

**With different models, providers and the one subscription.** Hooks run in AGI, not the model, so work on any provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI PostToolBatch same; failure hooks and classifier note missing; desktop lifecycle hooks missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C130, C131, D71; rows without an id: PostToolBatch hook
- Code: `docs/decisions/wire-or-cut.md:557`

**Gap.** Several hook events missing on CLI and desktop.

**Acceptance criteria**

1. A hook denying a command blocks it with the reason.
2. A hook can rewrite an argument.
3. Hook failure shows in the transcript.

**Verification: not verified.** No run.

## CAP-tools-and-code-execution-23 Tool call display in the transcript

Each call shows arguments, running state with time, result preview and expandable detail.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Ctrl+O transcript viewer shows tool usage with timestamps and expands collapsed MCP calls. Apps: cli.
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): Focus view collapses tool calls behind expandable rows. Apps: ide.
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Chat search is shown as tool calls. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app): Site tool activity shows in the conversation and Sources. Plans: Account dependent. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 1 rule 6 and section 9.2). Tool calls, approvals, retries and failures are typed durable events shown as steps with arguments, state and result.

**With different models, providers and the one subscription.** Display reads one normalised call shape from any provider's stream. Local runs show the same.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S57.31-S57.34 done on all apps; defects seen on web: empty 'Writing response' row after Stop, red icons on stopped steps, no live progress in a cloud task. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.31, S57.32, S57.33, S57.34, S92.05, S92.07
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/ToolCallCard.tsx:499`; `apps/web/features/chat/components/messages/ToolTimeline.tsx:561`; `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:179`

**Gap.** Web display defects after Stop; a visible 'The tool failed' with raw error text.

**Acceptance criteria**

1. Each call shows name, arguments, running time then done or failed.
2. Expand shows full arguments and result; collapse hides them.
3. After Stop no empty row or red icons remain.
4. Reload keeps the steps.

**Verification: seen failing by a person.** 6-defects W-1, W-2 (Writing response row), W-15 (red icons, raw error), W-18 (no live progress).

## CAP-tools-and-code-execution-24 Tool errors, retry and large-result references

A failed call shows its error and is retried; oversized results are stored and referenced.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/mcp.md](https://code.claude.com/docs/en/mcp.md): Images in MCP results shown inline and original bytes saved in the session folder. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: ledger items S57.35, S57.36). Failed tool calls return to the model, can be retried by the user and are not hidden; large results are referenced by id.

**With different models, providers and the one subscription.** The error and reference go through one shared shape for all providers, which keeps context cost bounded.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Large-result references done on all; error and retry done on CLI only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.35, S57.36, S92.07, S92.09, S92.18
- Comparison list ids: none matched
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:91`; `apps/cli/src/claude_parity.rs:1098`

**Gap.** No in-place retry of a failed tool on web, desktop or mobile.

**Acceptance criteria**

1. A failed call shows a Retry that reruns only that call.
2. A huge result shows a link to the full text.
3. A retry does not run an unsafe call twice.

**Verification: seen failing by a person.** W-9: retry gave a false 'tool isn't available'.

## CAP-tools-and-code-execution-25 Tool action receipts and activity review

A durable record of which tool ran, with what input and outcome.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/15167101-get-started-with-claude-compliance-api-integrations](https://support.claude.com/en/articles/15167101-get-started-with-claude-compliance-api-integrations): Compliance API exposes tool calls as text. Plans: Enterprise. Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps): Compliance Platform shows app requests and responses. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: ledger S57.37, S92.17). Users can review a record of past tool actions, not only admins.

**With different models, providers and the one subscription.** Receipts are written by AGI for any provider; Local receipts stay on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** S57.37 done on web, desktop, CLI, VS Code, Chrome; mobile not marked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.37, S92.17
- Comparison list ids: none matched
- Code: `apps/web/app/api/connectors/calls/route.ts:33`; `apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:41`

**Gap.** Mobile receipts not marked in the ledger.

**Acceptance criteria**

1. After a connector call, the receipt lists tool, input and outcome.
2. Receipt survives reload.
3. Local receipts do not sync.

**Verification: code inspected only.** Files exist; no human run.

## CAP-tools-and-code-execution-26 Multi-step tool loop, parallel calls and background tasks

The assistant loops model-tool-result, runs safe calls in parallel and can run long commands in the background.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Bash commands run in background with task IDs. Apps: cli.
  - [https://code.claude.com/docs/en/code-mode.md](https://code.claude.com/docs/en/code-mode.md): Code Mode: one JS program makes many tool calls (experimental). Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Scheduled tasks run unattended with default sandbox and approvals. Apps: desktop.

**AGI requirement** (stated requirement; source: AGENTS.md section 8 and docs/product/competitive-guidance.md line 604). Loops are bounded by step, time and spend; runs survive a dropped connection and can be stopped.

**With different models, providers and the one subscription.** Budgets are enforced by AGI in the one subscription ledger, not per provider.

**Current implementation, as this trace read it on 2026-11-24: built.** Platform loop, parallel scheduler, budget and recovery done; stop partial on web and desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.22, S92.10, S92.11, S92.20, S92.22, S92.28, S92.30
- Comparison list ids: CP137, CP83
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3947`; `apps/web/lib/services/cloud-agent-budget.ts:275`

**Gap.** Stop is partial on web and desktop; a stopped answer raised an 'Agent run failed' notice.

**Acceptance criteria**

1. Press Stop; tools end and no failure notice shows.
2. A run over budget stops with a message.
3. A dropped connection resumes.

**Verification: seen failing by a person.** W-1 defect: Stop later creates 'Agent run failed'.

## CAP-tools-and-code-execution-27 Execution location and boundary labels

Telling the user whether a tool runs on the device, in a hosted sandbox, or at a provider or connector.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization): Chats continue in a per-conversation Anthropic-managed VM for code and files. Plans: Enterprise. Apps: web, desktop, mobile.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Sandbox with no external web or API access. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md sections 2.5, 4.3 and 7.1; AGENTS.md section 6). Every tool call shows whether it ran on device, on AGI servers or at an outside service. Native provider tools are never used in Local mode.

**With different models, providers and the one subscription.** Label comes from the route, not the model. Local mode fails closed and offers a fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Capability gating by model exists on desktop; sandbox network off for model code; labels per tool not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S21.29
- Comparison list ids: none matched
- Code: `apps/desktop/src/lib/modelCapabilityGates.ts:20`; `docs/decisions/wire-or-cut.md:92`

**Gap.** Per-call location label not confirmed.

**Acceptance criteria**

1. Each tool call shows device, AGI or outside service.
2. In Local mode no tool call reaches a hosted service.
3. A hosted fork asks for consent and names the provider.

**Verification: not verified.** Code and docs only.

## CAP-tools-and-code-execution-28 Usage accounting for tool and code use

Tool use, file creation and sandbox time draw from plan limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): File creation draws from plan limits and uses more than ordinary chat. Apps: web, desktop, mobile.
  - [https://support.claude.com/en/articles/9797557-usage-limit-best-practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices): Tool use affects usage limits. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, mobile.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Allowance depends on model, tools, retrieval and speed mode. Plans: Pro.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 287 (usage display) and the one-subscription requirement). All tool and sandbox use is metered by the one AGI Subscription system on every app; public clients see only percentages, never provider cost.

**With different models, providers and the one subscription.** Same meter for any provider; Local runs are free and not metered.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Sandbox rate card priceable; per-run budgets done; per-tool cost not applicable on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S57.38, S92.28
- Comparison list ids: none matched
- Code: `apps/web/lib/services/cloud-agent-budget.ts:275`

**Gap.** Sandbox metering is waiting on the production switch-on.

**Acceptance criteria**

1. A sandbox run raises the usage percent.
2. A Local run does not.
3. No cost figures reach the public client.

**Verification: not verified.** Code and ledger only.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether sandboxed code and web search run without asking in the default read-only mode everywhere. D-2026-09-15-01 says yes, but a web Work test showed approvals.
- Whether to match features only one leader documents: Claude Cowork VM and computer use for chat, ChatGPT site tools (WebMCP), Python in canvas.
- Whether interactive charts and tables stay free or are plan-limited, since one ChatGPT page limits them to Plus and Pro.
- Whether inline visuals should appear on mobile; Claude does not render them there, ChatGPT does.
- Whether the hosted sandbox network default should be off or package managers only (Claude's default).
- Whether Free users get hosted code execution or only Local, given its metered cost.

## Could not establish

- No Claude page in the catalogue describes run-code controls (stdin, stop, reset) or exact tool-call display in the chat product; marked unknown.
- ChatGPT tool access mode and on-demand loading for chat: not in the catalogue.
- I did not open the saved pages; I used catalogue lines and their urls only.
- Whether Codex pages describe features shared with ChatGPT chat is unclear beyond the plugin wording.
- Whether the web production sandbox is on today: ledger says switch-on pending, not checked live.
- Mobile, desktop, CLI, VS Code and Chrome have no human results for this topic; only web scorecards W-8, W-9, W-15 apply.
- Why web Work mode asked for approval despite decision D-2026-09-15-01 was not traced in code.
- Scorecard rows use model names that I left out on purpose; which model produced which failure is not recorded here.

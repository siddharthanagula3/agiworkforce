---
id: "GAPS-AREA-057"
type: "gap-list"
title: "Gaps: Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 57. Tool catalog and invocation experience

76 open gaps that touch this area. Area page: [20-features/057-tool-catalog-and-invocation-experience](../../20-features/057-tool-catalog-and-invocation-experience/README.md).

## CMP-M131

**Per-connected-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Connector details show granted scopes read-only; no per-account permission.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:900

## CMP-MP31

**Data analysis with code run in a sandbox**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Interactive data tables from analysis were not found Code execution runs and its code shows in chat; interactive data tables from analysis were not found.
- Evidence: apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx; lib/v1FeatureFlags.ts:codeExecution=true

## CMP-MP60

**Run a code block and see the console output**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: No Run on any code block Code the assistant already ran can be run again with a confirm and stopped; no Run on any code block.
- Evidence: apps/mobile/src/features/chat/components/CodeRunAgain.tsx:56; ToolCallTimeline.tsx:435

## CMP-MP61

**Per-tool permission for a connector: Allow, Ask or Block**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No separate read-only versus low-risk levels Each tool has Allow, Ask or Block; no separate read-only versus low-risk levels.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:91; :222

## CMP-MP63

**Approval card: Deny, Allow once, Allow for chat, Always allow, plus low-risk**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No low-risk level Card offers Allow once, Allow for this chat, Always allow and Deny; no low-risk level.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:23; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:151

## CMP-MP65

**Confirmation before connected apps book or buy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No booking or buying connectors to confirm Tool approval cards show what is at stake before an action; no booking or buying connectors to confirm.
- Evidence: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:209

## CMP-VP37

**Sandbox choice for commands**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Commands are sandboxed by default: the process default is Contained and launch_mode with no flags returns Contained (ap… Contradicts row 'Switch the command sandbox mode', rated Partial for the same thing. Commands are sandboxed by default: the process default is Contained and launch_mode with no flags returns Contained (apps/cli/src/sandbox.rs:8,11-25,2939). The editor has no control to see or change it (grep sandbox
- Evidence: searched: sandbox in apps/extension-vscode/src (only a handoff label)

## CMP-W245

**Per-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Tool permissions are saved per user, connector and tool, not per connected account.
- Evidence: apps/web/app/api/connectors/permissions/route.ts:42-60

## CMP-WP159

**Setting for internet access and code execution from chat and shell commands**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: There is no separate public-internet switch or workspace default You can turn cloud code execution on or off in Capabilities settings; there is no separate public-internet switch or workspace default.
- Evidence: apps/web/features/settings/sections/CapabilitiesSection.tsx:52,118; apps/web/lib/server/code-execution-policy.ts

## CMP-WP162

**Account-wide default for tool approvals (ask, read-only, low-risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals; one setting for all chats and Work.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:61; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1895

## CMP-WP173

**Allow all actions for one plugin (elevated risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: There is no one-click allow-all per connector A tool can be set to Allow, and the account default can be Skip approvals; there is no one-click allow-all per connector.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:71; searched: Allow all actions in features/connectors

## CMP-WP89

**Interactive table view for uploaded data**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Row and column selection to ask about was not found Spreadsheet, table and CSV artifacts render as tables; row and column selection to ask about was not found.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1802

## GAP-AREA057-LW01

**Three different sandbox checks. e2bExecutionEnabled is true with the key alone; e2bCutoverEnabled needs the flag only; e2bProvisioningReady needs the flag, the key and a price. The execution tool check in the tool loop uses only the flag, so the flag on with no key or no price passes that check.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-057
- Detail: Area 57. Tool catalog and invocation experience
- Evidence: apps/web/lib/e2b/gate.ts:9-13, 16-18, 20-28; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802

## GAP-CAP-connectors-apps-and-extensions-11

**Approval and per-tool permission for connector actions: No 'allow all for one plugin' on web, no per-account override with reset, mobile approval card partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Requirement items: S55.27, S57.27, S57.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-01

**Sandboxed code execution in chat: Web cloud sandbox is not switched on in production per the ledger. Mobile data analysis in a sandbox and run-code are partial. A tool-step failure showed 'No module named pymupdf' in the web sandbox.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S21.12, S57.05, S57.10, S57.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-04

**Data analysis on uploaded files: Mobile partial; no drive/OneDrive import evidence checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S57.10
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-06

**File creation: Word, Excel, PowerPoint, PDF, CSV: Excel with a SUM formula failed on Free and Ultra web accounts; a retry gave a false 'tool isn't available'. CLI and VS Code have no document tools.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-05](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Requirement items: S57.07, S57.08, S57.09
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-tools-and-code-execution-15

**Tool access mode and on-demand tool loading: VS Code lacks MCP tool loading on demand per comparison; none known otherwise.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-11](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md), [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Requirement items: S57.28, S57.29, S92.02, S92.03
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-tools-and-code-execution-19

**Agent browser and computer use: Missing on web and mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Requirement items: S57.13, S57.14, S57.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-21

**OS sandbox for shell commands in coding tools: Windows sandbox missing in CLI; many managed sandbox knobs missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S57.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-23

**Tool call display in the transcript: Web display defects after Stop; a visible 'The tool failed' with raw error text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F092-02](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Requirement items: S57.31, S57.32, S57.33, S57.34, S92.05, S92.07
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-tools-and-code-execution-24

**Tool errors, retry and large-result references: No in-place retry of a failed tool on web, desktop or mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-04](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md), [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Requirement items: S57.35, S57.36, S92.07, S92.09, S92.18
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-tools-and-code-execution-25

**Tool action receipts and activity review: Mobile receipts not marked in the ledger.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Requirement items: S57.37, S92.17
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-tools-and-code-execution-28

**Usage accounting for tool and code use: Sandbox metering is waiting on the production switch-on.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Requirement items: S57.38, S92.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F057-01-01

**The model is not told it can read PDF and Office files by reference because the description version is internal only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-01](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome, API. Work needed: Advance the prompt to canary with an eval quality signal, then stable.
- Evidence: packages/ai/model-registry/catalog/routing-policies.json:157-163

## GAP-F057-01-02

**The brief's code line references are stale: ChatComposerNew.tsx:2636 now lies in image mode code, and dispatcher.ts lines moved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-01](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)
- Detail: Affects: Documentation readers. Work needed: Refresh the brief's references.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2620-2660

## GAP-F057-01-03

**No evidence of search or fetch in on-device Local mode on Mobile or Desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-01](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)
- Detail: Affects: Mobile and Desktop Local mode. Work needed: Decide the Local rule, then wire or document it.
- Evidence: apps/mobile/stores/chat/localSystemPrompt.ts has no tool text

## GAP-F057-01-04

**Empty-result message not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-01](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)
- Detail: Affects: All apps with search. Work needed: Verify by running or add an explicit no-results card text.
- Evidence: not found in web-search-tool.ts read

## GAP-F057-01-PARTLY

**Web search and page reading: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F057-01](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)
- Requirement items: S57.03
- Detail: Web S57.03: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161) | Desktop S57.03: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161) | Mobile S57.03: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval signal; server-only, the phone uses the same completions path | Chrome S57.03: Same as web: url_fetch reads PDF and Office files by URL (d67ced36f), but the served tool description is still v1 until tool.url_fetch_description@2 advances to stable; uploaded files and connector sources are still not opened by reference.

## GAP-F057-02-01

**Sandbox file tools are off in production so Web, Mobile, Chrome and API cannot read, write or edit files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)
- Detail: Affects: Web, Mobile, Chrome, API. Work needed: Set AGI_E2B_EXECUTION=1 and E2B_API_KEY, confirm compute price, redeploy, live check.
- Evidence: brief S57.05/S57.06/S57.12 Unfinished; apps/web/lib/e2b/gate.ts:20-27

## GAP-F057-02-02

**Brief says dispatcher.ts:724 and similar; the file has moved and cites are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)
- Detail: Affects: Documentation. Work needed: Update brief references.
- Evidence: apps/desktop/electron/runtime/dispatcher.ts:665-700 and 2337

## GAP-F057-02-03

**Trash-before-overwrite on Desktop writes was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)
- Detail: Affects: Desktop. Work needed: Read filesystemService.ts writeTextFile and add a test if missing.
- Evidence: AGENTS.md section 9 requires it; writeTextFile read not done

## GAP-F057-02-PARTLY

**Your files: find, read, write and edit: partly built on Web, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Mobile, Chrome
- Features: [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)
- Requirement items: S57.05, S57.06, S57.12
- Detail: Web S57.05: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S57.06: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S57.12: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F057-03-01

**Sandbox off in production: Web code execution may fall back to provider tools only for three providers; Mobile and Chrome shell does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Affects: Web, Mobile, Chrome, API. Work needed: Enable the sandbox; decide on Mobile and Chrome shell.
- Evidence: brief S57.10/S57.11; execution-tools.ts:216-270

## GAP-F057-03-02

**Draft said all runs return an exit code; sandbox notebook cells have none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Affects: Web, Mobile, Chrome. Work needed: Fix doc and card copy.
- Evidence: apps/web/lib/e2b/execution-tools.ts:70-76

## GAP-F057-03-03

**Mobile Local mode cannot run code at all.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Affects: Mobile Local. Work needed: Decide if a local runtime is wanted.
- Evidence: apps/mobile/src/features/settings/capabilities/index.tsx:~160

## GAP-F057-03-NOTBUILT

**Running code and shell commands: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S57.11
- Detail: Mobile: S57.11; Chrome: S57.11

## GAP-F057-03-PARTLY

**Running code and shell commands: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Requirement items: S57.11
- Detail: Web S57.11: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F057-04-01

**No computer action on CLI, VS Code, Chrome, Web or Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Detail: Affects: those apps. Work needed: Decide whether any should offer it.
- Evidence: brief S57.15

## GAP-F057-04-02

**Browser control depends on Chrome pairing, which the draft did not mention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Detail: Affects: Desktop users. Work needed: Explain in onboarding.
- Evidence: apps/desktop/electron/browser/browserSteps.ts:19, :75

## GAP-F057-04-03

**Brief cites dispatcher.ts:837 and :1072; these lines are not the cited code any more.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: dispatcher.ts:1086-1112, :2602

## GAP-F057-04-04

**Web has no browser tools (missing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Detail: Affects: Web. Work needed: Product decision (cloud browser is a different boundary).
- Evidence: brief S57.13/S57.14

## GAP-F057-04-NOTBUILT

**Browser and computer control: not built on Web, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI, VS Code
- Features: [F057-04](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Requirement items: S57.13, S57.14, S57.15
- Detail: Web: S57.13, S57.14, S57.15; Mobile: S57.13, S57.14; CLI: S57.15; VS Code: S57.15

## GAP-F057-05-01

**CLI and VS Code cannot create Office files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-05](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide: add a tool or mark not applicable.
- Evidence: brief S57.07-S57.09

## GAP-F057-05-02

**Draft said only xlsx, docx, pptx; the tool also makes pdf and csv.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-05](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: managed-office-file-service.ts:240

## GAP-F057-05-03

**Render check and recalculation need the sandbox, which is off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-05](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Enable the sandbox (see F057-02).
- Evidence: managed-office-file-service.ts:962

## GAP-F057-05-NOTBUILT

**Office documents and spreadsheets: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F057-05](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Requirement items: S57.07, S57.08, S57.09
- Detail: CLI: S57.07, S57.08, S57.09; VS Code: S57.07, S57.08, S57.09

## GAP-F057-06-01

**No image-chat test file next to image-chat-tools.ts was found (only provider scope test).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-06](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)
- Detail: Affects: All apps. Work needed: Add unit tests for intent refusal, edit source and withdrawn statuses.
- Evidence: git ls-files apps/web/app/api/media/image/lib

## GAP-F057-06-02

**Brief says Chrome has no image tools but the server surface table includes chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-06](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)
- Detail: Affects: Chrome. Work needed: Check whether the extension renders image cards; align brief or code.
- Evidence: image-chat-tools.ts:47-52

## GAP-F057-06-03

**CLI edit and VS Code images missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-06](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide scope.
- Evidence: brief S57.16/S57.17

## GAP-F057-06-04

**Mobile image generation matrix cell is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-06](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)
- Detail: Affects: Mobile. Work needed: Run on device.
- Evidence: docs/product/surface-feature-matrix.md:66

## GAP-F057-06-NOTBUILT

**Images and video: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F057-06](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)
- Requirement items: S57.16, S57.17
- Detail: CLI: S57.17; VS Code: S57.16, S57.17; Chrome: S57.16, S57.17

## GAP-F057-07-01

**Speech generation exists as a read-aloud endpoint but the brief says it is not applicable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-07](../../20-features/057-tool-catalog-and-invocation-experience/F057-07-speech-in-and-out.md)
- Detail: Affects: Web and Mobile read aloud. Work needed: Decide whether to document read aloud as its own feature and update the brief.
- Evidence: apps/web/lib/hooks/useTTS.ts:10; apps/mobile/src/features/voice/services/serverSpeech.ts:10; brief S57.20

## GAP-F057-07-02

**Transcription is tied to one provider.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-07](../../20-features/057-tool-catalog-and-invocation-experience/F057-07-speech-in-and-out.md)
- Detail: Affects: All callers. Work needed: A second provider route if provider agnosticism must hold for speech.
- Evidence: route.ts:500-505

## GAP-F057-07-03

**No Local (on-device) transcription found in this endpoint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-07](../../20-features/057-tool-catalog-and-invocation-experience/F057-07-speech-in-and-out.md)
- Detail: Affects: Mobile and Desktop Local mode. Work needed: Check SYS-local-inference and SYS-voice-and-media for a device path.
- Evidence: Server-only handler

## GAP-F057-08-01

**No list or delete schedule tool on the hosted route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-08](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Add hosted list and delete tools, with an approval for delete.
- Evidence: schedule-tool.ts:16-27 versus tool_catalog.rs:839-880

## GAP-F057-08-02

**The brief's memory card is not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-08](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Confirm intent; add a card or fix the brief.
- Evidence: No component found by search; labels only in apps/web/lib/tool-copy.ts:114-128

## GAP-F057-08-03

**Hosted memory and schedule tools are not offered on CLI and VS Code Cloud chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-08](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)
- Detail: Affects: CLI, VS Code. Work needed: None if the CLI tools are the intended path; document it.
- Evidence: request-processor.ts:1111-1114

## GAP-F057-08-04

**Hosted 'forget always asks' rests on tool metadata, not a dedicated check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-08](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Add a test that forget_memory asks under every policy.
- Evidence: tool-metadata.ts:290-295; tool-metadata.ts:1083-1100

## GAP-F057-09-01

**Brief says messaging is done on all apps; in code it is switched off for every unreleased connector.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-09](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)
- Detail: Affects: All six apps and the API. Work needed: Release the connector ids or correct the brief and tests.
- Evidence: connector-release.ts:14-30; user-connector-tools.ts:2537

## GAP-F057-09-02

**Google Calendar OAuth client is not created.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-09](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)
- Detail: Affects: All apps. Work needed: Owner creates the client and sets CONNECTOR_OAUTH_PROVIDERS_JSON.
- Evidence: doc: area brief S57.22 Unfinished

## GAP-F057-09-03

**Google Calendar and Slack tools have no risk metadata.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-09](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)
- Detail: Affects: All apps after release. Work needed: Declare per-tool metadata.
- Evidence: tool-metadata.ts:859-868,876-882

## GAP-F057-09-04

**No Teams or other messaging send tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-09](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)
- Detail: Affects: All apps. Work needed: Design and add if wanted.
- Evidence: tool-metadata.ts:853-858

## GAP-F057-09-PARTLY

**Connected services: calendar and messages: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F057-09](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)
- Requirement items: S57.22
- Detail: Web S57.22: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app credentials (microsoft-graph.ts:360 is wired) | Desktop S57.22: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app credentials (microsoft-graph.ts:360 is wired) | Mobile S57.22: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works | Chrome S57.22: Lane ruling (R-t clarification): an MCP endpoint t

## GAP-F057-10-01

**Desktop may not be offered the clarify tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Detail: Affects: Desktop (Electron). Work needed: Verify on the running desktop; add the desktop surface if intended.
- Evidence: request-processor.ts:1279-1281 excludes surface desktop; host-headers.ts:38-52 sends desktop

## GAP-F057-10-02

**Brief marks CLI question 'unverified'; code and two tests exist but no run is recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Detail: Affects: CLI. Work needed: Run the scenarios and record results.
- Evidence: task_registry/mod.rs:1248; developer_host.rs:10644

## GAP-F057-10-03

**No delegation or approval tool on the hosted route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Product decision.
- Evidence: No matching tool in request-processor.ts

## GAP-F057-10-04

**The hosted tool description says a last resort, so cards are rare by design.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Detail: Affects: All hosted surfaces. Work needed: None; note for testers.
- Evidence: clarify-tool-service.ts:241-270

## GAP-F057-10-PARTLY

**Agents, questions and approvals: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Requirement items: S57.26

## GAP-F057-11-01

**Native provider tool search is a requirement but no use was found in the opened files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-11](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md)
- Detail: Affects: Hosted route. Work needed: Check provider adapters; add or record deviation.
- Evidence: docs/product/requirements.md:657-659; no match in tool-schema-loader.ts

## GAP-F057-11-02

**CLI and hosted ranking differ from the brief's single rule.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-11](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md)
- Detail: Affects: CLI, VS Code. Work needed: Document or align.
- Evidence: tool_search.rs:138-155 vs tool-search.ts:2-4

## GAP-F057-11-03

**The API listing at openapi.json:758 was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-11](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md)
- Detail: Affects: API. Work needed: Open and confirm.
- Evidence: Not opened

## GAP-F057-12-01

**Retry is whole-turn only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Per-tool retry if wanted.
- Evidence: MessageBubble.tsx:983-985

## GAP-F057-12-02

**Receipt omits input and covers connector tools only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide the receipt content; change brief or code.
- Evidence: ConnectorCallLog.tsx:36-37; connector-call-log-service.ts:55-70

## GAP-F057-12-03

**Stored results are capped, not whole.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: Affects: Hosted turns. Work needed: Correct the brief wording.
- Evidence: apps/web/lib/e2b/types.ts:120; tool-result-store.ts referenceOversizedToolResult

## GAP-F057-12-04

**CLI error and retry and per-call receipts could not be located; brief pointers resolve to unrelated code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Find the real code and record it.
- Evidence: apps/cli/src/claude_parity.rs:1034-1098 is table, links and schedule prompt

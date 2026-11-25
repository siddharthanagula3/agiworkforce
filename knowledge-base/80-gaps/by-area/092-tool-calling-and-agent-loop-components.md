---
id: "GAPS-AREA-092"
type: "gap-list"
title: "Gaps: Tool-calling and agent-loop components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 92. Tool-calling and agent-loop components

72 open gaps that touch this area. Area page: [20-features/092-tool-calling-and-agent-loop-components](../../20-features/092-tool-calling-and-agent-loop-components/README.md).

## CMP-C48

**Rewind menu: summarize from here or up to here**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: The picker offers restore code and conversation, conversation only, or code only.
- Evidence: apps/cli/src/tui/widgets/checkpoint_picker.rs:46-58

## CMP-C49

**Slash command /checkpoint (alias of /rewind)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: /rewind exists with no /checkpoint alias; typing /checkpoint is an unknown command.
- Evidence: apps/cli/src/tui/tui_app.rs:5986; crates/agiworkforce-command-registry/src/lib.rs:154-990 (106 built-in commands, none by this name)

## CMP-CP137

**Monitor tool that watches a background process**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: The agent has no monitor tool that wakes on output Background commands can be listed, read and stopped with /tasks, but the agent has no monitor tool that wakes on output.
- Evidence: searched: monitor, bash_output, kill_shell in apps/cli/src

## CMP-CP149

**Rewind by pressing Esc twice, and /undo**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no /undo alias Esc twice on an empty prompt opens rewind; there is no /undo alias.
- Evidence: apps/cli/src/tui/tui_app.rs:3927

## CMP-CP192

**Per-tool allow, ask and block for MCP tools**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Ask is not a forced prompt: an Ask decision falls back to require_confirmation (apps/cli/src/agent/tools.rs:77-99), whi… Allow and block are enforced, but ask is not a forced prompt: an Ask decision falls back to require_confirmation (apps/cli/src/agent/tools.rs:77-99), which is false when the session skips approvals (apps/cli/src/agent/chat.rs:2548). The leaders ask rules prompt even in bypass mode.
- Evidence: apps/cli/src/lib.rs:2162 McpSubcommand Allow/Ask/Block/Unset

## CMP-CP83

**TaskStop tool stops a background task or agent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: No tool stops a subagent by name command_stop (alias KillShell) stops a background command; no tool stops a subagent by name.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:246,225

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

## CMP-WP162

**Account-wide default for tool approvals (ask, read-only, low-risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals; one setting for all chats and Work.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:61; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1895

## CMP-WP174

**Connector tool permissions per role with conflict warnings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Roles and groups carry no connector rules Workspace tool rules set allow, ask or deny per connector tool for everyone; roles and groups carry no connector rules.
- Evidence: packages/contracts/cloud-contracts/src/connectors.ts:692-698; apps/web/lib/services/connector-policy-service.ts:43-62

## GAP-AREA092-LW06

**Two retry-safety vocabularies. The idempotency guard uses a name list (safe or unsafe) while the tool registry uses idempotent, at_most_once or unknown. The guard does not read the registry, so the two can disagree.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-092
- Detail: Area 92. Tool-calling and agent-loop components
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:921 and 932; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:961; packages/contracts/types/src/generated/protocol/ToolRetrySafety.ts:3

## GAP-AREA092-LW13

**Idempotency guard is applied by a name list (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:932) and only for the retry-unsafe kind, so a new tool is unsafe unless added to the list.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-092
- Detail: Area 92. Tool-calling and agent-loop components
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:932-944

## GAP-CAP-editing-regeneration-and-branching-11

**Stop generation: Web defects seen: false 'Free limit reached' banner after Stop; empty 'Writing response' row stays; an 'Agent run failed' notification after Stop; a stopped answer returns longer after reload; cloud task Stop adds 'model failed' text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Requirement items: S13.07, S19.17, S19.18, S91.24, S92.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-editing-regeneration-and-branching-16

**Rewind conversation and code to an earlier point: No rewind on the web or desktop Code views. CLI lacks a summarize-from-here option and retention settings.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.22, S66.23, S92.25, S99.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-12

**Tool approval card: Mobile card partial. A read-only PDF read was labelled 'High risk, can change or delete data' in the web test.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Requirement items: S92.13, S92.14, S92.15, S92.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-13

**Per-tool permission levels for connectors: Partial on mobile and role-level conflicts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Requirement items: S92.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-14

**Account-wide approval mode: Web account default partial. The decision says sandboxed code runs without asking in read-only mode, but the web Work test showed approvals.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Requirement items: S92.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-tools-and-code-execution-15

**Tool access mode and on-demand tool loading: VS Code lacks MCP tool loading on demand per comparison; none known otherwise.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-11](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md), [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Requirement items: S57.28, S57.29, S92.02, S92.03
- Detail: Claude yes, ChatGPT unknown; AGI built

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

## GAP-CAP-tools-and-code-execution-26

**Multi-step tool loop, parallel calls and background tasks: Stop is partial on web and desktop; a stopped answer raised an 'Agent run failed' notice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Requirement items: S21.22, S92.10, S92.11, S92.20, S92.22, S92.28, S92.30
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-tools-and-code-execution-28

**Usage accounting for tool and code use: Sandbox metering is waiting on the production switch-on.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Requirement items: S57.38, S92.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F092-01-01

**A deferred tool whose schema was never loaded can still be called by exact name because availableTools holds every connector tool; argument checks then use the stored schema, but the model never saw it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Detail: Affects: Web Cloud chat. Work needed: Decide and enforce: refuse or auto-load; add a test.
- Evidence: tool-loop.ts:4030-4040

## GAP-F092-01-02

**Product requirement lists modes Off and Auto-load safe tools; code offers only auto, on_demand, always.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Detail: Affects: Web and mobile settings. Work needed: Align the requirement or add the modes.
- Evidence: docs/product/requirements.md (Tool access modes) vs packages/contracts/cloud-contracts/src/tool-access-setting.ts:5

## GAP-F092-01-03

**Brief line references are stale for most items in this feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit brief S92.02 cites tool-loop.ts:2690; the selector is at tool-loop.ts:3938

## GAP-F092-01-04

**Other apps' tool lists (desktop Tauri, mobile local, VS Code, Chrome) not tied to this registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-01](../../20-features/092-tool-calling-and-agent-loop-components/F092-01-tool-list-risk-labels-and-tool-search.md)
- Detail: Affects: Desktop (Tauri), CLI, extensions. Work needed: Map each surface to the shared primitive (wire-or-cut decision D-P0-5 says per-surface adoption follows: docs/decisions/wire-or-cut.md:506).
- Evidence: CLI uses its own ToolDefinition (apps/cli/src/platform/runtime/tool_catalog.rs:11)

## GAP-F092-02-01

**Validation does not look inside nested objects, arrays, ranges or patterns, and skips composite schemas.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-02](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)
- Detail: Affects: Web Cloud chat, all connectors. Work needed: Use a full validator or extend the checks and add tests.
- Evidence: packages/ai/provider-protocol/src/tool-argument-validation.ts:80,96-105

## GAP-F092-02-02

**Stale comment says malformed arguments still run on raw text; code refuses them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-02](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)
- Detail: Affects: Engineers and testers reading the code. Work needed: Correct the comment; keep a test that locks the refusal.
- Evidence: tool-loop.ts:910-917 vs tool-argument-validation.ts:78

## GAP-F092-02-03

**256 K cap only on streamed parsing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-02](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)
- Detail: Affects: Resumed or stored tool calls. Work needed: Apply the cap in both parsers.
- Evidence: tool-loop.ts:3026-3057

## GAP-F092-02-04

**The brief and the first draft state malformed calls run; the brief line numbers (2835, 4178, 1717, 2197) do not match the files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-02](../../20-features/092-tool-calling-and-agent-loop-components/F092-02-checking-tool-arguments-and-reading-tool-calls.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit brief S92.04 and S92.05

## GAP-F092-03-01

**Parallel execution silently depends on a harness flag; many routes run serially.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Detail: Affects: Web Cloud chat. Work needed: Report the effective concurrency in diagnostics and verify with a run.
- Evidence: tool-loop.ts:5398-5403

## GAP-F092-03-02

**Not all tool results are shown to be wrapped as untrusted data.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Detail: Affects: Web Cloud chat. Work needed: Audit each executor's output wrapping; add a test.
- Evidence: tool-loop.ts:2230-2240 only covers errors

## GAP-F092-03-03

**Brief line references for S92.06, S92.10, S92.11, S92.20 and S92.26 do not match current files; research-loop.ts:2399-2468 is provider stream code, not the completion check, which lives in turn-completeness.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit brief S92.26

## GAP-F092-03-04

**Rust engine runs the concurrent batch with unbounded join_all.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Detail: Affects: CLI and internal desktop. Work needed: Add a cap and a test if needed.
- Evidence: crates/agiworkforce-agent-core/src/engine.rs:150-165

## GAP-F092-03-05

**Dependency-aware ordering and sub-agents are not implemented on the hosted platform.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Detail: Affects: All hosted apps. Work needed: Decide scope; product decision needed.
- Evidence: Brief S92.12, S92.24

## GAP-F092-04-01

**No person-facing path to fetch a stored result; brief says 'the model and user'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-04](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md)
- Detail: Affects: Web, mobile, all apps. Work needed: Add a route or UI, or change the requirement.
- Evidence: Search of tool-result-store.ts shows only the model tool

## GAP-F092-04-02

**Silent downgrade to truncation when the store is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-04](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md)
- Detail: Affects: Deployments without a key-value backend. Work needed: Log or expose a metric when downgraded.
- Evidence: tool-result-store.ts:168-169

## GAP-F092-04-03

**Brief line numbers 2176, 3087, 4233 do not match the files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-04](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit brief S92.09

## GAP-F092-04-04

**Durable storage of tool calls with the run (S92.08) not examined here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-04](../../20-features/092-tool-calling-and-agent-loop-components/F092-04-large-tool-results.md)
- Detail: Affects: Documentation. Work needed: Verify in the data model.
- Evidence: Brief S92.08

## GAP-F092-05-01

**Per-call decision record is an event and an audit row, not a table; the brief implies a decision store.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Affects: Auditors and testers. Work needed: Confirm it meets 'recorded per call' or add a store.
- Evidence: 0062 migration table has run-level state only (lines 8-24); approve/route.ts:629-642

## GAP-F092-05-02

**Brief line numbers 2578, 1605, 3731, 4494 for the evaluator and decisions do not match the files; the gate lives in tool-call-gate.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit briefs S92.13 to S92.16

## GAP-F092-05-03

**Apps differ: Desktop Tauri, CLI and mobile have their own approval UIs and local confirmation rules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Affects: Desktop, CLI, mobile. Work needed: Run per-app approval tests against the hosted gate table.
- Evidence: tool_confirmation.rs, managed_approvals.rs, CloudToolApprovalControls.tsx

## GAP-F092-05-04

**Documented posture says website accounts default to autonomous approvals; the shared default is ask_every_time, so different surfaces can behave differently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Affects: New accounts across apps. Work needed: Test each app against the account default.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:11-13; docs/security/security.md section 1.1

## GAP-F092-06-01

**Migration 0223 states it is not yet applied; its application status in each environment is not shown by the repo.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: Web and mobile Recent calls. Work needed: Check the migration status (pnpm db:migrate -- status) and correct the header.
- Evidence: 0223_connector_call_events.sql:4

## GAP-F092-06-02

**Log rows can be lost silently by design.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: Receipt completeness. Work needed: Decide if receipts need a retry queue; at least count dropped rows.
- Evidence: connector-call-log-service.ts:46-52

## GAP-F092-06-03

**Reconciliation exists only for two GitHub tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: All other external writes. Work needed: Add per-connector reconciliation.
- Evidence: user-connector-tools.ts:499-540

## GAP-F092-06-04

**Platform tool actions have an audit row but no person-facing receipt screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: Web, mobile. Work needed: Add a reader or change the requirement.
- Evidence: No screen found; only ConnectorCallLog.tsx

## GAP-F092-06-05

**Idempotency 'safe' name list is separate from metadata retrySafety.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: Web Cloud chat. Work needed: Use one source and test.
- Evidence: tool-loop.ts:932-943 vs tool-metadata.ts:961-969

## GAP-F092-06-06

**Brief line references 2586, 33, 119, 17, 865, 406-512 mostly do not match current files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-06](../../20-features/092-tool-calling-and-agent-loop-components/F092-06-receipts-retries-and-outcome-checks.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: audit briefs S92.17 to S92.19

## GAP-F092-07-01

**Plan steps are not stored or updated while a run proceeds; only an empty plan and its final status are written.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: Web Work mode; any app that would read the stored plan. Work needed: Write steps and status changes from the tool loop; add tests.
- Evidence: apps/web/lib/workflows/steps/work-plan-steps.ts:29-36; apps/web/lib/services/work-plan-service.ts:365-370

## GAP-F092-07-02

**Migration for plan tables is marked not yet applied in its header; applied state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: Production Work runs. Work needed: Check migration status (pnpm db:migrate -- status) and update the header or apply.
- Evidence: apps/web/db/neon/0237_work_plans.sql:3

## GAP-F092-07-03

**No run-level lease or 'abandoned' state; the brief wording does not match the schema.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: Engineers and testers reading the brief. Work needed: Correct the brief wording or add the field.
- Evidence: apps/web/db/neon/0061_cloud_agent_runs.sql:17-22; cloud-agent-run-reaper.ts:112

## GAP-F092-07-04

**Client reconnection is not shown to be complete on each app; only the presence of followRun is established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: Desktop, Mobile, Chrome, VS Code. Work needed: Drive each app through a dropped connection and record results.
- Evidence: apps/desktop/src/runtime/CloudRuntime.ts:700; apps/mobile/services/streaming.ts:478

## GAP-F092-07-05

**CLI does not use the hosted journal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: CLI. Work needed: Decide if the CLI needs it.
- Evidence: search of apps/cli/src for completions/runs found nothing

## GAP-F092-07-06

**Request-scoped fallback loses durability silently for the person.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md)
- Detail: Affects: Web turns that fall back. Work needed: Optionally tell the person the turn cannot be detached.
- Evidence: apps/web/app/api/llm/v1/chat/completions/route.ts:1001-1018

## GAP-F092-08-01

**No up-front reservation; check happens only before each model call against spend so far.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: Affects: Cloud runs on web and other apps. Work needed: Decide: reserve an estimate, or accept and document overshoot; fix the brief.
- Evidence: apps/web/lib/services/cloud-agent-budget.ts:275-284

## GAP-F092-08-02

**Inline fallback and scheduled runs are not under the budget.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: Affects: Web turns that fall back; scheduled runs. Work needed: Call the authorization in those paths or document why not.
- Evidence: apps/web/lib/services/scheduled-agent-executor.ts:595-640; callers of executeCloudAgentOperation are workflow files only

## GAP-F092-08-03

**The refusal code is not carried to the UI and the message path through the failure classifier is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: Affects: Every app showing a Cloud run. Work needed: Pass the code and message in the error event; test on each app.
- Evidence: apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts:34-39; no consumer of the codes outside the service

## GAP-F092-08-04

**Table supports subagent caps that no code applies.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: Affects: Future subagents. Work needed: Either build the subagent coordinator or remove unused columns.
- Evidence: apps/web/db/neon/0258_cloud_agent_run_budgets.sql:49-52

## GAP-F092-08-05

**Caps are fixed constants; no per-plan or per-person value.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-08](../../20-features/092-tool-calling-and-agent-loop-components/F092-08-budgets-and-loop-limits.md)
- Detail: Affects: All plans. Work needed: Product decision.
- Evidence: apps/web/lib/services/cloud-agent-budget.ts:23-27

## GAP-F092-09-01

**Scheduled runs are limited to about 40 seconds and do not use the durable run journal, checkpoints or the F092-08 budget.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-09](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)
- Detail: Affects: Web scheduled tasks and the CLI and mobile clients that create them. Work needed: Decide whether long scheduled work should move to the durable workflow.
- Evidence: apps/web/app/api/cron/run-schedules/route.ts:16, 47-52; apps/web/lib/services/scheduled-agent-executor.ts:595-640

## GAP-F092-09-02

**Brief says tools needing approval are refused; code withholds or pauses them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-09](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)
- Detail: Affects: Brief accuracy; testers. Work needed: Correct the brief.
- Evidence: apps/web/lib/services/scheduled-agent-executor.ts:374-381, 619-620

## GAP-F092-09-03

**Shortest interval is 15 minutes (sweep cadence) and the sweep can be paused by low power.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-09](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)
- Detail: Affects: All schedule users. Work needed: None if intended; keep the form note.
- Evidence: packages/platform/utils/src/scheduling/schedule-time.ts:259; cron-low-power.ts

## GAP-F092-09-04

**No Local-mode or on-device scheduler for free, byok or local-only plans on the hosted path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-09](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)
- Detail: Affects: Local and own-key users. Work needed: Product decision on whether schedules should work without a paid plan.
- Evidence: packages/contracts/types/src/billing-catalog.ts:590-640

## GAP-F092-09-05

**Mobile, CLI and Chrome schedule screens were not examined.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-09](../../20-features/092-tool-calling-and-agent-loop-components/F092-09-scheduled-unattended-runs.md)
- Detail: Affects: Mobile, CLI, Chrome. Work needed: Read and drive each app.
- Evidence: apps/mobile/src/features/schedules/service.ts; apps/cli/src/schedules.rs

## GAP-F092-10-01

**Brief and code disagree on name collisions (project vs user).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: CLI users and testers. Work needed: Decide the rule, then fix brief, help or code.
- Evidence: apps/cli/src/agents.rs:331-352, 2217

## GAP-F092-10-02

**Brief says no hosted definition store and no subagents; code has a hosted store and a CLI subagent manager.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: Brief accuracy for web and CLI. Work needed: Correct item statuses S92.21 and S92.24 and the CLI folder name.
- Evidence: apps/web/db/neon/0370_user_agents.sql; apps/cli/src/subagent.rs:429-453

## GAP-F092-10-03

**No hosted subagent coordinator; budget tree columns are unused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: Cloud agent runs on all apps. Work needed: Build or remove.
- Evidence: apps/web/db/neon/0258_cloud_agent_run_budgets.sql:46-50

## GAP-F092-10-04

**Hosted agents are not run by the durable runtime as definitions; they shape a normal chat or schedule turn.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: Web. Work needed: Confirm that is the intended meaning of 'can be run by the runtime'.
- Evidence: apps/web/lib/agents/agent-turn-config.ts:57-110

## GAP-F092-10-05

**Agent definitions on Desktop, Mobile, Chrome, VS Code and sync of CLI files to the account were not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: Those apps. Work needed: Search and decide scope.
- Evidence: not found in files read

## GAP-F092-10-06

**The retired execute route is still deployed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F092-10](../../20-features/092-tool-calling-and-agent-loop-components/F092-10-agent-definitions-and-subagents.md)
- Detail: Affects: Any old client. Work needed: Remove when no caller remains.
- Evidence: apps/web/app/api/agents/execute/route.ts

---
id: "GAPS-AREA-101"
type: "gap-list"
title: "Gaps: Shared package boundaries"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 101. Shared package boundaries

48 open gaps that touch this area. Area page: [20-features/101-shared-package-boundaries](../../20-features/101-shared-package-boundaries/README.md).

## GAP-F101-01-01

**141 client-called routes have no shared schema**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: All apps that call settings, admin, developers, billing, media, code and skills routes. Work needed: Move each body schema into a shared package and delete the baseline row
- Evidence: scripts/config/route-shared-contracts-baseline.json

## GAP-F101-01-02

**No TypeScript test reads the cloud-contracts golden files, so S101.35 covers Rust only as far as found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: Server and TS clients. Work needed: Add parse tests for each golden file with its schema
- Evidence: Search for *.golden.json found only CLI and skills tests

## GAP-F101-01-03

**cloud-history-pages golden file has no reader found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: CLI history reads. Work needed: Wire it into a test or remove it
- Evidence: apps/cli/src/cloud/contract_fixtures.rs:44-95

## GAP-F101-01-04

**Usage and billing models are checked by the protocol parity check, not by golden fixtures**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: CLI and web usage screens. Work needed: Add golden usage fixtures or accept the parity check as the evidence
- Evidence: scripts/check-protocol-types.mjs:218

## GAP-F101-01-05

**Tolerant parsing: Mobile drops bad feed rows; connector policy parse returns ungoverned**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: Mobile notifications; connector policy display on clients. Work needed: Decide per case whether to fail visibly
- Evidence: apps/mobile/src/features/notifications/accountFeed.ts:40; packages/client/client-runtime/src/connectors/parse.ts:76-81

## GAP-F101-01-06

**The brief's count (164) and the repository baseline (141) differ**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-01](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)
- Detail: Affects: Reports that quote the brief. Work needed: Update the brief
- Evidence: scripts/config/route-shared-contracts-baseline.json

## GAP-F101-02-01

**Client error mapping is not established: no app imports the taxonomy's describe, classify or retry functions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-02](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)
- Detail: Affects: All apps. Work needed: Confirm how each client maps errors, or adopt the helpers
- Evidence: Search of apps and packages found these names only in packages/contracts/types/src/error-taxonomy.ts and its tests

## GAP-F101-02-02

**Brief cites a 31-line file for error definitions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-02](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)
- Detail: Affects: Readers of the brief. Work needed: Correct the brief cites to error-taxonomy.ts
- Evidence: apps/web/shared/lib/error-utils.ts:1-31

## GAP-F101-02-03

**Mobile push groups differ from shared notification categories**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-02](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)
- Detail: Affects: Mobile notification preferences versus feed. Work needed: Document the mapping or align
- Evidence: apps/mobile/stores/notificationPrefsStore.ts:14-16

## GAP-F101-02-04

**Invalid feed rows are dropped without a signal**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-02](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)
- Detail: Affects: Mobile. Work needed: Report dropped rows
- Evidence: apps/mobile/src/features/notifications/accountFeed.ts:40

## GAP-F101-02-05

**Only 15 audit types map to domain events**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-02](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)
- Detail: Affects: Consumers of domain events. Work needed: Decide which other audit types need events
- Evidence: apps/web/lib/audit-domain-events.ts:17-34

## GAP-F101-03-01

**Tauri renderer keeps private provider and media type lists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-03](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)
- Detail: Affects: Desktop (internal Tauri build). Work needed: Read provider ids from the shared catalogue
- Evidence: apps/desktop/src/types/provider.ts:1-27

## GAP-F101-03-02

**Brief lists a Mobile provider stream client with its own list; not found by name**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-03](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)
- Detail: Affects: Mobile. Work needed: Locate the file or correct the brief
- Evidence: search of apps for providerStreamClient found nothing

## GAP-F101-03-03

**Local MCP policy is advisory only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-03](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)
- Detail: Affects: CLI, VS Code local runtime. Work needed: Accept as documented, or add a server-side control
- Evidence: scripts/config/workspace-policy-enforcement-baseline.json:9

## GAP-F101-03-04

**null limit text is ambiguous: a null limit with a limit error reads as 'cannot share right now'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-03](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)
- Detail: Affects: Workspace admins. Work needed: Decide the wording for an unbounded plan
- Evidence: apps/web/lib/services/org-entitlements.ts:156,164

## GAP-F101-04-01

**Reconnect is not shared; only Mobile has run-follow recovery in the files opened**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-04](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)
- Detail: Affects: Chrome, VS Code, Desktop, Web. Work needed: Move run follow into a shared module or confirm each client's own recovery
- Evidence: packages/client/client-runtime/src/sse.ts (no reconnect); apps/mobile/services/streaming.ts:1015

## GAP-F101-04-02

**CLI device flow is a separate Rust copy**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-04](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)
- Detail: Affects: CLI. Work needed: Add golden fixtures for device bodies
- Evidence: apps/cli/src/oauth.rs:75,133,191

## GAP-F101-04-03

**Mobile and Chrome have no shared device sign-in caller found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-04](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)
- Detail: Affects: Mobile, Chrome. Work needed: Confirm their sign-in path and update the brief
- Evidence: search of apps/mobile and apps/extension

## GAP-F101-04-04

**Idempotency evidence is by code reading, not by a guard on client writes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-04](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add a client-side check
- Evidence: scripts/check-idempotency.mjs:1-4

## GAP-F101-04-05

**Electron main process managed-cloud client status unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-04](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)
- Detail: Affects: Desktop. Work needed: Inspect the main process
- Evidence: brief S101.11; apps/desktop/electron not opened

## GAP-F101-05-01

**Queue size differs by app (20 in VS Code, 100 default elsewhere)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-05](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)
- Detail: Affects: VS Code, Chrome, Mobile, Web. Work needed: Choose one stated cap or document the difference
- Evidence: packages/client/client-runtime/src/queue/types.ts:9; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:276

## GAP-F101-05-02

**CLI keeps its own state and sync logic**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-05](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)
- Detail: Affects: CLI. Work needed: Extend golden coverage or share logic
- Evidence: apps/cli/src/cloud/contract_fixtures.rs:44-95

## GAP-F101-05-03

**VS Code local-runtime tool progress bypasses the reducer (per brief)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-05](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)
- Detail: Affects: VS Code. Work needed: Add a runtime-event adapter
- Evidence: (doc: area-briefs/101-shared-package-boundaries.md S101.13)

## GAP-F101-05-04

**Chrome schedule-run vocabulary differs from task states**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-05](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)
- Detail: Affects: Chrome. Work needed: Map schedule-run status to the shared stages
- Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:1049-1062

## GAP-F101-05-05

**Chrome and VS Code private sync code extent unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-05](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)
- Detail: Affects: Chrome, VS Code. Work needed: Measure what remains private
- Evidence: imports at conversationSync.ts:9-14

## GAP-F101-06-01

**Web tool metadata is a TypeScript table, not generated from Rust**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-06](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)
- Detail: Affects: Web server, all apps using cloud tools. Work needed: Generate or derive from the Rust ToolDefinition
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:101

## GAP-F101-06-02

**No plugin manifest golden fixture found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-06](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)
- Detail: Affects: Plugin installs on every surface. Work needed: Add fixtures for plugin manifests
- Evidence: search of *.golden.json

## GAP-F101-06-03

**Brief counts of undeclared tools do not match the guard**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-06](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)
- Detail: Affects: Reports using the brief. Work needed: Update the brief
- Evidence: scripts/check-tool-registry.mjs:44

## GAP-F101-06-04

**run_command approval store separation not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-06](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)
- Detail: Affects: Cloud code agent. Work needed: Inspect the approval store
- Evidence: (doc: area-briefs/101-shared-package-boundaries.md S101.20)

## GAP-F101-06-05

**Approval decision handling on Web, Desktop and Mobile UI not opened**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-06](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Read those consumers
- Evidence: only Chrome options and Mobile streaming opened

## GAP-F101-07-01

**Chrome and VS Code do not use the shared primitive library, and Chrome does not use the shared catalogue.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: Chrome and VS Code users and engineers. Work needed: Decide whether the extensions adopt shared primitives or the brief records them as exceptions; move or mirror Chrome strings.
- Evidence: apps/extension/package.json and apps/extension-vscode/package.json have no @agiworkforce/ui; apps/extension/src/i18n.ts reads chrome.i18n

## GAP-F101-07-02

**Nine Mobile modules still import raw Text or touchable controls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: Mobile. Work needed: Move each module onto the primitives, with a visual check where the Text primitive adds NativeWind classes (brief S101.31).
- Evidence: scripts/config/mobile-primitives-baseline.json

## GAP-F101-07-03

**Markdown rendering is one shared helper set but three to four separate renderers; the brief marks it done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: Web, Chrome, VS Code, Mobile. Work needed: Agree what 'one shared implementation' means, then test the same fixtures against each renderer.
- Evidence: apps/extension/src/features/side-panel/markdown.ts; apps/extension-vscode/src/webview/render.ts; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx

## GAP-F101-07-04

**Mobile is outside check:css-tokens.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: Mobile. Work needed: Confirm check:no-hex-mobile covers the same risk, or extend the guard.
- Evidence: scripts/check-css-tokens.mjs:11-47 lists desktop, web, chrome, vscode

## GAP-F101-07-05

**No declaration of which block kinds each renderer supports (S101.33 marked not applicable).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: All renderers. Work needed: Add a per-surface block-kind table and a guard, or confirm the existing content-block guard covers it (scripts/check-content-blocks.mjs, not read).
- Evidence: brief S101.33; no declaration file found

## GAP-F101-07-06

**The brief text is behind the code in three places: Mobile colours, VS Code catalogue and the baseline count (10 vs 9).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-07](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)
- Detail: Affects: Anyone relying on the brief. Work needed: Update the brief rows to match the code.
- Evidence: apps/mobile/src/ui/theme/tokens.ts:1-12; apps/extension-vscode/src/l10n/index.ts:3; scripts/config/mobile-primitives-baseline.json

## GAP-F101-08-01

**Config validation exists only for the web server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: Mobile, Chrome, VS Code, Electron, CLI. Work needed: Extend the registry or record each surface's ad hoc validation and why.
- Evidence: brief S101.36; apps/web/lib/validate-env.ts is the only registry found

## GAP-F101-08-02

**The CLI redaction is a separate Rust implementation with no link to the shared TypeScript registry found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: CLI, and anyone expecting identical markers. Work needed: Add a cross-language fixture test or generate the Rust rules from the registry.
- Evidence: apps/cli/src/secret_redaction.rs:1-30; scripts/check-security-helpers.mjs checks TypeScript helpers only

## GAP-F101-08-03

**Brief says the parity test compares the shared rules with the web copy; the code shows a fixture comparison and a web list derived from the registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: Readers of the brief. Work needed: Correct the brief wording.
- Evidence: packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts:1-22; apps/web/lib/security/secret-patterns.ts:10-38

## GAP-F101-08-04

**Brief says analytics vocabulary is web only. Code shows Web, VS Code, Chrome, Mobile and the CLI use it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: Readers of the brief; testers planning per-surface checks. Work needed: Update the brief; confirm mode gating on Chrome and Desktop.
- Evidence: apps/mobile/services/productAnalytics.ts; apps/extension-vscode/src/features/analytics/productAnalytics.ts; apps/extension/src/features/observability/productAnalytics.ts; apps/cli/src/cloud/product_analytics.rs:9

## GAP-F101-08-05

**Validator crash lets production boot.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: Web operators. Work needed: Decide whether a crashed validator in production should refuse boot.
- Evidence: apps/web/instrumentation.ts:68-72

## GAP-F101-08-06

**Chrome and VS Code redaction use different functions (logger redactor vs telemetry policy), so their markers differ.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-08](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
- Detail: Affects: Support staff reading logs from the two extensions. Work needed: Choose one policy per use and document it.
- Evidence: apps/extension/src/background/policy.ts:2; apps/extension-vscode/src/core/telemetry.ts:1

## GAP-F101-99-01

**Chrome carries its own citation marker pattern instead of the shared helper.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Detail: Affects: Chrome side panel users; consistency with Web and Mobile. Work needed: Import the shared pattern, or add a shared fixture test proving equal behaviour.
- Evidence: apps/extension/src/features/side-panel/sources.ts:6 versus packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:4

## GAP-F101-99-02

**VS Code rendering of sources was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Detail: Affects: VS Code users. Work needed: Confirm in the running panel; if absent, add rendering.
- Evidence: No citation or source rendering in apps/extension-vscode/src/webview or sidebar-webview; only schema and message posting

## GAP-F101-99-03

**The brief still lists Chrome and VS Code adoption as left, but Chrome's record type already extends the shared one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Detail: Affects: Readers of the brief. Work needed: Update the brief row.
- Evidence: apps/extension/src/features/side-panel/chat-state.ts:13,37

## GAP-F101-99-04

**The brief's evidence cites apps/web/shared/types/common.ts:203, which is a research-plan helper, not a source model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Detail: Affects: Reviewers following the brief. Work needed: Correct the code references for S101.18.
- Evidence: apps/web/shared/types/common.ts:203-216

## GAP-F101-99-05

**Desktop (Tauri renderer) and CLI terminal display of sources were not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Detail: Affects: Desktop, CLI. Work needed: Read and run.
- Evidence: apps/desktop/src/runtime/__tests__/LocalChatTurn.reopenedSources.test.tsx exists; CLI display not read

## GAP-F101-99-NOTBUILT

**Other items in Shared package boundaries: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F101-99](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)
- Requirement items: S101.39, S101.40
- Detail: CLI: S101.39, S101.40

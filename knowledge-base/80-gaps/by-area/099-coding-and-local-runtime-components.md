---
id: "GAPS-AREA-099"
type: "gap-list"
title: "Gaps: Coding and local-runtime components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 99. Coding and local-runtime components

25 open gaps that touch this area. Area page: [20-features/099-coding-and-local-runtime-components](../../20-features/099-coding-and-local-runtime-components/README.md).

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

## CMP-CP149

**Rewind by pressing Esc twice, and /undo**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no /undo alias Esc twice on an empty prompt opens rewind; there is no /undo alias.
- Evidence: apps/cli/src/tui/tui_app.rs:3927

## CMP-WP144

**Auto-fix pull requests when CI fails or reviewers comment**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: It does not run by itself Mentioning @agi-workforce on a GitHub issue or PR starts a task that reads failed checks; it does not run by itself.
- Evidence: apps/web/lib/services/cloud-code-github-task.ts:44; apps/web/lib/services/cloud-code-github-task.ts:18

## CMP-WP148

**Move a session between cloud, terminal and editor (teleport, Open in Cloud)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: The CLI and VS Code are not yet released A handoff route and VS Code handoff link exist, and the CLI signs in with agi login; the CLI and VS Code are not yet released.
- Evidence: apps/web/features/code/code-surface.ts:3; apps/web/lib/surface-status.ts:9

## CMP-WP151

**Review a pull request by commenting a mention (once, always, stop)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no always-review subscription or stop command, and drafts are skipped A mention in a pull request comment starts one review; there is no always-review subscription or stop command, and drafts are skipped.
- Evidence: apps/web/app/api/github/webhook/route.ts:211-261,295-307

## CMP-WP153

**Security review of each pull request with a severity threshold**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no severity threshold or security-only manual trigger Automatic pull request review runs a security pass beside correctness and posts inline comments, but there is no severity threshold or security-only manual trigger.
- Evidence: apps/web/lib/code-review/findings.ts:9 (REVIEW_PASSES correctness, security); apps/web/app/api/github/webhook/route.ts:600-612

## CMP-WP158

**Review finding severity labels and the reason each was flagged**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no pre-existing category or collapsed reason Inline comments carry one of four severities (blocker, major, minor, nit) and the pass name; there is no pre-existing category or collapsed reason.
- Evidence: apps/web/lib/code-review/findings.ts:6,140-152

## GAP-CAP-coding-workflows-06

**Start a cloud coding session: Local/cloud selector is partial on web and desktop, missing on mobile, CLI and VS Code (S66.04). The sandbox switch is off in the test deployment.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md), [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.01, S66.04, S66.05, S99.30
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-11

**Auto-fix a pull request after CI or review comments: No CI-status panel anywhere (S66.37); respond to review feedback missing on web, desktop, mobile and VS Code (S67.32).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.37, S67.32, S67.33, S99.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-coding-workflows-12

**Automated pull request review on GitHub: No check run table or annotations (W200). Severity words differ from both leaders (blocker, major, minor, nit). Review pull requests missing on mobile (S67.21).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S67.20, S67.21, S99.24, S99.25
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-coding-workflows-20

**Move a session between cloud, terminal, editor and phone: Web move is partial (WP148; S66.41 web missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.41, S99.28, S99.30
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-coding-workflows-23

**Parallel sessions and worktrees: No worktree picker on web, desktop, mobile or VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.03, S99.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-16

**Rewind conversation and code to an earlier point: No rewind on the web or desktop Code views. CLI lacks a summarize-from-here option and retention settings.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.22, S66.23, S92.25, S99.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F099-01-01

**No direct Web, Chrome or Mobile client of the host.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-01](../../20-features/099-coding-and-local-runtime-components/F099-01-a.md)
- Detail: Affects: surface:web, surface:chrome, surface:mobile. Work needed: Decide whether those apps should attach; document it.
- Evidence: No caller found in the files opened; mobile reaches desktop through the relay (apps/mobile/stores/connectionStore.ts)

## GAP-F099-01-02

**Cloud threads cannot take turns in the shared service.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-01](../../20-features/099-coding-and-local-runtime-components/F099-01-a.md)
- Detail: Affects: CLI, VS Code, Desktop. Work needed: Either allow turns or keep the explicit handoff and document it.
- Evidence: apps/cli/src/app_server/cloud_threads.rs:22-26

## GAP-F099-01-03

**Brief code references drifted (developer_session.rs:509 is the request envelope, not session state).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-01](../../20-features/099-coding-and-local-runtime-components/F099-01-a.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief references.
- Evidence: crates/agiworkforce-protocol/src/developer_session.rs:495-545

## GAP-F099-01-04

**Subscription entitlement and metering for local coding sessions not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-01](../../20-features/099-coding-and-local-runtime-components/F099-01-a.md)
- Detail: Affects: All apps. Work needed: Confirm whether managed-cloud metering sits only in the cloud client.
- Evidence: No entitlement code in host files opened

## GAP-F099-99-01

**No symbol index**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: CLI, Desktop, VS Code agents. Work needed: Design and build a shared index service.
- Evidence: No index code found; only lsp_document_symbols

## GAP-F099-99-02

**No unsaved-buffer synchronisation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: VS Code users. Work needed: Add a buffer-sync method and VS Code publisher.
- Evidence: No protocol method for buffers in the method list (developer_session.rs:57-135)

## GAP-F099-99-03

**Dev-server and preview support exist only on Desktop and only as run tracking plus a preview window; no port broker to a shareable URL**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: CLI, VS Code, Web, Mobile. Work needed: Decide a shared design.
- Evidence: shellService.ts:847; previewWindow.ts

## GAP-F099-99-04

**Simulator is iOS-only and Desktop-only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: All other apps; Android. Work needed: Android adapter and cross-app exposure.
- Evidence: simulatorService.ts uses xcrun

## GAP-F099-99-05

**Brief status for S99.20, S99.21, S99.23 and several code references are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: Documentation and planning. Work needed: Refresh the brief.
- Evidence: commandSetup.ts:779, dispatcher.ts:851 and :1308, daemon lib.rs:4228 do not match

## GAP-F099-99-06

**Host capability manifest is derived from the CLI handshake only; no per-host published manifest for Web/Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: Desktop, mobile. Work needed: Confirm the accurate-manifest requirement for each host.
- Evidence: developerSessionService.ts:520-527

## GAP-F099-99-07

**Subscription and Local-mode rules for review, handoff and relay not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: Affects: All apps. Work needed: Trace metering for these paths.
- Evidence: Only handoff entitlement lookup found (cloud-code-session-open.ts:137)

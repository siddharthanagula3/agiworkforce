---
id: "F099-99"
type: "feature"
title: "Other items in Coding and local-runtime components"
aliases: ["Other items in Coding and local-runtime components", "S99.02 to S99.30", "local runtime components", "coding runtime parts"]
area: "99 Coding and local-runtime components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S99.02", "S99.03", "S99.04", "S99.05", "S99.06", "S99.07", "S99.08", "S99.09", "S99.10", "S99.11", "S99.12", "S99.13", "S99.14", "S99.15", "S99.16", "S99.17", "S99.18", "S99.19", "S99.20", "S99.21", "S99.22", "S99.23", "S99.24", "S99.25", "S99.26", "S99.27", "S99.28", "S99.29", "S99.30"]
depends_on: ["F099-01", "surface:cli", "surface:desktop", "surface:vscode", "surface:web", "surface:mobile", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "table:github_installations", "table:github_pr_review_attempts", "api:POST /api/code/sessions/handoff", "api:POST /api/github/webhook", "file:apps/cli/src/daemon.rs", "file:services/signaling-server/src/index.ts", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-sync-and-continuity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F099-99 Other items in Coding and local-runtime components

The remaining 29 parts of the coding runtime: protocol, daemon, discovery, repository registry, search, patch, diff, checkpoints, git, worktrees, terminals, processes, environment, browser, GitHub review and CI, handoff, relay and capability manifest. Most exist. A symbol index and unsaved-buffer sync are not found; dev-server and simulator support exist only on Desktop.

Area: [99. Coding and local-runtime components](README.md). Requirement items: [S99.02](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9902), [S99.03](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9903), [S99.04](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9904), [S99.05](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9905), [S99.06](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9906), [S99.07](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9907), [S99.08](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9908), [S99.09](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9909), [S99.10](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9910), [S99.11](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9911), [S99.12](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9912), [S99.13](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9913), [S99.14](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9914), [S99.15](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9915), [S99.16](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9916), [S99.17](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9917), [S99.18](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9918), [S99.19](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9919), [S99.20](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9920), [S99.21](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9921), [S99.22](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9922), [S99.23](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9923), [S99.24](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9924), [S99.25](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9925), [S99.26](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9926), [S99.27](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9927), [S99.28](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9928), [S99.29](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9929), [S99.30](../../10-requirements/capabilities/099-coding-and-local-runtime-components.md#s9930).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Covers the building blocks under a coding session: the wire protocol, a background daemon, finding the CLI, approved folders, workspace layout, file search, language services, instruction loading, patching, diffs, checkpoints, git and worktrees, terminals, process cleanup, shell environment capture, browser checks, GitHub App integration, automated review, test and CI reading, phone relay, host capability list and local-to-cloud handoff.

**Why it exists.** The brief lists them as pieces a coding agent needs so that work is safe (approval, checkpoints, cancel kills the tree), repeatable and reachable from several apps. (knowledge-base/data/area-briefs/099-coding-and-local-runtime-components.md)

**Who uses it.** Developers using the CLI, Desktop and VS Code; GitHub repository owners using the review app; phone users controlling a desktop through the relay; engineers and testers.

**Problems it solves**

- Agent changes can be undone (checkpoints, worktrees, Trash-safe patches).
- A cancelled command does not leave runaway child processes.
- Secrets in the shell environment are redacted in the captured snapshot.
- Pull requests get automated review within a rolling cap.

**Use cases**

- Ask the agent to fix a bug in an isolated worktree, review the structured diff, apply it.
- Run a dev server in the background and open the local preview on Desktop.
- Install the GitHub App so a pull request gets an AGI Code Review comment.
- Hand a local coding session to the cloud when the laptop must close.

## 2. User experience

**Where to find it**

- CLI: agi daemon or agi --daemon, agi triggers, agi review, worktree commands, agi code teleport. (apps/cli/src/lib.rs:6584-6624, :7955; apps/cli/src/review.rs:1-30)
- Desktop: coding view with approved folders, shell runs, worktree and checkpoint commands, simulator and local preview window. Visible labels unknown. (apps/desktop/electron/runtime/dispatcher.ts:769-860, :1114-1128, :2436-2450)
- VS Code: diagnostics, diff decorations, proposed-change review, terminal provider. (apps/extension-vscode/src/providers/diagnosticsProvider.ts, src/features/permissions/proposedChangeReview.ts)
- Web: Code diff and changes panel; handoff API; GitHub webhook. (apps/web/features/code/code-diff.ts, apps/web/features/code/components/CodeChangesPanel.tsx)
- Mobile: Settings, Remote control screen for the relay. (apps/mobile/app/(app)/settings/remote-control.tsx)
- Chrome: computer-use agent loop. (apps/extension/src/features/computer-use/agentLoop.ts)

**Before you start**

- Approved folder (Desktop store of approved roots; CLI project registry).
- git installed for patch, worktree and git tools [inferred from git use].
- GitHub App installed and verified for review and CI reading; review needs pr_review_enabled. (apps/web/app/api/github/webhook/route.ts:331-345)
- Pairing code for the relay. (services/signaling-server/src/index.ts:703)

**Screens and controls**

- Approval prompts for shell, git and worktree actions with written reasons on Desktop. (apps/desktop/electron/runtime/dispatcher.ts:769-860)
- Worktree apply asks git.write permission and leaves files changed since alone. (apps/desktop/electron/runtime/dispatcher.ts:800-815)
- Controls for simulator and preview: unknown labels.

**Journey**

1. 1. Person approves a folder; the CLI project registry or Desktop store records it.
2. 2. The agent session loads repository instructions (AGENTS.md, CLAUDE.md, instructions.md) and a system context.
3. 3. The agent searches (glob, grep_files, list_directory), reads and edits files; patches go through the patch engine; each turn can capture a checkpoint.
4. 4. Commands run under approval through the shell or a pseudo-terminal; cancel kills the process group.
5. 5. The person reviews the structured diff, then applies, reverts or hands off.
6. 6. Optionally a pull request is opened and a GitHub review or CI status is read.

**What the person sees and gets**

- Structured diffs: files, hunks, counts, rename and binary flags. (apps/cli/src/diff_model.rs:510-760)
- Validation summary of checks with pass/fail counts. (apps/web/lib/services/cloud-code-result.ts:143-160)
- Handoff refusal message in plain words, status 422. (apps/web/app/api/code/sessions/handoff/route.ts:77-92)
- Review comment titled AGI Code Review; quota message after the cap. (apps/web/app/api/github/webhook/route.ts:411-420)

**Settings**

- Desktop Settings: confirmed CLI path. (developerSessionService.ts:368-376)
- triggers.json: max_parallel (default 4), webhook_port. (apps/cli/src/daemon.rs:1166-1167, :781)
- SIGNALING_PAIRING_MAX_LIFETIME_MS, SIGNALING_STANDING_URL for the relay. (services/signaling-server/src/index.ts:265-269, :343)
- Review cap constant MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS from configuration. (apps/web/app/api/github/webhook/route.ts:59)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- S99.02 Protocol: versioned method set and WebSocket server exist. (crates/agiworkforce-protocol/src/developer_session.rs:57-135; crates/agiworkforce-app-server/src/lib.rs:82-110)
- S99.03 Daemon: runs cron, webhook and filesystem triggers, each spawning a non-interactive AgentSession, cap max_parallel default 4, logs in daemon-logs, webhook bearer or HMAC checked in constant time. (apps/cli/src/daemon.rs:1-60, :268-340)
- S99.04 Discovery: Desktop picks confirmed, bundled or installed binary, reads --version, lists served capabilities from the handshake. (apps/desktop/electron/runtime/developerSessionService.ts:373-560)
- S99.05 Registry: Desktop stores approved roots in a file (a corrupt store grants nothing); the CLI keeps projects.json with trust levels under a lock. (apps/desktop/electron/runtime/workspaceStore.ts:85-105; apps/cli/src/project_registry.rs:85-130)
- S99.06 Workspace layout: reads pnpm-workspace.yaml, package.json workspaces and Cargo.toml members. (apps/cli/src/repo/workspace.rs:183-200)
- S99.07 File search: tools glob, grep_files, search_files and list_directory (skips checkpoint-internal paths). (apps/cli/src/platform/runtime/tool_catalog.rs:122-123, :248-249; apps/cli/src/features/exec/tools/dir_ops/mod.rs:242-254)
- S99.09 Language service: lsp_definition, hover, diagnostics, completion, document_symbols, format tools through an LSP client with a 32 MB frame cap. (apps/cli/src/features/exec/tools/mod.rs:1240-1251; apps/cli/src/platform/lsp/client.rs:100-112)
- S99.11 Instructions: AGENTS.md, CLAUDE.md and instructions.md are recognised, and instructions loaded into the system prompt. (apps/cli/src/app_server/surfaces.rs:58-66; apps/cli/src/agent/prompt.rs:396-410)
- S99.12 Patch: apply_patch validates names (refuses absolute or climbing paths). (apps/cli/src/apply_patch.rs:135-150)
- S99.13 Diff: unified diff parsed to files and hunks in Rust and in web TypeScript. (apps/cli/src/diff_model.rs:510-760; apps/web/features/code/code-diff.ts:39)
- S99.14 Checkpoints: content blobs with digests, index file beside the session, restore with change checks, garbage collection. (apps/cli/src/agent/checkpoints.rs:146-519)
- S99.15 Git: 22 named tools including status, diff, stage, commit, push; some always ask. Desktop has gitService. (apps/cli/src/platform/runtime/git_tools.rs:42-330; apps/desktop/electron/runtime/gitService.ts)
- S99.16 Worktrees: enter, exit, list, session worktree open, has-work check, remove. (apps/cli/src/platform/runtime/worktree.rs:75-383)
- S99.17 Terminal: real pseudo-terminal through openpty on Unix, 1 MB kept output, 40x120 default. (apps/cli/src/terminals.rs:13-23, :522)
- S99.18 Process manager: each command gets its own process group; drop cancels and kills the tree. (apps/cli/src/process_tree.rs:1-12)
- S99.19 Environment: shell snapshot with secret redaction, 10 s capture timeout. (apps/cli/src/shell_snapshot.rs:8-10, :275-313)
- S99.22 Browser: browser_* tools through computer-use; Chrome extension has an agent loop. (apps/cli/src/features/exec/tools/mod.rs:1459-1511)
- S99.24 GitHub App: install lookup, installation tokens, repo list, PR create, status, review post. (apps/web/lib/github-app.ts:105-1700)
- S99.25 Review: webhook reviews pull requests with debounce and rolling quota; CLI agi review. (apps/web/app/api/github/webhook/route.ts:331-420; apps/cli/src/review.rs:1-30)
- S99.26 Test parsing: validation summary from check results. (apps/web/lib/services/cloud-code-result.ts:143-160)
- S99.27 CI: failed checks and PR status readers. (apps/web/lib/github-app.ts:1287, :1342)
- S99.28 Relay: signaling server with pairing, rate limits and readiness probes. (services/signaling-server/src/index.ts:390-440, :703)
- S99.30 Handoff: admission checks and /api/code/sessions/handoff. (packages/contracts/cloud-contracts/src/cloud-code-handoff.ts:160-217; apps/web/app/api/code/sessions/handoff/route.ts:60-92)

**Incomplete**

- S99.29 Manifest: Desktop lists served capabilities from what the CLI said at initialize; empty until a handshake answers. Brief lines dispatcher.ts:851 and :1308 do not hold a manifest; they are permission reasons and a confirm dialog. (apps/desktop/electron/runtime/developerSessionService.ts:520-527)
- S99.20 Dev servers: no dedicated manager. Background commands (run_in_background) are tracked, and Desktop records a preview URL found in output. (apps/cli/src/platform/runtime/tool_catalog.rs:536; apps/desktop/electron/runtime/shellService.ts:847-848)
- S99.21 Preview broker: Desktop opens only local pages in a preview window with a separate session partition; no exposure of a port as a shareable URL found. (apps/desktop/electron/previewWindow.ts:1-40)
- S99.23 Simulator: Desktop only, iOS through xcrun (boot, shutdown, screenshot, record, clipboard, status bar). Android not found. (apps/desktop/electron/runtime/simulatorService.ts:1-50)
- S99.04 VS Code discovery: brief line commandSetup.ts:779 is artifact code, not discovery; VS Code discovery not located: unknown.

**Present but disconnected or switched off**

- The brief marks S99.20, S99.21 and S99.23 platform missing but Desktop contains code for preview, preview URL detection and a simulator service with dispatcher entries; the brief status is out of date or means no shared cross-app service. [inferred]

**Not available**

- S99.08 Symbol index: no index found in cli, vscode or desktop; only lsp_document_symbols per file. (grep of apps/cli/src, apps/extension-vscode/src, apps/desktop/electron found only mentionSearch)
- S99.10 Unsaved-buffer sync: no buffer-to-runtime sync found in VS Code or CLI.
- Simulators on CLI, VS Code, Web, Mobile, Chrome: not found.

## 4. Required behaviour

**Established requirements**

- S99.02: A documented protocol lets clients start, stream, steer, approve and resume sessions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.02)
- S99.03: A local background process hosts sessions and triggers independent of any UI window. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.03)
- S99.08: A symbol index lets the agent and UI look up definitions quickly (brief status: missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.08)
- S99.10: Unsaved editor buffers are synchronised to the runtime (brief status: missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.10)
- S99.14: Checkpoints snapshot code and conversation so either can be restored. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.14)
- S99.18: Cancel kills whole process trees. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.18)
- S99.19: Shell environment captured with secrets redacted. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.19)
- S99.20, S99.21, S99.23: dev-server manager, preview-port broker and simulator adapter (brief status: missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.20, S99.21, S99.23)
- S99.29: Each host publishes an accurate manifest of what it can do. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.29)
- S99.30: Local-to-cloud handoff with admission checks. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S99.30)
- An agent never destroys user data: removed files go to Trash first, code gets a checkpoint; user-irreversible actions ask first with a named consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Cancelling a running agent command leaves no child process of that command running.
2. The captured shell snapshot contains no value for a secret-named variable.
3. Restoring a checkpoint returns tracked files to their saved content and skips files changed by the user since.
4. A patch naming an absolute or parent-climbing path is refused.
5. A handoff older than 15 minutes, for the wrong account or the wrong destination is refused with code HANDOFF_REFUSED and status 422.
6. After the review cap in a 30-day window an automatic review is skipped and a mention gets the quota message.
7. The relay refuses pairing registration when the standing URL is not configured in production.
8. Desktop shows no runtime capability until a handshake has answered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's missing items may be satisfied by Desktop-only code; the required behaviour is a cross-app service. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a workspace symbol index service in the CLI exposed over the protocol.
- [proposed] Add a protocol method that sends unsaved VS Code buffers to the host.
- [proposed] Promote Desktop dev-server tracking and preview URL into the shared host.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | daemon | `apps/cli/src/daemon.rs` | Cron, webhook and file-watch triggers running agent sessions |
| service | project_registry | `apps/cli/src/project_registry.rs` | projects.json registry with trust levels and a mutation lock |
| store | workspaceStore | `apps/desktop/electron/runtime/workspaceStore.ts` | Desktop approved roots and worktrees file |
| service | workspace graph | `apps/cli/src/repo/workspace.rs` | Monorepo member discovery |
| service | tool_catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Tool names, aliases, timeouts, run_in_background text |
| service | LspClient | `apps/cli/src/platform/lsp/client.rs` | Language server client |
| service | apply_patch | `apps/cli/src/apply_patch.rs` | Patch application and name validation |
| service | diff_model | `apps/cli/src/diff_model.rs` | Structured diff model |
| service | code-diff | `apps/web/features/code/code-diff.ts` | Web unified diff parser |
| service | checkpoints | `apps/cli/src/agent/checkpoints.rs` | Checkpoint store with blobs and index |
| service | git_tools | `apps/cli/src/platform/runtime/git_tools.rs` | Git tool specs and execution |
| service | gitService | `apps/desktop/electron/runtime/gitService.ts` | Desktop git operations |
| service | worktree | `apps/cli/src/platform/runtime/worktree.rs` | Worktree creation, listing and removal |
| service | terminals | `apps/cli/src/terminals.rs` | Pseudo-terminal and background command registry |
| service | process_tree | `apps/cli/src/process_tree.rs` | Process group supervision and tree kill |
| service | shell_snapshot | `apps/cli/src/shell_snapshot.rs` | Shell environment capture with redaction |
| service | shellService | `apps/desktop/electron/runtime/shellService.ts` | Desktop shell runs, background commands, preview URL detection |
| service | simulatorService | `apps/desktop/electron/runtime/simulatorService.ts` | iOS simulator control through xcrun |
| service | previewWindow | `apps/desktop/electron/previewWindow.ts` | Local preview window and console error buffer |
| service | github-app | `apps/web/lib/github-app.ts` | GitHub App tokens, repos, PRs, checks, reviews |
| endpoint | api:POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | Review trigger with quota and debounce; table github_pr_review_attempts, github_installations |
| endpoint | api:POST /api/code/sessions/handoff | `apps/web/app/api/code/sessions/handoff/route.ts` | Admits a handoff and opens a cloud Code session |
| schema | cloud-code-handoff | `packages/contracts/cloud-contracts/src/cloud-code-handoff.ts` | Handoff schema and admission rules |
| service | signaling-server | `services/signaling-server/src/index.ts` | Relay with pairings, rate limits and probes |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person approves a folder; path stored in a local registry file. | device | apps/desktop/electron/runtime/workspaceStore.ts:93-105; apps/cli/src/project_registry.rs:96-130 |
| Agent tool call is checked against workspace policy, may ask approval, then runs on the device (search, patch, LSP, git, shell). | device | apps/cli/src/features/exec/tools/mod.rs:640-660, :1240-1251 |
| Each turn can capture a checkpoint; restore checks files still match. | device | apps/cli/src/agent/checkpoints.rs:274-420 |
| Handoff sends a record (max 512 KB) to our servers, which check age, destination, trust mode and account, then open a cloud Code session. | our servers | apps/web/app/api/code/sessions/handoff/route.ts:60-92; packages/contracts/cloud-contracts/src/cloud-code-handoff.ts:14-16, :160-200 |
| Pull request events from GitHub reach the webhook; our server checks quota, calls a model to review, then posts a comment through the GitHub App. | our servers | apps/web/app/api/github/webhook/route.ts:331-420 |
| Phone connects to a desktop host through the relay after pairing. | our servers | services/signaling-server/src/index.ts:703 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Checkpoint blobs and index | Beside the session path on the device | No | Garbage collection of unreferenced blobs. (apps/cli/src/agent/checkpoints.rs:489) |
| Daemon logs | ~/.agiworkforce/daemon-logs/ on the device | No | Retention rule not opened: unknown; secrets are redacted before logging. (apps/cli/src/daemon.rs:1515) |
| Shell snapshot | Private file on the device | No | Per session; rule not opened. |
| Review attempts and installations | Tables github_pr_review_attempts, github_installations | Server side | Not opened: unknown |
| Pairings | Relay database (signaling-server db) | Server | Expired pairings pruned. (services/signaling-server/src/expired-pairings.ts) |

**Models and providers.** Review model comes from the installation's review_model column; which providers are used for review was not opened: unknown. (apps/web/app/api/github/webhook/route.ts:334-338) Local coding turns use the session's privacy mode. No concrete model names recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Daemon, patch, diff, checkpoints, git, worktree, terminals, LSP need no account found. GitHub review, CI and handoff need an account and a verified GitHub installation. (apps/web/app/api/code/sessions/handoff/route.ts:60; apps/web/app/api/github/webhook/route.ts:331-345) |
| Permissions | Desktop capability gates: shell.execute, git.write, simulator.control, filesystem.read. Daemon webhook needs bearer or HMAC. Handoff needs CSRF token and rate limit. (apps/desktop/electron/runtime/dispatcher.ts:769-1128; apps/cli/src/daemon.rs:46-60; apps/web/app/api/code/sessions/handoff/route.ts:61-66) |
| Subscription | Handoff opens a cloud session that resolves an entitlement bundle and plan tier. (apps/web/lib/services/cloud-code-session-open.ts:137-154) Other items: none found in the code. |
| Limits and metering | Daemon max_parallel 4; review cap per installation per 30 days; handoff body 512 KB, age 15 minutes; relay pairing lifetime cap and rate limiters; LSP frame 32 MB; terminal output 1 MB kept. |
| Feature flags | none found in the code |
| Model compatibility | Not opened: unknown. |
| Provider restrictions | GitHub items only work for GitHub-hosted repositories (handoff accepts github.com remotes only). (apps/web/app/api/code/sessions/handoff/route.ts:28-40) |
| Local mode | Local-device items (search, patch, diff, checkpoints, git, worktree, terminal, process, environment, LSP, daemon) run on the device. Handoff, GitHub review, CI and relay need our servers; whether they work in Local privacy mode was not established: unknown. Handoff refuses an unknown trust mode. (packages/contracts/cloud-contracts/src/cloud-code-handoff.ts:181) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Daemon port taken | Start fails with a message naming webhook_port in triggers.json. | apps/cli/src/daemon.rs:777-783 |
| Daemon invalid max_parallel 0 | Reset to 4. | apps/cli/src/daemon.rs:1166-1167 |
| Corrupt approved-folder store | Grants nothing. | apps/desktop/electron/runtime/workspaceStore.ts:85-87 |
| Registry save race | File lock and own temp file per write. | apps/cli/src/project_registry.rs:85-125 |
| Command cancelled | Dropping the future kills the process tree and reaps the child. | apps/cli/src/process_tree.rs:1-12 |
| Review attempt in flight or cap reached | Skipped and recorded; quota answer only to a mention; quota check failure proceeds best-effort. | apps/web/app/api/github/webhook/route.ts:371-420 |
| Handoff too large or invalid | 413 payload-too-large or validation error. | apps/web/app/api/code/sessions/handoff/route.ts:67-86 |
| Simulator unavailable | Typed unavailable reasons with messages. | apps/desktop/electron/runtime/simulatorService.ts:7-10 |
| Relay readiness outage / reconnect | Tested in the relay folder; details not opened. | services/signaling-server/__tests__/relay/readiness-outage.test.ts |
| Offline, accessibility | not handled in the code I opened. | No offline or accessibility code opened for these items. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/workspaceStore.test.ts`: Approved folder store
- `apps/desktop/electron/__tests__/workspaceWorktrees.test.ts`: Worktree roots on Desktop
- `apps/desktop/electron/__tests__/gitService.test.ts`: Desktop git service
- `apps/desktop/electron/__tests__/gitServicePushRace.test.ts`: Push race
- `apps/desktop/electron/__tests__/shellService.test.ts`: Shell runs
- `apps/desktop/electron/__tests__/simulatorService.test.ts`: Simulator service
- `apps/desktop/electron/__tests__/previewWindow.test.ts`: Local preview window
- `apps/desktop/electron/__tests__/previewConsole.test.ts`: Preview console buffer
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Command dispatch and permissions
- `apps/cli/src/diff_model.rs`: In-file tests for diff parsing (lines 756-980)
- `apps/cli/src/daemon.rs`: In-file tests for webhook bind and config (lines 2092-2341)
- `apps/web/features/code/code-diff.test.ts`: Web diff parser
- `apps/web/lib/services/__tests__/cloud-code-result.test.ts`: Validation summary
- `apps/web/lib/services/__tests__/cloud-code-durable-handoff.test.ts`: Durable handoff
- `services/signaling-server/__tests__/relay/readiness-outage.test.ts`: Relay readiness
- `services/signaling-server/__tests__/relay/parser-log-privacy.test.ts`: Relay log privacy
- `services/signaling-server/__tests__/http/pairings.test.ts`: Pairing HTTP
- `apps/mobile/__tests__/RemoteCompanion.test.tsx`: Mobile remote companion
- `apps/extension-vscode/src/__tests__/reviewFindingsLifecycle.test.ts`: VS Code review findings

**Test scenarios**

- **Cancel kills the tree**
  1. Ask the agent to run a shell script that starts a background child
  2. Interrupt the turn
  3. List processes
  - Expected: Neither the script nor its child is running.
- **Secret redaction in snapshot**
  1. Export a secret-named variable in the shell
  2. Start a session
  3. Read the captured snapshot file
  - Expected: The value shows REDACTED.
- **Checkpoint restore**
  1. Let the agent edit two files
  2. Edit one of them yourself
  3. Rewind to before the turn
  - Expected: The untouched file is restored; the file you edited is left alone and reported.
- **Handoff refusals**
  1. Post a handoff older than 15 minutes
  2. Post one with trust mode unknown
  3. Post one for another account
  - Expected: Each is refused with HANDOFF_REFUSED and status 422 and a plain message.
- **Preview URL on Desktop**
  1. Run a dev server as a background command
  2. List shell runs
  3. Open the preview
  - Expected: The run lists a preview URL and the preview window loads only the local page; external links open in the user's browser.
- **Review quota**
  1. Open pull requests until the installation passes the cap
  2. Mention the reviewer on a new PR
  - Expected: The review is skipped and a quota comment is posted.

**Where to look when it fails**

- Webhook log lines: Monthly review quota reached; Review spend-cap check failed
- Table github_pr_review_attempts status values such as skipped_quota
- daemon-logs folder under ~/.agiworkforce
- Relay /health and readiness probes (services/signaling-server/src/probes.ts)
- Error code HANDOFF_REFUSED

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No symbol index** Affects: CLI, Desktop, VS Code agents. Evidence: No index code found; only lsp_document_symbols. Work needed: Design and build a shared index service.
- **No unsaved-buffer synchronisation** Affects: VS Code users. Evidence: No protocol method for buffers in the method list (developer_session.rs:57-135). Work needed: Add a buffer-sync method and VS Code publisher.
- **Dev-server and preview support exist only on Desktop and only as run tracking plus a preview window; no port broker to a shareable URL** Affects: CLI, VS Code, Web, Mobile. Evidence: shellService.ts:847; previewWindow.ts. Work needed: Decide a shared design.
- **Simulator is iOS-only and Desktop-only** Affects: All other apps; Android. Evidence: simulatorService.ts uses xcrun. Work needed: Android adapter and cross-app exposure.
- **Brief status for S99.20, S99.21, S99.23 and several code references are stale** Affects: Documentation and planning. Evidence: commandSetup.ts:779, dispatcher.ts:851 and :1308, daemon lib.rs:4228 do not match. Work needed: Refresh the brief.
- **Host capability manifest is derived from the CLI handshake only; no per-host published manifest for Web/Mobile** Affects: Desktop, mobile. Evidence: developerSessionService.ts:520-527. Work needed: Confirm the accurate-manifest requirement for each host.
- **Subscription and Local-mode rules for review, handoff and relay not established** Affects: All apps. Evidence: Only handoff entitlement lookup found (cloud-code-session-open.ts:137). Work needed: Trace metering for these paths.

**Depends on**

- F099-01
- surface:cli
- surface:desktop
- surface:vscode
- surface:web
- surface:mobile
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- table:github_installations
- table:github_pr_review_attempts
- api:POST /api/code/sessions/handoff
- api:POST /api/github/webhook
- file:apps/cli/src/daemon.rs
- file:services/signaling-server/src/index.ts
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-sync-and-continuity
- SYS-security-and-privacy

## Unknown

- VS Code runtime discovery location
- Visible labels for coding controls on all apps
- Daemon log retention
- Which providers and models review uses
- Whether handoff, review and relay work in Local privacy mode
- Whether S99.20, S99.21, S99.23 are meant as cross-app services
- Exact CI log reading path in CodeChangesPanel
- How mobile consumes the relay for coding sessions beyond the settings screen

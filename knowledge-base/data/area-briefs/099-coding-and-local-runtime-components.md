# Area 99. Coding and local-runtime components

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S99.01 Shared coding-session service.
- Should: One coding-session service owns session state for every client.
- Status: platform done
- Code: apps/cli/src/app_server/developer_host.rs:1629; apps/cli/src/app_server/cloud_threads.rs:74; apps/cli/src/app_server/cloud_threads.rs:97; crates/agiworkforce-protocol/src/developer_session.rs:509

## S99.02 App-server/session protocol.
- Should: A documented protocol lets clients start, stream, steer, approve and resume sessions against the session host.
- Status: platform done
- Code: crates/agiworkforce-protocol/src/developer_session.rs:55; crates/agiworkforce-app-server/src/lib.rs:199

## S99.03 Local daemon.
- Should: A local background process hosts sessions and triggers independent of any UI window.
- Status: platform done
- Code: apps/cli/src/daemon.rs:1; apps/cli/src/lib.rs:4228

## S99.04 Runtime discovery.
- Should: Clients find the local runtime (binary, version, reachability) and explain when it is missing.
- Status: platform done
- Code: apps/desktop/electron/runtime/developerSessionService.ts:190; apps/extension-vscode/src/core/commandSetup.ts:779

## S99.05 Repository registry.
- Should: A registry of approved repositories/folders the runtime may work in.
- Status: platform done
- Code: apps/desktop/electron/runtime/workspaceStore.ts:93; apps/cli/src/project_registry.rs:96

## S99.06 Workspace discovery.
- Should: The runtime discovers the workspace layout (monorepo members, VCS root).
- Status: platform done
- Code: apps/cli/src/repo/workspace.rs:186; apps/cli/src/context.rs:1772

## S99.07 File search engine.
- Should: A file search engine (name glob and content grep) over the workspace.
- Status: platform done
- Code: apps/cli/src/features/exec/tools/dir_ops/mod.rs:242; apps/cli/src/features/exec/tools/mod.rs:306

## S99.08 Symbol index.
- Should: A symbol index lets the agent and UI look up definitions across the repository quickly.
- Status: platform missing

## S99.09 Language-service adapters.
- Should: Language-service adapters (LSP) give definitions, hover, diagnostics and formatting.
- Status: platform done
- Code: apps/cli/src/platform/lsp/client.rs:108; apps/cli/src/features/exec/tools/mod.rs:640

## S99.10 Unsaved-buffer synchronization.
- Should: Unsaved editor buffers are synchronised to the runtime so the agent sees what the user sees.
- Status: platform missing

## S99.11 Repository instruction loader.
- Should: A loader reads repository instruction files for every turn.
- Status: platform done
- Code: apps/cli/src/agent/prompt.rs:396; apps/cli/src/app_server/surfaces.rs:58

## S99.12 Patch engine.
- Should: A patch engine applies agent patches safely.
- Status: platform done
- Code: apps/cli/src/apply_patch.rs:140; apps/cli/src/features/exec/tools/mod.rs:569

## S99.13 Diff engine.
- Should: A diff engine produces structured diffs for review surfaces.
- Status: platform done
- Code: apps/cli/src/diff_model.rs:184; apps/web/features/code/code-diff.ts:39

## S99.14 Checkpoint manager.
- Should: A checkpoint manager snapshots code and conversation so either can be restored.
- Status: platform done
- Code: apps/cli/src/agent/checkpoints.rs:146; apps/cli/src/agent/checkpoints.rs:362; apps/cli/src/agent/checkpoints.rs:310; apps/cli/src/agent/mod.rs:1590; apps/cli/src/app_server/developer_host.rs:384; apps/cli/src/app_server/developer_host.rs:1836; apps/cli/src/app_server/developer_host.rs:1876

## S99.15 Git adapter.
- Should: A git adapter exposes status, diff, branch, stage, commit-adjacent and push operations under approval.
- Status: platform done
- Code: apps/cli/src/platform/runtime/git_tools.rs:68; apps/desktop/electron/runtime/gitService.ts:113

## S99.16 Worktree manager.
- Should: A worktree manager creates, lists and removes worktrees for isolated sessions.
- Status: platform done
- Code: apps/cli/src/platform/runtime/worktree.rs:400; apps/cli/src/platform/runtime/worktree.rs:513; apps/cli/src/platform/runtime/worktree.rs:498; apps/cli/src/lib.rs:431; apps/cli/src/lib.rs:3842; apps/cli/src/lib.rs:3876; apps/cli/src/app_server/developer_host.rs:408; apps/cli/src/app_server/developer_host.rs:3281

## S99.17 Terminal/PTY manager.
- Should: A terminal/PTY manager runs interactive shells with a real pseudo-terminal.
- Status: platform done
- Code: apps/cli/src/terminals.rs:244; apps/cli/src/terminals.rs:279; apps/cli/src/terminals.rs:173; apps/cli/src/terminals.rs:344; apps/cli/src/terminals.rs:367; apps/cli/src/features/exec/tools/bash/mod.rs:228; apps/cli/src/features/exec/tools/bash/mod.rs:289; apps/cli/src/platform/runtime/tool_catalog.rs:508

## S99.18 Process manager.
- Should: A process manager supervises spawned commands and kills whole trees on cancel.
- Status: platform done
- Code: apps/cli/src/process_tree.rs:1; apps/desktop/electron/runtime/dispatcher.ts:764

## S99.19 Environment manager.
- Should: An environment manager captures and applies the shell environment (with secrets redacted).
- Status: platform done
- Code: apps/cli/src/shell_snapshot.rs:151; apps/cli/src/shell_snapshot.rs:178; apps/cli/src/shell_snapshot.rs:251; apps/cli/src/shell_snapshot.rs:111; apps/cli/src/shell_snapshot.rs:128; apps/cli/src/features/exec/tools/bash/mod.rs:71; apps/cli/src/sandbox.rs:494; apps/cli/src/agent/mod.rs:576

## S99.20 Development-server manager.
- Should: A dev-server manager starts, tracks and stops long-running dev servers.
- Status: platform missing

## S99.21 Preview-port broker.
- Should: A preview-port broker exposes a session's dev-server port as a preview URL.
- Status: platform missing

## S99.22 Browser verification adapter.
- Should: A browser verification adapter lets the agent drive and read a browser.
- Status: platform done
- Code: apps/cli/src/features/exec/tools/mod.rs:686; apps/extension/src/features/computer-use/agentLoop.ts:382

## S99.23 Simulator adapter.
- Should: A simulator adapter drives iOS/Android simulators.
- Status: platform missing

## S99.24 SCM provider integration.
- Should: Integration with the code host (GitHub App: installations, repos, PRs, reviews).
- Status: platform done
- Code: apps/web/lib/github-app.ts:446; apps/web/lib/github-app.ts:797

## S99.25 Code-review pipeline.
- Should: A code-review pipeline runs automated reviews and posts findings.
- Status: platform done
- Code: apps/web/app/api/github/webhook/route.ts:411; apps/cli/src/review.rs:40

## S99.26 Test-result parser.
- Should: Test output is parsed into pass/fail counts and a validation verdict.
- Status: platform done
- Code: packages/contracts/types/src/remote-code.ts:285; apps/web/lib/services/cloud-code-result.ts:143

## S99.27 CI integration.
- Should: CI integration: read check/workflow status and logs for a branch or PR.
- Status: platform done
- Code: apps/web/lib/services/cloud-code-session-service.ts:2513; apps/web/lib/github-app.ts:1241; apps/web/lib/services/cloud-code-github-task.ts:259; apps/web/features/code/components/CodeChangesPanel.tsx:224

## S99.28 Remote-host relay.
- Should: A relay connects a remote client (phone) to a local host through pairing.
- Status: platform done
- Code: services/signaling-server/src/index.ts:1119; services/signaling-server/src/probes.ts:72; services/signaling-server/__tests__/relay/readiness-outage.test.ts:34; services/signaling-server/__tests__/relay/parser-log-privacy.test.ts:27; services/signaling-server/Dockerfile:1; services/signaling-server/__tests__/deploy/build-context.test.ts:18; services/signaling-server/src/db-query.ts:10; services/signaling-server/__tests__/fixtures/db-timeout-check.ts:136

## S99.29 Host capability manifest.
- Should: Each host publishes an accurate manifest of what it can do.
- Status: platform done
- Code: apps/desktop/electron/runtime/dispatcher.ts:851; apps/desktop/electron/runtime/dispatcher.ts:1308

## S99.30 Local-to-cloud handoff coordinator.
- Should: A coordinator hands local work to the cloud (and back) with admission checks.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/cloud-code-handoff.ts:12; apps/web/app/api/code/sessions/handoff/route.ts:64

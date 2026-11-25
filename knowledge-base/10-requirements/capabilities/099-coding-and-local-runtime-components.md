---
id: "REQ-AREA-099"
type: "requirements"
title: "Requirement items: Coding and local-runtime components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 99. Coding and local-runtime components

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S99.01

**Shared coding-session service.** One coding-session service owns session state for every client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-01 a](../../20-features/099-coding-and-local-runtime-components/F099-01-a.md)

## S99.02

**App-server/session protocol.** A documented protocol lets clients start, stream, steer, approve and resume sessions against the session host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.03

**Local daemon.** A local background process hosts sessions and triggers independent of any UI window.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.04

**Runtime discovery.** Clients find the local runtime (binary, version, reachability) and explain when it is missing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.05

**Repository registry.** A registry of approved repositories/folders the runtime may work in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.06

**Workspace discovery.** The runtime discovers the workspace layout (monorepo members, VCS root).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.07

**File search engine.** A file search engine (name glob and content grep) over the workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.08

**Symbol index.** A symbol index lets the agent and UI look up definitions across the repository quickly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.09

**Language-service adapters.** Language-service adapters (LSP) give definitions, hover, diagnostics and formatting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.10

**Unsaved-buffer synchronization.** Unsaved editor buffers are synchronised to the runtime so the agent sees what the user sees.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.11

**Repository instruction loader.** A loader reads repository instruction files for every turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.12

**Patch engine.** A patch engine applies agent patches safely.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.13

**Diff engine.** A diff engine produces structured diffs for review surfaces.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.14

**Checkpoint manager.** A checkpoint manager snapshots code and conversation so either can be restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-editing-regeneration-and-branching-16

## S99.15

**Git adapter.** A git adapter exposes status, diff, branch, stage, commit-adjacent and push operations under approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.16

**Worktree manager.** A worktree manager creates, lists and removes worktrees for isolated sessions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-23

## S99.17

**Terminal/PTY manager.** A terminal/PTY manager runs interactive shells with a real pseudo-terminal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.18

**Process manager.** A process manager supervises spawned commands and kills whole trees on cancel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.19

**Environment manager.** An environment manager captures and applies the shell environment (with secrets redacted).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.20

**Development-server manager.** A dev-server manager starts, tracks and stops long-running dev servers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.21

**Preview-port broker.** A preview-port broker exposes a session's dev-server port as a preview URL.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.22

**Browser verification adapter.** A browser verification adapter lets the agent drive and read a browser.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.23

**Simulator adapter.** A simulator adapter drives iOS/Android simulators.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.24

**SCM provider integration.** Integration with the code host (GitHub App: installations, repos, PRs, reviews).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-12

## S99.25

**Code-review pipeline.** A code-review pipeline runs automated reviews and posts findings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-12

## S99.26

**Test-result parser.** Test output is parsed into pass/fail counts and a validation verdict.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.27

**CI integration.** CI integration: read check/workflow status and logs for a branch or PR.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-11

## S99.28

**Remote-host relay.** A relay connects a remote client (phone) to a local host through pairing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-20

## S99.29

**Host capability manifest.** Each host publishes an accurate manifest of what it can do.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)

## S99.30

**Local-to-cloud handoff coordinator.** A coordinator hands local work to the cloud (and back) with admission checks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F099-99 Other items in Coding and local-runtime components](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Competitor trace: CAP-coding-workflows-06, CAP-coding-workflows-20

# Agent-Native Development Workflow

Status: Current
Owner: Platform lead
Last updated: 2026-05-21
Purpose: define how AGI Workforce should be built in a future where humans direct and review work while coding agents perform most exploration, implementation, refactoring, verification, and PR preparation.

## Operating Assumption

AGI Workforce should assume that implementation work increasingly happens through LLM coding agents. The durable human job is to define the product outcome, architecture boundaries, safety policy, review criteria, and release decision.

This repo therefore needs to be easy for agents to search, split, edit, test, and summarize without relying on private memory or one engineer's habits.

## Human Responsibilities

- Define the desired product behavior and non-goals.
- Lock privacy, billing, safety, and data-retention decisions.
- Decide ownership and review routing.
- Review high-risk diffs before merge.
- Approve releases and customer-impacting changes.

## Agent Responsibilities

- Read scoped files and produce evidence-backed findings.
- Implement bounded changes inside explicit write paths.
- Add focused tests and docs where behavior changes.
- Keep product orchestration in actions/routes/commands and repeated mechanics in service functions as defined by `docs/engineering/service-layer-architecture.md`.
- Run the smallest useful checks, then broader checks when shared contracts changed.
- Summarize changed files, verification, and remaining risk.

## Standard Task Shape

Every substantial task should be expressible as:

1. Goal.
2. Lane ID from `docs/agent-context/lanes.json`.
3. Owned write paths.
4. Read-only context paths.
5. Explicit non-goals.
6. Required checks.
7. Risk focus from `docs/agent-context/risk-map.json`.
8. Expected final summary.

Use `docs/agent-context/agent-task-templates.md` when assigning work to Codex, Claude Code, Cursor, opencode, VS Code agents, or future internal agents.

## Parallel Operating Documents

- `docs/agent-context/lanes.json` is the machine-readable lane map for 15+ parallel agents.
- `docs/agent-context/shared-files.md` defines collision rules for manifests, locks, root docs, CI, shared schemas, migrations, and native projects.
- `docs/engineering/parallel-agent-playbook.md` defines the human/integrator workflow for running many agents without overlapping writes.
- `docs/engineering/service-layer-architecture.md` defines how agents extract repeated operational mechanics without hiding product policy.
- `.github/PULL_REQUEST_TEMPLATE/parallel-agent-change.md` is the PR template for lane-scoped parallel work.
- `docs/engineering/autonomous-software-company-roadmap.md` defines the later feedback-to-patch automation loop.

## Parallel Work Rules

- Split by owner path first: app, package, crate, service, docs, audit.
- Assign exactly one `laneId` to every implementation agent.
- Do not assign two implementation agents to the same unresolved files.
- Keep immediate blockers local to the lead agent or human.
- Delegate sidecar exploration, tests, or disjoint implementation.
- Extract service-layer code only after identifying repeated mechanics or a high-risk boundary; do not turn a single flow into a god service.
- Ask every implementation agent to state the files it changed.
- Integrate subagent work through review, not blind merge.
- Route shared-file edits through `repo-operability`, `release-ci`, or a final integrator task.

## Worktree And Session Isolation

Use a separate worktree or branch for any task that can outlive the current working session.

Recommended naming:

- Branch: `work/<area>-<short-goal>-YYYY-MM-DD`
- Worktree path: `.worktrees/<area>-<short-goal>`
- Agent session label: `<area>: <goal>`

Rules:

- One worktree owns one branch.
- One branch owns one coherent change set.
- Keep generated outputs under approved report/artifact paths.
- Do not share uncommitted edits between agents by copying files.
- Before integration, run `git status --short`, inspect the diff, and rerun the owner-path checks.

## Verification Ladder

1. Smallest owner-path check from the nearest README or `docs/agent-context/commands.json`.
2. Shared contract checks if packages, schemas, crates, or provider adapters changed.
3. `pnpm check:llm-operability` when docs, repo structure, agent context, generated artifacts, or boundaries changed.
4. Full app/surface tests only when the blast radius justifies the cost.

## High-Risk Merge Gates

Human review is mandatory for changes touching:

- Auth, sessions, RLS, database migrations, billing, credits, refunds, or fraud controls.
- Secrets, BYOK, provider keys, provider routing, provider storage flags, or managed gateways.
- Local/BYOK/Managed transitions.
- File-system writes, shell execution, sandboxing, browser control, native messaging, MCP, plugins, or generated files.
- Release workflows, signing, notarization, mobile store metadata, or production deployment.

## Repo A+ Criteria

The repo is A+ for agent-native development when:

- Every app/package/crate/service has owner, purpose, public API, non-goals, and checks documented locally.
- Root files are few, classified, and enforced by CI.
- Current docs carry status/owner/update metadata.
- Stale plans are archived instead of competing with current truth.
- Generated artifacts are either ignored or in approved report paths.
- Import boundaries fail fast before drift becomes architecture debt.
- Repeated operational mechanics are centralized behind explicit service APIs while product policy remains reviewable in orchestration.
- PR templates route risk and verification without relying on memory.

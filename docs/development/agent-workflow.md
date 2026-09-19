# Agent Workflow

Status: Current
Owner: Platform lead
Last updated: 2026-09-19
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
- Keep product orchestration in actions/routes/commands and repeated mechanics in service functions as defined by `docs/standards/service-layer.md`.
- Run the smallest useful checks, then broader checks when shared contracts changed.
- Summarize changed files, verification, and remaining risk.

## Jev Decisions

Coding agents delegate explicit task classification, skill selection, prioritization,
and implementation approach choices to Jev through `pnpm -s agent:decide`.
Read the installed [TypeSafe skill](../../.agents/skills/typesafe-ai/SKILL.md) when
preparing questions. Gather evidence and reasonable alternatives, let Jev select,
then implement and verify the selection. Do not frame the options to rubber-stamp
a preferred answer. Batch independent questions sharing the same evidence; ask
dependent questions after their prerequisite answers or new evidence are available.

The helper reads `TYPESAFE_API_KEY` from the process environment, or from the
repository-root `.env.local` if the environment variable is absent. It reads that
file as data, uses only the key, and never prints it. Keep it out of tracked files.
The official SDK supplies the endpoint and default model; this developer helper
rejects endpoint/model environment overrides and does not change product routing.

Pass a JSON object on stdin with `state` and named `questions`. Each question has
`type: "choice"`, meaningful `instructions`, and descriptive `criteria`, including
`no_suitable_choice`. Question IDs are response keys; include the complete meaning
in instructions because Jev does not see the IDs. Example:

```sh
pnpm -s agent:decide <<'JSON'
{
  "state": {
    "goal": "Choose the next investigation.",
    "evidence": "An isolated test reproduces acceptance of expired sessions. Another test reports a heading spacing mismatch."
  },
  "questions": {
    "next_investigation": {
      "type": "choice",
      "instructions": "Which investigation should be prioritized given the observed failures?",
      "criteria": {
        "session_expiry": "Investigate acceptance of expired sessions.",
        "heading_spacing": "Investigate the heading spacing mismatch.",
        "no_suitable_choice": "The evidence does not justify selecting either investigation."
      }
    }
  }
}
JSON
```

Only the supplied state and questions are sent to TypeSafe using the developer's
account. Send the minimum relevant evidence; never send credentials, environment
file contents, customer data, or Local/BYOK session content through this helper.
It does not read repository content automatically or execute the selected action.

The JSON result includes each choice, probabilities, confidence, actual model,
token usage, and a hash of the input including any local confidence policy.
Report Jev's choice and confidence when the decision materially affects the work.
Keep evidence freshness in view: a selection applies to the state submitted.

When invoked directly with `node scripts/jev-decide.mjs`, exit code `0` means all
choices were selected, `2` means at least one choice needs review, and `1` means
the request failed. The pnpm script wrapper may normalize nonzero exit codes to
`1`; consume the JSON `status` to distinguish review from failure. Abstention or
tied leading options pause the affected choice. A question may specify
`minimumConfidence` between 0 and 1;
derive that policy from evaluated cases and consequences, not an invented universal
threshold. A result below that threshold also needs review. On malformed answers,
missing credentials, service failure, or exhausted time/retry budgets, report the
failure and pause the affected choice. Gather missing evidence or ask the user;
never silently substitute the coding agent's choice or retry until a preferred
answer appears. Independent work may continue.

Explicit user instructions, repository rules, permissions, deterministic checks,
and observed facts govern execution. Jev does not authorize actions or replace
tests, and confidence is not proof of correctness. This is an agent workflow
instruction, not an interceptor that can force every internal model decision or
tool call through Jev. The helper validates its own requests and responses.

Operational limits live in `scripts/config/jev-decisions.json`. Run
`pnpm test:agent-decisions` for offline validation; the example above makes a paid
live API call. SDK logging is disabled and raw provider errors are not echoed.

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
- `docs/development/agent-workflow.md` defines the human/integrator workflow for running many agents without overlapping writes.
- `docs/standards/service-layer.md` defines how agents extract repeated operational mechanics without hiding product policy.
- `.github/PULL_REQUEST_TEMPLATE/parallel-agent-change.md` is the PR template for lane-scoped parallel work.
- `docs/research/autonomous-company-roadmap.md` defines the later feedback-to-patch automation loop.

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
- Worktree path: `.worktrees/<lane-id>-<short-goal>`, where `<lane-id>` is an id from
  `docs/agent-context/lanes.json`, the only lane names `pnpm check:lane-ownership` recognises
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

## Workspace Task Graph

`turbo.json` is the canonical Node workspace task graph. Packages and apps own
their concrete `lint`, `typecheck`, `test`, and `build` commands; root commands
delegate through Turbo. CI uses `--affected` for change selection and verifies
the static graph with a dry run before relying on it.

Use `pnpm exec turbo run <task> --filter=<owner>` for a bounded owner path and
`pnpm exec turbo run lint typecheck test --affected --dry=json` to inspect CI
selection. Rust remains in the Cargo workspace graph. A Turbo dry run proves
task selection only; it is not evidence that the selected tasks pass.

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

## 15+ Parallel Agents

AGI Workforce should support many parallel agents, but parallelism is useful only when work is split by ownership lane.

Recommended default for a large initiative:

| Role            | Count | Responsibility                                                               |
| --------------- | ----: | ---------------------------------------------------------------------------- |
| Lead/integrator |     1 | Owns decomposition, shared files, final merge, changelog, and release notes. |
| Explorers       |   3-5 | Read-only investigation, risk discovery, reproduction, source mapping.       |
| Implementers    |  6-10 | One lane each, one worktree each, one coherent patch each.                   |
| Reviewers       |     2 | Security/privacy review and product/parity review.                           |
| Verifiers       |     2 | Run checks, reproduce fixes, capture evidence.                               |
| Release/docs    |     1 | Release notes, docs, installer/update implications.                          |

This gives 15-21 active agents without making two agents edit the same path.

## Required Inputs

Before starting a parallel wave, the lead creates a task list with:

- Lane ID from `docs/agent-context/lanes.json`.
- Goal.
- Owned write paths.
- Blocked paths.
- Required checks.
- Integration owner.
- Expected handoff summary.

Use `docs/agent-context/task-manifest.schema.json` for machine-shaped task manifests.

## Integration Order

1. Explorers finish and publish findings.
2. Implementers finish lane patches.
3. Integrator reviews each diff for lane compliance.
4. Shared contract changes land before app consumers.
5. Lockfiles and root docs update once.
6. Reviewers inspect high-risk diffs.
7. Verifiers run targeted checks, then repo-wide guardrails.
8. Integrator commits and records `CHANGELOG.md`.

## Collision Protocol

If two agents need the same path:

1. Stop the lower-priority agent.
2. Pick one owning lane.
3. Convert the second task to read-only review or move it to a different lane.
4. Merge the owner lane first.
5. Rebase/restart the second task from the new base.

## What To Automate First

- Lane validation in CI with `pnpm check:lane-ownership`.
- Lane-scoped preflight with `node scripts/check-lane-ownership.mjs --lane <lane-id> --staged` or `--changed-file <path>` before assigning or merging an agent task.
- Task manifests for agent-created branches.
- GitHub issue labels that map to lane IDs.
- PR template checks for lane ID, owned paths, shared files, and verification.
- A dashboard showing active lanes, worktrees, PRs, blocked paths, and check status.

## What Not To Automate Yet

- Direct merge to `main` from an agent without human approval.
- Release publishing from a feedback item without a signed release gate.
- Billing, refund, provider-routing, or privacy-boundary changes without human review.
- Secret-bearing workflows in untrusted PR contexts.

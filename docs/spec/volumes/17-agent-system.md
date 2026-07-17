# Volume 17 — Agent System

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 17)
Authority: this manual · `docs/strategy/09-reference-codebases.md` (claude-code subagent + loop patterns) · `docs/strategy/10-oss-corpus-port-plan.md` (codex-rs runtime, OpenHands, agentscope, SkillSpector) · `apps/cli/src/agent/` · `apps/cli/src/features/a2a/`

## Philosophy & Cloud/Local stance

An agent is the chat loop given tools, a permission envelope, and the authority to act. A multi-agent system is that same loop forked into roles — planner, executor, critic/reflector, reviewer — coordinated toward one goal. The non-negotiable design choice (from `docs/strategy/09`): **a subagent is the same `query()` loop, forked and scoped**, with its own agent id, transcript sidechain, abort controller, restricted tool pool, additive-only MCP envelope, and its own permission mode — followed by exhaustive cleanup of every resource. We do not maintain a second, divergent agent implementation for subagents.

Cloud/Local/Hybrid sets the agent's reach, not its safety contract. A Local agent acts only with local tools and local context; it never spawns a subagent that silently reaches a hosted provider. A Managed/BYOK agent may use hosted tools but every boundary-crossing or destructive action passes an approval gate with a human in the loop. Long-running, autonomous, scheduled, and background agents are the highest-risk category: they run sandboxed, with explicit approval gates, spend/quota ceilings (Vol 28), and a kill path. Read-only investigation agents (plan/explore) drop heavy context (project memory, git status) the way claude-code's read-only agents do — both for cost and for blast-radius reduction.

## Binding rules

1. A subagent is a forked loop with a scoped tool pool, permission mode, and additive-only MCP envelope; it never inherits broader authority than its parent.
2. Every spawned agent has exhaustive `finally` cleanup (abort controller, transcript handle, MCP connections, temp files); leaks are a bug, not background noise.
3. Boundary-crossing or destructive agent actions require a human-in-the-loop approval gate; deny beats allow (Vol 18 permission pipeline).
4. Autonomous/background/scheduled agents run sandboxed (`crates/sandbox-policy`, `crates/agiworkforce-execpolicy`) with spend ceilings and a kill switch.
5. A Local agent never spawns or delegates across a trust boundary without the explicit fork; trust mode is inherited and never widened by a child.
6. Agent memory is trust-scoped (Vol 12 container-tag isolation): a Local agent's memory never surfaces in a BYOK/Managed run.
7. Delegation records the delegated goal, selected context, and (when a boundary is crossed) the redaction hash — same provenance discipline as conversation forks (Vol 9).
8. Marketplace/imported agents pass the vetting gate (SkillSpector, `docs/strategy/10` §5) before they can run, and re-scan on update for rug-pulls.

## Repository map

- Core agent loop + privacy modes: `apps/cli/src/agent/mod.rs` (Local/BYOK/Managed modes; blocks Local sessions from silently using non-local provider modes).
- Plan/role behavior: `apps/cli/src/features/plan/plan_mode.rs`; tool execution surface: `apps/cli/src/features/exec/` and `apps/cli/src/features/exec/tools/`.
- Agent-to-agent coordination: `apps/cli/src/features/a2a/` (`client.rs`, `server.rs`, `registry.rs`, `security.rs`, `protocol.rs`, `jsonrpc.rs`) — the delegation/transport substrate.
- Sandboxing + policy (wire into the loop, `docs/strategy/10` C3): `crates/sandbox-policy/src/lib.rs`, `crates/agiworkforce-execpolicy/`, `apps/cli/src/platform/policy/`.
- Permission/request protocol: `crates/agiworkforce-protocol/src/request_permissions.rs`, `request_user_input.rs`, `plan_tool.rs`, `dynamic_tools.rs`.
- TS agent surfaces: `packages/client/desktop-command-client/src/agent.ts`, `packages/client/desktop-command-client/src/customAgents.ts`; UI: `apps/web/features/chat/components/agents/`.
- Scheduling/background: `packages/client/desktop-command-client/src/scheduler.ts`, Desktop Scheduled/Dispatch subpanels (source-of-truth Desktop section).

## Competitor notes

ChatGPT (scheduled tasks, custom GPTs, GPT Store) and Codex (background/cloud agents, worktrees, multi-surface task summaries) ship the multi-agent + delegation surface AGI targets (`docs/strategy/01`). Claude Code's internal subagent model — forked loop, per-agent MCP/tool/permission envelope, slim read-only agents — is the runtime blueprint AGI adapts (study only; never copy code). AGI's divergence: subagents and autonomous runs are **trust-boundary-aware and sandbox-gated by construction**, and an agent marketplace is **vetted before execution** — a privacy/safety posture no competitor markets (`docs/strategy/02`, `10` §5). Build the engine from license-clean donors (codex-rs Apache-2.0, OpenHands MIT core); originate the trust enforcement.

## Checklists

### Single-agent loop

- [ ] Loop transitions use typed continue/terminal reasons, not raw `stop_reason` (`docs/strategy/09`).
- [ ] Tool calls pass the layered fail-closed permission pipeline before execution (Vol 18).
- [ ] Compaction is summary-based for long runs, with a failure circuit breaker (C2, `docs/strategy/10`).
- [ ] The loop never mutates the API-bound prompt object; clones for observers (cache discipline, Vol 10).

### Multi-agent roles (planner/executor/critic/reviewer)

- [ ] Each role is the same loop with a scoped tool pool + permission mode, not a bespoke implementation.
- [ ] Planner output is a real plan artifact a reviewer/human can approve.
- [ ] Critic/reflector findings feed back as structured input, not silent retries; add a doom-loop guard (identical call ×3 → human, `docs/strategy/10`).
- [ ] Reviewer gates destructive/boundary-crossing actions before they execute.

### Subagent fork + cleanup

- [ ] Fork carries its own agent id, transcript sidechain, abort controller.
- [ ] Tool pool is restricted; MCP servers are additive-only; permission mode is set explicitly.
- [ ] Read-only agents drop project memory + git status to shrink cost and blast radius.
- [ ] `finally` cleanup releases every handle/connection/temp resource; a test asserts no leak after spawn.

### Delegation

- [ ] Delegated goal + selected context recorded; boundary crossings record a redaction hash.
- [ ] Child trust mode equals parent's or narrower — never wider.
- [ ] a2a transport authenticates peers (`a2a/security.rs`); no unauthenticated delegation.

### Long-running / autonomous / scheduled / background

- [ ] Runs inside the sandbox/policy engine with a kill switch and timeout.
- [ ] Spend/quota ceiling enforced server-side; exceeding it pauses for approval (Vol 28).
- [ ] Boundary-crossing/destructive steps require human-in-the-loop approval.
- [ ] Scheduled agents persist run state (queued/running/tool_wait/completed/interrupted/failed) for resume/audit.

### Agent memory

- [ ] Memory namespaced by trust boundary; Local memory never surfaces cross-boundary.
- [ ] Generated-from-history facts carry source provenance (Vol 12).
- [ ] User can view/manage/reset agent memory.

### Marketplace

- [ ] Imported agents pass SkillSpector vetting before first run; re-scan on update.
- [ ] Declared-vs-actual permission diff enforced as a hard gate.
- [ ] Agent definitions install only from an allowlisted source (Vol 22).

## Definition of Done

The agent loop is single-source and forkable; every subagent runs in a scoped, additive-only envelope with verified cleanup; the policy/sandbox engine is wired into the permission path; autonomous and scheduled runs are sandboxed, spend-capped, killable, and approval-gated; agent memory and delegation are trust-scoped with provenance; and marketplace agents are vetted before execution. Verified with targeted + trust-boundary tests and a leak/cleanup test (Operating Law 4).

## Anti-patterns

- A second, divergent subagent implementation instead of forking the one loop.
- Spawning agents without exhaustive cleanup (the long-session leak class).
- Autonomous/background runs without sandbox, spend cap, or kill switch.
- A child agent gaining broader tools/trust than its parent.
- Running marketplace agents before vetting, or skipping the rug-pull re-scan.
- Silent retries that hide a doom loop instead of escalating to a human.

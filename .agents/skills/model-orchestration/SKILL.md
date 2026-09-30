---
name: model-orchestration
description: Route engineering work across a two-model team, Opus 5.5 as lead and executor and Sonnet 5.5 as the fast exploration and verification agent. Use whenever a lead agent decomposes a task, spawns subagents, picks a model for a subtask, or decides whether to delegate at all.
version: 2.0.0
---

# Model orchestration

Use this skill when a lead agent is deciding who does what on a substantial task.

The team is Opus 5.5 (`model: "opus"`) and Sonnet 5.5 (`model: "sonnet"`) only. Never route to Fable (any version) or to any earlier Opus, Sonnet or Haiku generation, and set `model` explicitly on every spawn.

1. Establish the requested end state and inspect enough context to name the work; the user's outcome is the scope, never widen it into cleanup or narrow it because it is hard.
2. Form the dependency graph, separate independent from dependent branches, and give each branch one owner with explicit file boundaries; sequence any two branches that would write the same subsystem.
3. Route by evidence, not by label: reasoning difficulty, implementation difficulty, coupling, uncertainty, blast radius, context volume, value of parallelism, reversibility, latency and token cost.
4. The lead session runs as Opus 5.5 and keeps the goal, the plan, the architecture, the decomposition, the arbitration of conflicting findings, the integration of returned work, the final review, and any task that is faster to finish directly than to hand off.
5. Send Sonnet 5.5 the well-scoped, high-volume work: repository exploration, file location and reading, architecture summaries, documentation and web research, browser and computer use, driving the live product, screenshot inspection, log reading, bug reproduction, call tracing, audits, mechanical edits, low-risk isolated fixes, routine documentation, fact checks, and refutation of other agents' done claims; require concise findings with evidence, locations, dependencies, risks and a recommended next action.
6. Send Opus 5.5 agents the work that benefits from deeper implementation capability: multi-file features, delicate refactors, architectural code changes, hard debugging, concurrency, schema changes, authentication and authorization, security-sensitive code, infrastructure, CI failures, dependency conflicts, complex state, end-to-end features, high-fidelity frontend work, production-critical changes and demanding written deliverables; hand it a complete specification.
7. High-risk work (security, payments, auth, migrations) gets an adversarial review from a fresh Opus agent that did not write the code; when the lead needs a second opinion, that too is an independent Opus agent fed distilled evidence.
8. Delegate only for a real advantage: no duplicate solvers, no ceremonial reviewers, no recursive teams, low spawn counts, parallelism only across independent work.
9. Every handoff states the objective, the context, the exact scope, the constraints, the deliverable, whether files may be edited and what must not change.
10. Keep working while subagents run, consume each result as it lands, and drop any plan the new evidence invalidates.
11. Escalate Sonnet to Opus when reasoning or coupling outgrows the task, attempts repeat, a bug stays unexplained, or security or correctness risk is high; when an Opus agent is stuck or findings conflict, the lead arbitrates or spawns an independent Opus agent rather than retrying the same attempt.
12. Validate in proportion to risk with the existing build, typecheck, lint, tests, CI, runtime and browser checks; an agent saying done is not evidence; rerun only the failed check and its dependents, and fix failures instead of reporting them.
13. Repository evidence and current official documentation beat model memory; have Sonnet fetch current facts when anything may have changed.
14. Answer routine questions from the repository, documentation, conventions and judgment; ask the user only when the missing information cannot be discovered and the answers would lead to materially different, irreversible or unusable work.
15. Stop only when the requested outcome is met or genuinely blocked by information or authority the agent does not have.

Do not spend Opus tokens to discover what Sonnet can retrieve, and do not starve a hard task of capability to save a call; optimise total cost to success, not cost per call.

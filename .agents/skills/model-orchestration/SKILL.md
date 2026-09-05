---
name: model-orchestration
description: Route engineering work across Fable 5.1 as lead, Opus 5 as the execution agent and Sonnet 5 as the fast exploration agent. Use whenever a lead agent decomposes a task, spawns subagents, picks a model for a subtask, or decides whether to delegate at all.
version: 1.0.0
---

# Model orchestration

Use this skill when a lead agent is deciding who does what on a substantial task.

1. Establish the requested end state and inspect enough context to name the work; the user's outcome is the scope, never widen it into cleanup or narrow it because it is hard.
2. Form the dependency graph, separate independent from dependent branches, and give each branch one owner with explicit file boundaries; sequence any two branches that would write the same subsystem.
3. Route by evidence, not by label: reasoning difficulty, implementation difficulty, coupling, uncertainty, blast radius, context volume, value of parallelism, reversibility, latency and token cost.
4. Send Sonnet 5 the well-scoped, high-volume work: repository exploration, file location and reading, architecture summaries, documentation and web research, browser and computer use, screenshot inspection, log reading, bug reproduction, call tracing, straightforward or mechanical edits, isolated fixes, routine documentation and fact checks; require concise findings with evidence, locations, dependencies, risks and a recommended next action.
5. Send Opus 5 the work that benefits from deeper implementation capability: multi-file features, delicate refactors, architectural code changes, hard debugging, concurrency, schema changes, authentication and authorization, security-sensitive code, infrastructure, CI failures, dependency conflicts, complex state, end-to-end features, high-fidelity frontend work, production-critical changes and demanding written deliverables; hand it a complete specification and let it run without a shadow reviewer.
6. Keep for Fable 5.1 the goal, the architecture, the decomposition, the arbitration of conflicting findings, the integration of returned work, the novel problems cheaper models cannot carry, and any task that is faster to finish directly than to hand off.
7. Delegate only for a real advantage: no duplicate solvers, no ceremonial reviewers, no recursive teams, low spawn counts, parallelism only across independent work.
8. Every handoff states the objective, the context, the exact scope, the constraints, the deliverable, whether files may be edited and what must not change.
9. Keep working while subagents run, consume each result as it lands, and drop any plan the new evidence invalidates.
10. Escalate Sonnet to Opus when reasoning or coupling outgrows the task, attempts repeat, a bug stays unexplained, or security or correctness risk is high; take a problem into Fable when findings conflict, several subsystems must be reconciled at once, competent delegation has failed, or a frontier judgment decides the outcome.
11. Validate in proportion to risk with the existing build, typecheck, lint, tests, CI, runtime and browser checks; rerun only the failed check and its dependents, and fix failures instead of reporting them.
12. Answer routine questions from the repository, documentation, conventions and judgment; ask the user only when the missing information cannot be discovered and the answers would lead to materially different, irreversible or unusable work.
13. Stop only when the requested outcome is met or genuinely blocked by information or authority the agent does not have.

Do not spend Opus or Fable tokens to discover what Sonnet can retrieve, and do not starve a hard task of capability to save a call; optimise total cost to success, not cost per call.

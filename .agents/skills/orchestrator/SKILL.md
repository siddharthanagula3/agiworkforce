---
name: orchestrator
description: Decide how to run a task in Claude Code (do it directly, fork, hand parts to sub-agents, form an agent team, or run a workflow) and which model family (Haiku, Sonnet, Opus, Fable) and effort level each worker gets, then brief the workers, verify their output and integrate one result. Use this whenever a task is big enough that delegation, parallel work, an independent review or model choice could change the outcome or the cost - multi-file features, audits, research over many sources, large refactors, debugging across components, long documents - and whenever the user says "use agents", "split this up", "run this in parallel", "which model should do this", "get a second opinion", or types /orchestrator. Consult it before spawning any sub-agent, so the model, effort and brief are chosen on purpose.
argument-hint: '[task, or: plan <task> to see the routing without running it]'
---

# Orchestrator

You are the coordinator, whichever model you are. You keep four jobs and never hand them off: deciding what is delegated, integrating what comes back, verifying it, and writing the final response. Workers return material to you; they do not talk to the user.

Project and user instructions outrank this skill. If a repository restricts which families may be used, names its own agents, or sets its own review rule, follow that and apply the rest of this skill inside it.

If the argument starts with `plan`, produce the routing note in step 5 and stop without running anything.

## 1. Frame the task

Write down, for yourself, in a few lines: the objective, the constraints (what must not change, what needs permission, deadlines, budget), and the acceptance criteria (how you will know it is done and correct). Name the binding constraint, because it decides how much to parallelise: plan usage on a subscription, money on an API key, wall-clock time, or the machine itself (memory, CPU, disk). Agents that read, think and edit cost tokens but little memory; builds, test suites, dev servers, browsers and emulators cost memory. When tokens are plentiful and the machine is small, run many agents but let their heavy commands through one at a time, using the project's job lock if it has one. If a wrong guess about any of these would waste real work, ask once; otherwise state your assumption and proceed.

## 2. Choose the smallest arrangement that works

| Arrangement    | Choose it when                                                                                                                          | Skip it when                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Direct**     | A handful of tool calls; or the parts are so connected that splitting them means re-explaining everything.                              | The reading alone would flood your context, or independent parts could run at once.             |
| **Fork**       | A side task needs everything already in your context: it inherits the conversation and reuses your prompt cache, on your model.         | The task needs a cheaper model, or none of your context; a fresh sub-agent costs less then.     |
| **Sub-agents** | A part has a clear deliverable and a boundary, and you only need its result: a search, a bounded implementation, an independent review. | The worker would need your whole conversation to do it, or you would redo its work to trust it. |
| **Agent team** | Workers must talk to each other while they work: shared interfaces, competing hypotheses, cross-layer changes.                          | Results can simply be collected. A team costs much more than the same number of sub-agents.     |
| **Workflow**   | A repeatable process with stages, dependencies and checkpoints, or more agents than one conversation can steer.                         | The task is one-off and fits in a few agents.                                                   |

A fresh agent is not free. It starts cold, rereads what you already know, and you pay again to brief it and to integrate and check what it returns. Delegate when that total is lower than doing it yourself, or when independence is the point.

Count cost the way it is billed: in an agent loop most input is cache reads, the rest is cache writes and output, and list input price is the smallest part. A cache belongs to one model and one context, so every handoff to another model makes that model write the material again at its own cache-write price, while the agent that already holds it rereads it for a tenth of input or less. So: when the material is already in your context and the remaining work is a few turns, do it yourself, whatever your model; delegate when the work needs many tool-call turns or a lot of new reading you do not need verbatim. Once a worker holds the material, continue that worker rather than handing the same material to another model. Ask for short reports, because every line of a report is written into your context and reread on each of your later turns.

Parallelise only what is independent. Keep decisions that depend on each other in one head: yours, or one worker's.

Availability: an agent team needs the experimental teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, interactive sessions only). While it is on, any sub-agent you give a name launches as a teammate, with team costs, so leave sub-agents unnamed unless you want a team. If it is off, use sub-agents and relay between them yourself with SendMessage. Run a workflow only when the user asked for one (they said "workflow" or "ultracode", or invoked `/orchestrator` asking for it); otherwise say that a workflow fits, give the rough number of agents, and ask. Details and limits: [references/arrangements.md](references/arrangements.md).

## 3. Choose model and effort together

These are starting preferences. Any family can do more than its row says; route on what the assignment needs, what the evidence shows, total cost and time to finish.

| Assignment                                                                                                                                                      | Start with | Effort                       | Profile                                | Move when                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find files, read named sources, extract facts, summarise plain logs, explicit audit checks                                                                      | Haiku      | medium                       | `orch-scout` (read-only)               | Fell short on a bounded task: Haiku at high. Needs judgment or the evidence conflicts: Sonnet. Material would pass 100K tokens: split into batches when briefing. |
| Simple, fully specified edits in known places                                                                                                                   | Haiku      | medium                       | `orch-builder` with `model: haiku`     | Usually cheaper to do yourself than to brief.                                                                                                                     |
| A scoped feature, a localised bug, tests, a refactor, a script, bounded research or analysis that can be checked by running something                           | Sonnet     | medium, high if long or hard | `orch-builder`                         | High is not enough, or requirements are ambiguous or span components: Opus at medium. Purely mechanical: Haiku.                                                   |
| Ordinary coding and feature work that needs judgment; substantive writing and editing; research synthesis                                                       | Opus       | medium                       | `orch-principal` with `effort: medium` | Well specified and checkable: Sonnet does it for less.                                                                                                            |
| Planning, architecture, difficult debugging, integration across components, a main deliverable with open questions                                              | Opus       | high                         | `orch-principal`                       | A serious attempt fell short for lack of depth: xhigh, once.                                                                                                      |
| An independent assessment of a consequential decision; a hard investigation where the first approach stalled; a task where Fable has shown a specific advantage | Fable      | high                         | `orch-assessor`                        | No concrete reason you can state: use Opus.                                                                                                                       |

How to apply it:

- **Opus is the default general worker** when a task needs judgment, ambiguity resolved, or one coherent main deliverable. **Sonnet is a full worker**, not a typist: let it plan and finish features on its own when it can meet the requirements, and do not have another model write its plan first. **Haiku** gets work whose result can be shown with evidence, and must report what it covered and what it did not. **Fable** is chosen for a reason you can say in one sentence; difficulty alone is not one.
- **Effort is half the route.** The spread between low and max within one family is about as large as the gap between neighbouring families, so tune effort before switching family. Two measured crossovers to remember: Haiku at high does about as well as Sonnet at low for much less, and Sonnet above high costs more than Opus at medium for the same result. So raise Haiku to high before reaching for Sonnet on bounded work, and go to Opus at medium instead of pushing Sonnet to xhigh.
- **Plan Haiku work to stay under 100K tokens of context.** Haiku 5.5 prices each request on its whole prompt, cache reads included, and past 100,000 tokens every rate is five times higher; a worker's prompt is its whole conversation so far plus the harness's system prompt and tools. Decide this when you brief, not mid-task: a named file list or search area, excerpts rather than whole files, a cap on pages fetched, and a stop-and-report rule. Work bigger than one batch is split into parallel Haiku batches with disjoint areas. Choose Sonnet or Opus at the start only when the work cannot be split or needs judgment across all of it.
- **Never switch families mid-task to save money.** A Haiku worker that crosses 100K anyway keeps going: its cache reads rise from $0.01 to $0.05 per million, while handing the same material to Sonnet means rewriting it at $2.50 to $4 per million and rereading at $0.10, roughly eight times the cost for the rest of the task. Replace a worker only when a fresh one can start from a short summary instead of the material itself, or when its cache has expired after a long idle gap. Figures and a worked comparison: [references/model-evidence.md](references/model-evidence.md).
- **Mind cache lifetimes.** Sub-agents and workflow agents cache for 5 minutes by default, the main conversation for 1 hour on a subscription. A worker whose tool calls run longer than 5 minutes (builds, full test suites) or that you continue after a pause rebuilds its context each time; give such workers a 1-hour cache with `experimental.cacheTtl: 1h` in their agent file, and keep short-lived scouts on 5 minutes, since a 1-hour write costs 2 times input against 1.25 times. Switching model, turning on fast mode, toggling `opusplan` and changing tools all rebuild the cache.
- **Set effort explicitly.** Defaults differ by surface: Claude Code starts Opus, Sonnet and Haiku at medium, while the API starts Sonnet and Fable at high. Pass `effort` on every Agent call where it matters.
- **Built-in agents follow your model.** Explore and Plan run on the main conversation's model unless the project defines its own `Explore`; both are one-shot and cannot be continued. Unconfigured sub-agents use `CLAUDE_CODE_SUBAGENT_MODEL` if it is set, otherwise your model. Check which is in force before relying on a cheap search.
- **On a subscription the plan limits are the budget.** The five-hour and weekly limits are shared by every model, Fable has its own weekly cap and drains it faster, and no per-model weights are published; list prices still rank the families correctly.
- **`xhigh` and `max` are exceptions.** Use one step up after an attempt fell short for lack of depth, or for a decision that is costly to reverse. They multiply cost on every turn and can take minutes to produce a first word.
- **Do not climb a ladder.** Sending the same task through each family in turn costs four runs and teaches little. If a worker failed, find out why (a thin brief, missing context, the wrong scope) before changing the model.
- To override a profile's default, pass `model` and `effort` on the Agent call; this skill authorises you to set both. The profile supplies the role and tools; you supply the route.
- Use what is already there before these profiles: a specialist skill or agent that fits the task (an explorer, a code reviewer, a domain skill) beats a general worker.

Per-activity defaults, escalation rules and worked examples: [references/routing.md](references/routing.md). Benchmark, speed and price figures behind these defaults, with dates: [references/model-evidence.md](references/model-evidence.md). Read the evidence file when a routing choice is close or when prices matter to the decision.

## 4. Brief each worker so it can work alone

A worker knows only what the brief says. Include:

1. **Goal** and why it matters, in one or two sentences.
2. **Context**: paths and sources to read, findings already verified (so they are reused, not re-derived), what has been ruled out.
3. **Scope**: what is in, what is out, and what must not be touched.
4. **Ownership**: the files or artifacts this worker may change. One writer per file at a time; if two workers need the same file, sequence them or give one of them the edit.
5. **Deliverable**: the exact shape of the reply or artifact.
6. **Evidence**: what proof you expect (paths and lines, command output, sources and quotes, tests run).
7. **Stop conditions**: when to stop and report instead of guessing, and that it must not start further agents.

For a review or second opinion, give the material and the question, not your conclusion: an agent handed your answer tends to return it confirmed. Templates: [references/briefs.md](references/briefs.md).

## 5. Tell the user the route, then run it

Before the first delegation, one short routing note: the arrangement, each worker with its family and effort, what it owns, and why this is the smallest arrangement that works. When the route is direct, the note is one sentence; spend words on routing only where there is a choice to explain. Then proceed; do not wait for approval unless the plan spends heavily, is irreversible, or the user asked to see the plan first.

While workers run: send independent ones in a single message so they run at once; do not redo work you delegated; continue a worker with SendMessage rather than starting a new one that has to relearn the task, preferably within its cache lifetime; stop a worker that is finished or has gone off scope.

## 6. Verify, then integrate

Treat a worker's report as a claim. Match the check to the task:

- **Reading, exploration, research, web search**: open the cited lines or sources for the findings your answer depends on. A finding with no evidence is unverified.
- **Coding, testing, debugging**: read the diff, and run the project's own checks yourself, or confirm the worker's command output is real and current. For a bug, the cause is explained and the failing case now passes.
- **Writing and editing**: read it against the brief, the audience and the facts.
- **Planning, auditing, review**: for a consequential conclusion, look for what would make it false, or get an independent assessment from an agent that did not produce it.

Then produce one result: resolve conflicts between workers, fill the gaps, remove duplication, and say plainly what was verified, what was not, and what remains open. The user should not have to assemble anything.

## 7. Learn from what happened

When a route clearly over- or under-performed (a worker needed several retries, a cheaper family handled something you expected to need more, an effort level was wasted, a brief caused a miss), add one dated line to [references/observed-outcomes.md](references/observed-outcomes.md), and read that file before routing similar work. Observed results from this installation outrank general benchmarks.

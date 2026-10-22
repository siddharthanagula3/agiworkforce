# Arrangements: what each one costs and how to run it

Facts about Claude Code features here were read from the official documentation on 2026-10-08 and rechecked on 2026-10-21 (pages listed at the end). Re-check them when a feature behaves differently from this file.

## Direct execution

No extra agents. Best for small tasks and for work whose parts depend on each other so tightly that a worker would need your whole context. The cost is your own context window: if the task needs a lot of reading that you will not need afterwards, that reading is what to delegate.

## Forks

A fork is a sub-agent that inherits the whole conversation so far, with the same system prompt, tools and model. Its first request reuses your prompt cache, so "a fork costs less than a fresh subagent for tasks that need the same context". Start one with `/subtask <task>`, or Claude forks on its own (on by default). A fork cannot start another fork and cannot change model, so use it for parallel work that needs your context on your model, and a fresh sub-agent when a cheaper model or a clean context is the point.

## Sub-agents

A sub-agent starts fresh with only your brief, works on its own, and returns one report.

- Send independent sub-agents in one message so they run at the same time.
- A sub-agent can be continued with SendMessage; that keeps what it learned. Starting a new one discards it.
- The model is taken, in order, from: the `model` you pass on the call, the profile's frontmatter, the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable, then your own model. Pass `model` whenever the route matters.
- Sub-agents can start their own sub-agents by default (up to three layers). The `orch-*` profiles cannot, because recursive delegation hides cost and duplicates work. If you use another agent type, tell it in the brief not to delegate.
- One writer per file. Two sub-agents editing the same file will overwrite each other; sequence them, or give each its own files, or use a separate worktree per worker for larger parallel changes (`isolation: worktree` in the agent file).
- Up to 20 run at once by default. Their cache lasts 5 minutes unless the agent file sets `experimental.cacheTtl: 1h`. There is no per-agent thinking setting; `effort` is the control.
- The built-in Explore and Plan are one-shot (no agent ID, cannot be continued) and run on your model unless the project defines its own `Explore`. Use a custom or `general-purpose` agent when you will want to continue the work.

## Background sessions and batch changes

- A background session (`claude --bg`, agent view) is a full separate session in its own worktree, which you hand work to and check later. It suits independent tasks you will review, not tasks you will steer; "running ten agents in parallel uses quota roughly ten times as fast as running one."
- `/batch` splits one large mechanical change into 5 to 30 worktree-isolated sub-agents.
- Scheduled cloud routines and `/loop` resend context on every firing; use them for recurring checks, and keep each run's prompt short.

## Agent teams

A lead plus teammates with a shared task list and messaging between them.

- Experimental and off by default. Enabled with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the shell or in the `env` block of a settings file. Interactive sessions only. While it is on, any sub-agent given a name launches as a teammate, so teams can form without being asked for; leaving it off by default and turning it on per session avoids that.
- The documented cost figure is "approximately 7x more tokens than standard sessions when teammates run in plan mode". Teammates are not isolated in worktrees, so partition the files.
- One team per session; teammates cannot start teams of their own; in-process teammates are not restored when a session is resumed.
- A team uses significantly more tokens than one session or the same number of sub-agents, because every teammate carries its own context and the messages between them. The documentation suggests starting with three to five teammates.
- Use it when workers need each other's intermediate results: agreeing an interface between two sides of a change, arguing competing explanations of a bug, reviewing each other's work as it lands.
- If teams are off, get most of the benefit with named sub-agents: you relay the decisions between them with SendMessage. That is slower but cheaper, and it keeps you in control of what is shared.

Check whether teams are available before planning around one: the feature is set per project or per user, so it can be on in one repository and off in the next.

## Workflows

A script that runs agents in stages (pipelines, parallel fan-out, checkpoints) in the background and reports when done.

- Invoked when the user asks for one ("use a workflow", the keyword `ultracode`), by a saved workflow run as `/<name>`, or by a skill that tells you to. Saved scripts live in `.claude/workflows/` (project) or `~/.claude/workflows/` (personal).
- A single run can use far more tokens than the same task done in conversation, and there is no user input once it starts. Claude Code warns above 25 agents or 1.5 million projected tokens.
- Limits: 16 agents at once by default, 1,000 agents per run.
- Use it for a process with a fixed shape that repeats (review every changed file on several dimensions, then verify each finding), or for fan-out too wide to steer by hand.
- Because of the cost, this skill asks the user before starting a workflow unless they requested one. When you propose one, say roughly how many agents it would run. Respect any workflow size guidance the session gives you.
- Choose the family per stage the same way as for sub-agents: cheap, evidence-bound work on Haiku, scoped execution on Sonnet, judgment on Opus, and an independent verification stage only where a wrong finding is costly.

## Cost checklist

When comparing arrangements, count all of it:

- **Cold start**: each new agent rereads what it needs. Point it at paths instead of pasting content, and pass verified findings so it does not rediscover them.
- **Caching**: your own conversation is cached and cheap to continue; a new agent's context is not. Many short-lived agents can cost more than one longer one. Cache writes cost more than plain input (1.25 times for the 5-minute cache, 2 times for the 1-hour one), so a worker that runs two turns pays the write premium and gets little back.
- **Model switches**: a cache is per model, so moving material from one family to another pays the write again at the new family's price. Keep one model per body of material; continue the worker that already holds it.
- **Report size**: a report enters your context once as a write and is reread on every later turn at your own model's rate. Ask for findings, evidence and coverage, not narration.
- **Cache lifetime**: a worker left idle past its cache lifetime rebuilds its context on the next message; after a long gap, a fresh worker started from a summary can be cheaper than continuing.
- **Briefing and integration**: your tokens and time to write the brief, read the report and merge the result.
- **Verification**: the check you must run before trusting the output. If verifying costs as much as doing, do it yourself.
- **Retries**: a cheap worker that needs three attempts is not cheap. A worker at the wrong effort level pays on every turn.
- **Wall-clock time**: parallel independent work finishes sooner; dependent work does not, however many agents it gets.

## Sources read

- code.claude.com/docs/en/sub-agents
- code.claude.com/docs/en/agent-teams
- code.claude.com/docs/en/workflows
- code.claude.com/docs/en/skills
- code.claude.com/docs/en/model-config
- code.claude.com/docs/en/costs

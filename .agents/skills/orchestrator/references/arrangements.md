# Arrangements: what each one costs and how to run it

Facts about Claude Code features here were read from the official documentation on 2026-10-08 (pages listed at the end). Re-check them when a feature behaves differently from this file.

## Direct execution

No extra agents. Best for small tasks and for work whose parts depend on each other so tightly that a worker would need your whole context. The cost is your own context window: if the task needs a lot of reading that you will not need afterwards, that reading is what to delegate.

## Sub-agents

A sub-agent starts fresh with only your brief, works on its own, and returns one report.

- Send independent sub-agents in one message so they run at the same time.
- A sub-agent can be continued with SendMessage; that keeps what it learned. Starting a new one discards it.
- The model is taken, in order, from: the `model` you pass on the call, the profile's frontmatter, the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable, then your own model. Pass `model` whenever the route matters.
- Sub-agents can start their own sub-agents by default (up to three layers). The `orch-*` profiles cannot, because recursive delegation hides cost and duplicates work. If you use another agent type, tell it in the brief not to delegate.
- One writer per file. Two sub-agents editing the same file will overwrite each other; sequence them, or give each its own files, or use a separate worktree per worker for larger parallel changes.

## Agent teams

A lead plus teammates with a shared task list and messaging between them.

- Experimental and off by default. Enabled with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the shell or in the `env` block of a settings file. Interactive sessions only.
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
- **Caching**: your own conversation is cached and cheap to continue; a new agent's context is not. Many short-lived agents can cost more than one longer one.
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

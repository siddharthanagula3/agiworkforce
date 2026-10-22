# CLAUDE.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-10-21

Claude Code adapter. `AGENTS.md`, imported below, is the canonical contract for
every agent; obey it. Nothing here overrides or weakens it; this file only adds
what is specific to Claude Code.

@AGENTS.md

## Delegation

- Route delegated work with `.agents/skills/orchestrator`. It chooses the
  arrangement (direct, fork, sub-agents, agent team, workflow) and the model
  family and effort for each worker by the task's complexity, capability needs
  and billed cost, using the `orch-*` profiles and the Haiku `Explore` agent in
  `.claude/agents/`. Use only current-generation models, and run a workflow only
  when the owner asks for one.
- Owner overrides on top of the skill: legal and policy text is written by Opus
  only; public-page design options run on Fable. Unconfigured sub-agents default
  to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`), and agent
  teams are off unless a session turns them on.
- Give each agent a narrow scope and an explicit expected output. Never let two
  agents write the same file concurrently: one spec file per agent, deleted when
  it finishes.
- An agent driving the running product, through its own Playwright spec, works
  against real data. Name the controls it must not click, and require it to
  reproduce a finding before reporting it. AGENTS.md §1 on verifying the
  instrument applies to the agent as much as to its harness.

## Skills and sources

- Load `.agents/skills/agiworkforce-design` before any visible UI work; it
  carries the design language and names which vendored design skill applies at
  each stage.
- Use the skills in `.agents/skills/` for repeatable procedures rather than
  re-deriving them. `skills-lock.json` pins their content hashes, so any edit,
  a reformat included, fails CI until you run
  `node scripts/verify-skills-lock.mjs --regenerate`. Never install a skill with
  `npx skills add`; it bypasses the lock.
- Check library, framework and API details in Context7 or the provider's
  documentation before relying on recall. AGENTS.md §1 applies to every tool.

## Shared configuration

A fresh clone or cloud session gets only tracked files. `.gitignore` tracks
`.claude/settings.json` (project plugins and hooks), `.claude/agents/`,
`.claude/hooks/`, `.claude/rules/` and `.claude/skills/`, whose entries are
symlinks into `.agents/skills/`. To expose a developer skill to Claude Code, add
its symlink there; never put a skill's files directly in `.claude/skills/`.
Personal permissions, output style and MCP servers stay in user scope or the
ignored `.claude/settings.local.json`; never let a rule depend on them.

The hooks are conveniences over rules enforced elsewhere:
`.claude/hooks/block-lock-files.sh` blocks writes to `pnpm-lock.yaml` and
`Cargo.lock` (AGENTS.md §12), and `.claude/hooks/prettier-format.sh` formats on
write (`lint-staged` covers the committed path, so do not hand-format or fight
the diff).

## Rules and memory

- Path-scoped Claude behavior belongs in `.claude/rules/`, not here. Keep this
  file short.
- Claude memory holds discoveries in flight, not the system of record. Promote a
  durable discovery into the owner named in AGENTS.md §11 and delete the note.
- When you make the same mistake twice, fix it with a rule, an abstraction, a
  test or a guard, not a longer prompt.

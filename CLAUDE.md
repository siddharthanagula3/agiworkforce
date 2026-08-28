# CLAUDE.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-28

Claude Code adapter. **Read `AGENTS.md` first and obey it** — it is the canonical
contract for every agent. Nothing here overrides or weakens it; this file only
adds what is specific to Claude Code.

## Claude Code specifics

- Use sub-agents for bounded, parallel, read-only work: inventory, reference
  analysis, dependency tracing, review. Give each a narrow scope and an explicit
  expected output. Never let two agents write the same file concurrently.
- Use skills in `.agents/skills/` for repeatable procedures rather than
  re-deriving them. `skills-lock.json` pins their content hashes, so a reformat
  of any `SKILL.md` fails `scripts/verify-skills-lock.mjs` in CI.
- Path-scoped Claude behavior belongs in `.claude/rules/`, not in this file.
  Keep this file short.
- Reach for current documentation — Context7, provider docs, web search — over
  recalled API details. `AGENTS.md` §1 applies to every tool you have.
- Claude memory is for discoveries in flight, not the system of record. When a
  discovery is durable, promote it into the canonical owner named in
  `AGENTS.md` §11 and delete the note.
- When you make the same mistake twice, fix it with a rule, an abstraction, a
  test, or a guard — not with a longer prompt.

## Local-only tooling

These are developer-machine conveniences, not repository behavior. `.claude/*`
is gitignored (`.gitignore:216`), so a fresh clone, CI, and every non-Claude
agent run without them:

- `.claude/hooks/block-lock-files.sh` blocks writes to `pnpm-lock.yaml` and
  `Cargo.lock`. The underlying rule is real and stated in `AGENTS.md` §12 —
  change the manifest and run the package manager.
- `.claude/hooks/prettier-format.sh` formats files on write. `lint-staged`
  already covers the committed path, so do not hand-format or fight the diff.

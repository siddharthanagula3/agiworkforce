---
paths:
  - '.claude/rules/**'
---

# .claude/rules

Path-scoped instructions for Claude Code, tracked and shared with every clone.

Scope rules here instead of growing root `CLAUDE.md`. A rule earns a file when
it applies to one subtree and differs from the repository-wide contract in
`AGENTS.md`. Anything true repository-wide belongs in `AGENTS.md`, and anything
worth never violating belongs in a guard rather than in prose.

Name each file for the subtree or subject it governs, and start it with a
`paths:` frontmatter list of the globs it applies to. A rule without `paths:`
loads into every session, so it must earn that cost.

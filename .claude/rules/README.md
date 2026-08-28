# .claude/rules

Path-scoped instructions for Claude Code. `.gitignore` ignores `.claude/*` but
negates this directory, so these files are tracked and shared while local
settings and hooks are not.

Scope rules here instead of growing root `CLAUDE.md`. A rule earns a file when
it applies to one subtree and differs from the repository-wide contract in
`AGENTS.md`. Anything true repository-wide belongs in `AGENTS.md`, and anything
worth never violating belongs in a guard rather than in prose.

Name each file for the subtree or subject it governs, and state in its first
line which paths it applies to.

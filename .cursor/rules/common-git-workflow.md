---
description: "Git workflow: conventional commits, PR process"
alwaysApply: true
---
# Git Workflow

## Commit Message Format

```
<type>(scope): <lowercase description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci, build, style

Rules (enforced by commitlint + husky):
- Header max 100 characters
- Subject MUST be lowercase (not Sentence-case or PascalCase)
- Valid: `fix(rust): websocket timing fix`
- Invalid: `fix(rust): Batch 1 Rust fixes`

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## Pre-commit Hooks

Husky pre-commit runs `lint-staged` (ESLint + Prettier).
Commit-msg runs `commitlint` with `@commitlint/config-conventional`.

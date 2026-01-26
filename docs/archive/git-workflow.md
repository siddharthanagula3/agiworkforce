# Git Workflow Guide

Complete guide to Git workflow, branching strategy, and best practices for the AGI Workforce project.

## Table of Contents

- [Branching Strategy](#branching-strategy)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Common Workflows](#common-workflows)
- [Git Hooks](#git-hooks)
- [Best Practices](#best-practices)

## Branching Strategy

We use a simplified Git Flow with feature branches and main branch.

### Branch Types

```
main (protected)
  ↓
feature/add-chat-export
feature/improve-performance
fix/login-bug
docs/update-readme
refactor/simplify-store
```

### Branch Naming Convention

```bash
# Features
feature/<description>
feature/add-chat-export
feature/implement-voice-input

# Bug fixes
fix/<description>
fix/login-redirect
fix/memory-leak

# Documentation
docs/<description>
docs/update-setup-guide
docs/add-api-examples

# Refactoring
refactor/<description>
refactor/simplify-auth
refactor/extract-components

# Performance
perf/<description>
perf/optimize-rendering
perf/reduce-bundle-size

# Testing
test/<description>
test/add-e2e-tests
test/improve-coverage

# CI/CD
ci/<description>
ci/add-playwright-action
ci/update-deploy-workflow

# Chores
chore/<description>
chore/update-dependencies
chore/clean-unused-code
```

### Main Branch

- **Protected branch** - requires PR reviews
- **Always deployable** - all tests pass
- **Latest stable code** - production-ready
- **No direct commits** - only via PRs

### Feature Branches

```bash
# Create feature branch
git checkout -b feature/add-export

# Work on feature
# ... make changes ...
git add .
git commit -m "feat: add export functionality"

# Keep up to date with main
git fetch origin
git rebase origin/main

# Push to remote
git push origin feature/add-export

# Create pull request
# Via GitHub UI
```

## Commit Guidelines

### Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope?): subject

body?

footer?
```

### Commit Types

| Type       | Description      | Example                     |
| ---------- | ---------------- | --------------------------- |
| `feat`     | New feature      | `feat: add chat export`     |
| `fix`      | Bug fix          | `fix: resolve login issue`  |
| `docs`     | Documentation    | `docs: update README`       |
| `style`    | Formatting       | `style: fix indentation`    |
| `refactor` | Code refactoring | `refactor: simplify auth`   |
| `test`     | Tests            | `test: add e2e tests`       |
| `chore`    | Maintenance      | `chore: update deps`        |
| `perf`     | Performance      | `perf: optimize render`     |
| `ci`       | CI/CD            | `ci: add test workflow`     |
| `build`    | Build system     | `build: update vite config` |
| `revert`   | Revert commit    | `revert: feat: add feature` |

### Commit Examples

**Good commits:**

```bash
feat: add chat export functionality
fix: resolve memory leak in chat store
docs: update testing guide
feat(desktop): add keyboard shortcuts
fix(web): resolve subscription webhook issue
test: add e2e tests for chat flow
chore: update dependencies to latest
perf(desktop): optimize message rendering
```

**Bad commits:**

```bash
update                           # Too vague
fixed bug                        # Not descriptive
WIP                             # Work in progress
asdf                            # Meaningless
added feature and fixed bug     # Too broad
```

### Commit Message Structure

**Short commits (most common):**

```bash
git commit -m "feat: add export button"
```

**Detailed commits:**

```bash
git commit -m "feat: add export functionality

- Add export button to chat interface
- Implement JSON and Markdown export formats
- Add file save dialog
- Update tests

Closes #123"
```

**Breaking changes:**

```bash
git commit -m "feat!: redesign API structure

BREAKING CHANGE: API endpoints now require authentication token
Old endpoints are deprecated and will be removed in v2.0

Migration guide: docs/migration.md"
```

### Commit Best Practices

1. **One logical change per commit**

   ```bash
   # ✅ Good: Separate commits
   git commit -m "feat: add export button"
   git commit -m "test: add export tests"

   # ❌ Bad: Multiple unrelated changes
   git commit -m "feat: add export, fix bug, update docs"
   ```

2. **Present tense, imperative mood**

   ```bash
   # ✅ Good
   "add export feature"
   "fix login bug"

   # ❌ Bad
   "added export feature"
   "fixes login bug"
   "adding export feature"
   ```

3. **No period at the end**

   ```bash
   # ✅ Good
   "feat: add export"

   # ❌ Bad
   "feat: add export."
   ```

4. **Keep subject under 72 characters**

   ```bash
   # ✅ Good (50 chars)
   "feat: add export functionality"

   # ❌ Bad (too long)
   "feat: add export functionality with JSON, Markdown, and PDF formats"
   ```

5. **Use body for detailed explanation**

   ```bash
   git commit -m "feat: add export functionality" -m "
   - Supports JSON and Markdown formats
   - Uses native file save dialog
   - Includes chat metadata in export

   Closes #123"
   ```

## Pull Request Process

### Creating a Pull Request

1. **Ensure branch is up to date**

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Push to remote**

   ```bash
   git push origin feature/add-export
   ```

3. **Create PR via GitHub**
   - Go to repository
   - Click "Pull requests" → "New pull request"
   - Select base (main) and compare (your branch)
   - Fill in PR template

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made

- Added export functionality
- Updated tests
- Updated documentation

## Testing

- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)

[Add screenshots]

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests added/updated
- [ ] All tests pass
```

### PR Review Process

1. **Automatic checks run**
   - Linting
   - Type checking
   - Tests
   - Build

2. **Code review**
   - At least 1 approval required
   - Address review comments
   - Update PR as needed

3. **Merge**
   - Squash and merge (default)
   - Merge commit (for large features)
   - Rebase and merge (for clean history)

### Addressing Review Comments

```bash
# Make requested changes
git add .
git commit -m "refactor: address review comments"

# Push update
git push origin feature/add-export

# PR automatically updates
```

### PR Best Practices

1. **Keep PRs small and focused**
   - Target: < 400 lines changed
   - Single feature or fix
   - Easy to review

2. **Write clear PR descriptions**
   - What changed and why
   - How to test
   - Screenshots/videos if UI changes

3. **Link related issues**

   ```markdown
   Closes #123
   Fixes #456
   Related to #789
   ```

4. **Request specific reviewers**
   - Domain experts
   - Code owners
   - Team members

5. **Be responsive to feedback**
   - Respond to all comments
   - Mark resolved comments
   - Thank reviewers

## Common Workflows

### Starting New Work

```bash
# 1. Update main branch
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/add-export

# 3. Make changes
# ... code ...

# 4. Commit changes
git add .
git commit -m "feat: add export functionality"

# 5. Push to remote
git push origin feature/add-export

# 6. Create pull request
# Via GitHub UI
```

### Syncing with Main

```bash
# Option 1: Rebase (preferred)
git fetch origin
git rebase origin/main

# Resolve conflicts if any
# ... fix conflicts ...
git add .
git rebase --continue

# Force push (rebase rewrites history)
git push origin feature/add-export --force-with-lease

# Option 2: Merge (if branch is shared)
git fetch origin
git merge origin/main

# Resolve conflicts
git add .
git commit -m "merge: resolve conflicts with main"
git push origin feature/add-export
```

### Fixing Merge Conflicts

```bash
# During rebase
git rebase origin/main

# If conflicts occur:
# 1. Open conflicted files
# 2. Find conflict markers:
#    <<<<<<< HEAD
#    your changes
#    =======
#    main branch changes
#    >>>>>>> origin/main

# 3. Resolve conflicts manually

# 4. Stage resolved files
git add resolved-file.ts

# 5. Continue rebase
git rebase --continue

# If too complex, abort and ask for help
git rebase --abort
```

### Amending Last Commit

```bash
# Fix the last commit
git add forgotten-file.ts
git commit --amend --no-edit

# Or change commit message
git commit --amend -m "feat: improved commit message"

# Force push (only if not reviewed yet)
git push origin feature/add-export --force-with-lease
```

### Undoing Changes

```bash
# Unstage file
git restore --staged file.ts

# Discard local changes
git restore file.ts

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a commit (safe, creates new commit)
git revert abc123

# Revert multiple commits
git revert abc123..def456
```

### Interactive Rebase

```bash
# Clean up last 3 commits
git rebase -i HEAD~3

# In editor:
# pick abc123 feat: add feature
# squash def456 fix: typo
# squash ghi789 fix: another typo

# Result: 3 commits squashed into 1

# Force push
git push origin feature/add-export --force-with-lease
```

### Cherry-picking Commits

```bash
# Apply specific commit from another branch
git cherry-pick abc123

# Multiple commits
git cherry-pick abc123 def456

# Cherry-pick without committing
git cherry-pick -n abc123
```

### Stashing Changes

```bash
# Save work in progress
git stash

# Or with message
git stash save "WIP: working on export"

# List stashes
git stash list

# Apply most recent stash
git stash apply

# Apply and remove stash
git stash pop

# Apply specific stash
git stash apply stash@{1}

# Delete stash
git stash drop stash@{1}

# Clear all stashes
git stash clear
```

## Git Hooks

### Pre-commit Hook

Automatically runs before each commit:

```bash
# .husky/pre-commit
pnpm exec lint-staged
```

What it does:

- Lints staged files
- Formats staged files
- Fixes auto-fixable issues
- Aborts commit if errors remain

### Commit-msg Hook

Validates commit message format:

```bash
# .husky/commit-msg
pnpm exec commitlint --edit "$1"
```

Ensures:

- Conventional commit format
- Valid commit type
- Non-empty subject
- Max subject length

### Bypassing Hooks

```bash
# Skip hooks (emergency only!)
git commit --no-verify -m "emergency fix"

# Or temporarily disable
rm .husky/pre-commit
# ... commit ...
git checkout .husky/pre-commit
```

## Best Practices

### 1. Commit Often

```bash
# ✅ Good: Small, frequent commits
git commit -m "feat: add export button"
git commit -m "feat: add export logic"
git commit -m "test: add export tests"

# ❌ Bad: Rare, large commits
# ... 2 days of work ...
git commit -m "feat: complete export feature"
```

### 2. Write Clear Messages

```bash
# ✅ Good: Descriptive
git commit -m "fix: resolve memory leak in chat store by cleaning up listeners"

# ❌ Bad: Vague
git commit -m "fix bug"
```

### 3. Keep Main Clean

```bash
# ✅ Good: Feature branches
git checkout -b feature/add-export
# ... work ...
git push origin feature/add-export
# Create PR

# ❌ Bad: Direct commits to main
git checkout main
git commit -m "add feature"
git push origin main
```

### 4. Review Your Changes

```bash
# Before committing, review diff
git diff

# Or use a GUI
git difftool

# Review staged changes
git diff --staged
```

### 5. Use .gitignore

```bash
# .gitignore
node_modules/
dist/
.env.local
*.log
.DS_Store
```

### 6. Don't Commit Secrets

```bash
# ❌ Never commit:
.env.local
.env.production
credentials.json
*.pem
*.key

# ✅ Use example files:
.env.example
credentials.example.json
```

### 7. Atomic Commits

Each commit should:

- Be a complete change
- Not break the build
- Be independently revertible

```bash
# ✅ Good: Atomic commits
git commit -m "feat: add export button"
git commit -m "feat: add export logic"

# ❌ Bad: Incomplete commit
git commit -m "feat: add export (part 1)"
# ... app is broken until part 2 ...
```

### 8. Use Feature Flags

For large features:

```typescript
// Enable feature incrementally
const ENABLE_EXPORT = import.meta.env.VITE_ENABLE_EXPORT === 'true';

if (ENABLE_EXPORT) {
  // New feature code
}
```

### 9. Tag Releases

```bash
# Create tag
git tag -a v1.0.0 -m "Release v1.0.0"

# Push tag
git push origin v1.0.0

# List tags
git tag -l
```

### 10. Clean Up Branches

```bash
# Delete local branch
git branch -d feature/add-export

# Delete remote branch
git push origin --delete feature/add-export

# Prune deleted remote branches
git fetch --prune

# List merged branches
git branch --merged main
```

## Troubleshooting

### Undo Accidental Commit to Main

```bash
# If not pushed yet
git reset --hard HEAD~1
git checkout -b feature/my-feature
git cherry-pick <commit-hash>

# If already pushed (dangerous!)
# Contact team lead
```

### Lost Commits

```bash
# Find lost commits
git reflog

# Restore lost commit
git cherry-pick abc123
```

### Merge Conflict Hell

```bash
# Abort merge/rebase
git merge --abort
# or
git rebase --abort

# Ask for help
# Don't force through conflicts
```

### Pushed to Wrong Branch

```bash
# Reset wrong branch
git push origin +main:main  # Force reset

# Push to correct branch
git checkout -b correct-branch
git push origin correct-branch
```

## Quick Reference

```bash
# Start work
git checkout -b feature/name

# Commit
git add .
git commit -m "feat: description"

# Update from main
git fetch origin
git rebase origin/main

# Push
git push origin feature/name

# Create PR
# Via GitHub UI

# After PR merged
git checkout main
git pull origin main
git branch -d feature/name
```

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Commitlint](https://commitlint.js.org/)

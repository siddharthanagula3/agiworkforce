---
description: Generate skills from git history analysis
agent: build
---

# Skill Create Command

Analyze git history to generate skills: $ARGUMENTS

## Your Task

1. **Analyze commits** - Pattern recognition from history
2. **Extract patterns** - Common practices and conventions
3. **Generate SKILL.md** - Structured skill documentation
4. **Create instincts** - For continuous-learning-v2

## Analysis Process

### Step 1: Gather Commit Data
```bash
# Recent commits
git log --oneline -100

# Commits by file type
git log --name-only --pretty=format: | sort | uniq -c | sort -rn

# Most changed files
git log --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

### Step 2: Identify Patterns

**Commit Message Patterns**:
- Common prefixes (feat, fix, refactor)
- Naming conventions
- Scope patterns (rust, desktop, web)

**Code Patterns**:
- File structure conventions
- Import organization
- Error handling approaches
- Tauri IPC patterns

---

**TIP**: Run `/skill-create --instincts` to also generate instincts for continuous learning.

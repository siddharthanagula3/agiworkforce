---
description: Update documentation for recent changes
agent: doc-updater
subtask: true
---

# Update Docs Command

Update documentation to reflect recent changes: $ARGUMENTS

## Your Task

1. **Identify changed code** - `git diff --name-only`
2. **Find related docs** - CLAUDE.md, README, workspace docs
3. **Update documentation** - Keep in sync with code
4. **Verify accuracy** - Docs match implementation

## Documentation Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project constitution, build commands, architecture |
| `docs/STABILIZATION_ROADMAP.md` | Sprint progress |
| `docs/MASTER_PLAN.md` | Full audit + issue registry |
| `apps/desktop/README.md` | Desktop app docs |
| `apps/web/README.md` | Web app docs |

## Update Checklist

- [ ] CLAUDE.md reflects current architecture
- [ ] Build commands are current
- [ ] Tauri command count is accurate
- [ ] Workspace structure matches reality
- [ ] Links are valid
- [ ] Version numbers updated

---

**IMPORTANT**: Documentation should be updated alongside code changes, not as an afterthought.

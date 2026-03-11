---
description: Save verification state and progress checkpoint
agent: build
---

# Checkpoint Command

Save current verification state and create progress checkpoint: $ARGUMENTS

## Your Task

Create a snapshot of current progress including:

1. **Tests status** - Which tests pass/fail (Vitest + cargo test)
2. **Coverage** - Current coverage metrics
3. **Build status** - Build succeeds or errors (tsc + cargo check + clippy)
4. **Code changes** - Summary of modifications
5. **Next steps** - What remains to be done

## Checkpoint Format

### Checkpoint: [Timestamp]

**Tests**
- Vitest: X passing, Y failing
- Rust: X passing, Y failing
- Coverage: XX%

**Build**
- TypeScript: PASS / FAIL
- Cargo check: PASS / FAIL
- Cargo clippy: PASS / FAIL

**Changes Since Last Checkpoint**
```
git diff --stat [last-checkpoint-commit]
```

**Completed Tasks**
- [x] Task 1
- [x] Task 2
- [ ] Task 3 (in progress)

**Blocking Issues**
- [Issue description]

**Next Steps**
1. Step 1
2. Step 2

---

**TIP**: Create checkpoints at natural breakpoints: after each phase, before major refactoring, after fixing critical bugs.

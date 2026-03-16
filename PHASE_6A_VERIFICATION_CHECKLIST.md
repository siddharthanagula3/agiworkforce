# Phase 6a: Verification Checklist

**Date:** March 16, 2026
**Status:** READY FOR FIX APPLICATION
**Next Step:** Execute fixes (TypeScript Specialist + Test Engineer)

---

## Pre-Fix Status Summary

### Current Metrics (March 16, 2026)

- TypeScript Errors: **216** (Target: 0)
- Test Failures: **11** (Target: 0)
- Build Status: **BROKEN** (Target: Success)
- Unhandled Errors: **1** (Target: 0)
- Critical Issues: **8/8 unfixed** (Target: 0)

**Gate Decision:** 🔴 **NO-GO** — Cannot proceed to Phase 6b

---

## Post-Fix Verification Checklist

### After fixes are applied, validation specialist executes:

#### 1. TypeScript Compilation Check

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm typecheck
```

- [ ] Exit code: **0**
- [ ] No error output
- [ ] Duration: <60 seconds
- [ ] No "TS" error codes in output
- [ ] All imports resolve correctly

**Pass Criteria:** Exit code 0 with zero errors

---

#### 2. Test Suite Execution

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm test -- --run
```

- [ ] Test Files: **ALL PASS** (157/157 or similar)
- [ ] Total Tests: **ALL PASS** (3552+ passing)
- [ ] Unhandled Errors: **0**
- [ ] Exit code: **0**
- [ ] No red test failures in output
- [ ] Coverage: 80%+ (if applicable)

**Pass Criteria:** All tests passing, zero unhandled errors, exit code 0

---

#### 3. Build Verification

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm build
```

- [ ] Exit code: **0**
- [ ] Output directory created (`.next/` for Next.js)
- [ ] No TypeScript errors during build
- [ ] Build completes without warnings/errors
- [ ] Artifact size reasonable

**Pass Criteria:** Build succeeds, exit code 0, deployable artifact created

---

#### 4. Linting Check (Optional)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm lint
```

- [ ] No CRITICAL errors
- [ ] No MAJOR errors
- [ ] Warnings acceptable (can defer)
- [ ] Exit code: 0 (or 0 if warnings only)

**Pass Criteria:** No critical/major errors

---

### Regression Testing

#### Wave 1-5 Feature Verification

- [ ] Desktop chat interface loads
- [ ] Message composition works
- [ ] Tool execution displays
- [ ] Agent mode switching functions
- [ ] Model selection works
- [ ] Settings persist
- [ ] Offline indicators show
- [ ] Dark mode toggles
- [ ] Help tour displays
- [ ] Keyboard shortcuts active

**Pass Criteria:** All major features functional, no new bugs

---

## Critical Issues Verification

### Before Verification Can Begin

All 8 critical issues must be fixed. Verify in commit log:

```bash
git log --oneline | head -20
```

- [ ] CRIT-001 TypeScript fix commit(s) found
- [ ] CRIT-002 Export fix commit found
- [ ] CRIT-003 Mock types fix commit found
- [ ] CRIT-004 Session storage fix commit found
- [ ] CRIT-005 HelpTour test fix commit found
- [ ] CRIT-006 CSS error fix commit found
- [ ] CRIT-007 Unused imports fix (may be automated)
- [ ] CRIT-008 PerformanceUtils fix commit found

**Pass Criteria:** All 8 fixes visible in git log

---

## Gate Decision Matrix

### All of the Following Must Be TRUE:

| Item                           | Verified | Status |
| ------------------------------ | -------- | ------ |
| TypeScript compiles (0 errors) | [ ]      | -      |
| All tests pass (100% rate)     | [ ]      | -      |
| Build succeeds                 | [ ]      | -      |
| No unhandled errors            | [ ]      | -      |
| No new regressions             | [ ]      | -      |
| All 8 CRITICAL issues fixed    | [ ]      | -      |

### Result Determination:

If all items checked:

- ✅ **PASS** → Proceed to Phase 6b immediately
- Document in PHASE_6A_VERIFICATION_RESULTS.md

If any item unchecked:

- ❌ **FAIL** → Additional fixes required
- Document issues in blockers list
- Create new tasks for remaining fixes

---

## Verification Execution Steps

### Step 1: Prepare (5 minutes)

```bash
# Verify at correct directory
cd /Users/siddhartha/Desktop/agiworkforce
pwd
# Should show: /Users/siddhartha/Desktop/agiworkforce

# Check git status
git status
# Should show no uncommitted changes (all fixes committed)

# Clean build
cd apps/web
rm -rf node_modules/.vite .next dist
```

### Step 2: TypeScript Compilation (10 minutes)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm typecheck 2>&1 | tee typecheck-results.txt

# Check exit code
echo "Exit code: $?"
# Expected: 0

# Count errors
grep -c "error TS" typecheck-results.txt
# Expected: 0
```

### Step 3: Test Execution (120-150 minutes)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm test -- --run 2>&1 | tee test-results.txt

# Check for failures
grep "FAIL" test-results.txt | wc -l
# Expected: 0

# Check for unhandled errors
grep "Unhandled Error" test-results.txt
# Expected: no output

# Check exit code
echo "Exit code: $?"
# Expected: 0
```

### Step 4: Build Verification (30-60 minutes)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm build 2>&1 | tee build-results.txt

# Check exit code
echo "Exit code: $?"
# Expected: 0

# Verify output directory
ls -la .next/ 2>/dev/null || ls -la dist/ 2>/dev/null
# Expected: directory exists with files
```

### Step 5: Lint Check (10 minutes)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/web
pnpm lint 2>&1 | tee lint-results.txt

# Check for critical errors
grep "error:" lint-results.txt | wc -l
# Expected: 0
```

### Step 6: Documentation (15 minutes)

```bash
# Create verification results document
# Update PHASE_6A_VERIFICATION_RESULTS.md with:
# - All test results
# - Exit codes
# - Pass/fail determination
# - Gate decision
# - Signature and timestamp
```

---

## Success Criteria Matrix

### MUST ALL BE TRUE for Phase 6b Approval

| Criterion   | Command              | Expected Result      | Status |
| ----------- | -------------------- | -------------------- | ------ |
| TypeScript  | `pnpm typecheck`     | Exit code 0          | [ ]    |
| Tests       | `pnpm test -- --run` | Exit code 0          | [ ]    |
| Build       | `pnpm build`         | Exit code 0          | [ ]    |
| Artifact    | Verify .next/ exists | Directory with files | [ ]    |
| Regressions | Feature check        | All work             | [ ]    |
| No errors   | Review output        | Zero errors          | [ ]    |

**Phase 6b Gate Decision:**

- ✅ All checked → **PASS: Proceed to Phase 6b**
- ❌ Any unchecked → **FAIL: Requires additional fixes**

---

## Issue Resolution Escalation

If verification fails, follow this path:

### First Failure (1 issue)

1. Document the failure
2. Create task for fix
3. Assign to appropriate specialist
4. Re-run verification after fix

### Multiple Failures (2+ issues)

1. Document all failures
2. Categorize by owner (TypeScript vs Test)
3. Create parallel fix tasks
4. Schedule re-verification in 4 hours

### Critical Blocker (TypeScript/Build)

1. Escalate immediately to team lead
2. Prioritize above all other work
3. Re-run verification every 30 minutes
4. Target resolution within 2 hours

### New Regressions (Waves 1-5 broken)

1. Document regression details
2. Create task to fix regression
3. Do NOT proceed to Phase 6b
4. Re-verify after regression fix

---

## Documentation Links

- **Full Verification Plan:** `docs/PHASE_6A_CRITICAL_FIXES_VERIFICATION.md`
- **Quick Fix Guide:** `docs/PHASE_6A_QUICK_FIX_GUIDE.md`
- **Issue Catalog:** `docs/PHASE_6A_ISSUES_BY_SEVERITY.md`
- **Gate Assessment:** `docs/PHASE_6A_READINESS_GATE.md`
- **Verification Status:** `PHASE_6A_VERIFICATION_STATUS.txt` (this document)

---

## Sign-Off Requirements

After verification completes, validation specialist must:

1. ✅ Complete all verification steps
2. ✅ Document all results (pass/fail per step)
3. ✅ Make gate decision (pass or fail)
4. ✅ Create PHASE_6A_VERIFICATION_RESULTS.md
5. ✅ Notify team of decision

---

## Timeline

**Fixes Applied:** March 17, 2026 (Day 1)
**Verification Runs:** March 17, 2026 afternoon (4-5 hours post-fixes)
**Gate Decision:** March 17, 2026 evening or March 18, 2026 morning
**Phase 6b Start:** March 18-19, 2026 (if gate passes)

---

## Emergency Contacts

**TypeScript Issues:** TypeScript Specialist
**Test Issues:** Test Engineer
**Build Issues:** Build Engineer
**Gate Decision:** Validation Specialist

---

**Checklist Created:** March 16, 2026
**Ready for Use:** After fix commits
**Expected Completion:** March 17-18, 2026

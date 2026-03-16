# Phase 6a: Quick Fix Guide

## Critical Issues - Fast Resolution Path

**Updated:** March 16, 2026
**Purpose:** Get TypeScript and tests passing in 8-12 hours
**Owner:** TypeScript Specialist + Test Engineer

---

## The 8 CRITICAL Issues (In Fix Order)

### CRIT-001: TypeScript Compilation (4-6 hours)

**Command:** `cd apps/web && pnpm typecheck`

**Top Issues to Fix:**

#### 1. sessionStorage.ts (7 errors)

**File:** `apps/web/lib/session/sessionStorage.ts`

**Error Pattern:**

```
Expected 2 arguments, but got 1
```

**Lines Affected:** 169, 228, 263, 287, 311, 342

**Fix:** Review function signatures and add missing arguments

```typescript
// Review these function calls - they're missing an argument
setState(key, value); // ← What's the 2nd parameter?
```

**Time:** 1 hour

---

#### 2. performanceUtils.ts (4 errors)

**File:** `apps/web/lib/performanceUtils.ts`

**Error Pattern:**

```
Property 'renderTime' does not exist on type 'PerformanceEntry'
```

**Lines:** 177, 213

**Fix:** Add type guards before accessing custom properties

```typescript
// WRONG:
const renderTime = lastEntry.renderTime;

// RIGHT:
const renderTime = (lastEntry as any)?.renderTime;
```

**Time:** 0.5 hours

---

#### 3. Dark Mode Tests (3 errors)

**File:** `apps/web/__tests__/dark-mode.test.ts`

**Error Pattern:**

```
is possibly 'undefined'
```

**Lines:** 95

**Fix:** Add null checks before destructuring

```typescript
// WRONG:
const { r: rs, g: gs, b: bs } = result;

// RIGHT:
const { r: rs = 0, g: gs = 0, b: bs = 0 } = result || {};
```

**Time:** 0.5 hours

---

#### 4. Test Files - Unused Imports (20 errors)

**Files:** Multiple test files
**Error Pattern:** `'X' is declared but its value is never read`

**Quick Fix:** ESLint auto-fix

```bash
cd apps/web
npx eslint --fix components/UnifiedAgenticChat/__tests__/
npx eslint --fix lib/session/__tests__/
npx eslint --fix services/__tests__/
```

**Time:** 0.5 hours (automated)

---

#### 5. Mock Type Mismatches (50+ errors)

**Files:** `KeyboardShortcutsDialog.test.tsx`, `AdminToolsPanel.test.tsx`, etc.

**Error Pattern:**

```
Type 'Mock<Procedure>' is not assignable to type '() => void'
```

**Fix:** Use proper vitest type signature

```typescript
// WRONG:
const onClose = vi.fn()

// RIGHT:
const onClose = vi.fn<[], void>(())
```

**Files to Fix:**

- `components/UnifiedAgenticChat/__tests__/KeyboardShortcutsDialog.test.tsx` (16 occurrences)
- `components/UnifiedAgenticChat/__tests__/AdminToolsPanel.test.tsx` (1 occurrence)
- `services/__tests__/api-error-handler.test.ts` (1 occurrence)

**Time:** 1 hour

---

#### 6. Session Storage Tests (10 errors)

**File:** `apps/web/lib/session/__tests__/sessionStorage.test.ts`

**Error Pattern:** `Object is possibly 'undefined'`

**Fix:** Add null checks in assertions

```typescript
// WRONG:
expect(stored.key).toBe(value);

// RIGHT:
expect(stored?.key).toBe(value);
```

**Time:** 1 hour

---

### CRIT-002: Missing Export (0.5 hours)

**File:** `apps/web/lib/offline/offlineSync.ts`

**Issue:**

```
Module declares 'SyncManagerState' locally, but it is not exported
```

**Fix:**

```typescript
// Add to offlineSync.ts exports
export type SyncManagerState = /* ... */;
```

**Verification:**

```bash
cd apps/web
npx tsc --noEmit | grep "SyncManagerState"
# Should be gone
```

**Time:** 0.5 hours

---

### CRIT-003: Unhandled Error in Tests (1-2 hours)

**Source:** `MessageBubbleSkeleton.test.tsx`

**Error:**

```
TypeError: Cannot read properties of undefined (reading 'split')
at parse (cssstyle/lib/properties.js:211:17)
```

**Root Cause:** Motion-dom rendering undefined CSS value

**Fix Option 1: Mock Motion-dom in Tests**

```typescript
// vitest.config.ts or test setup
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: any) => children,
  },
}));
```

**Fix Option 2: Add CSS Value Guard**

```typescript
// In MessageBubbleSkeleton.tsx
// Ensure willChange is never undefined
style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
```

**Verification:**

```bash
cd apps/web
pnpm test --run 2>&1 | grep -i "unhandled"
# Should show no unhandled errors
```

**Time:** 1-2 hours

---

### CRIT-004+008: Test Type Errors (1-2 hours)

#### KeyboardShortcutsDialog.test.tsx (16 type errors)

**File:** `apps/web/components/UnifiedAgenticChat/__tests__/KeyboardShortcutsDialog.test.tsx`

**Pattern:** Mock type mismatch in 16 test assertions

**Fix:** Change all mock signatures

```typescript
// BEFORE: Lines 54, 60, 65, 70, 79, 89, 96, 107, 118, 128, 140, 151, 157
const onClose = vi.fn();
const onOpen = vi.fn();

// AFTER:
const onClose = vi.fn<[], void>(() => {});
const onOpen = vi.fn<[], void>(() => {});
```

**Time:** 0.5 hours

---

#### AdminToolsPanel.test.tsx (1 type error)

**File:** `apps/web/components/UnifiedAgenticChat/__tests__/AdminToolsPanel.test.tsx`

**Error:** Line 184 - `HTMLElement | undefined` not assignable to `Element`

**Fix:**

```typescript
// BEFORE:
const element = screen.getByTestId('...');
userEvent.click(element);

// AFTER:
const element = screen.getByTestId('...');
if (element) {
  userEvent.click(element);
}
```

**Time:** 0.5 hours

---

### CRIT-005: Test Failures (2-3 hours)

#### HelpTour.test.tsx - Skip Button (Line 379)

**Error:** "Found multiple elements with role 'button'"

**Fix:** Use more specific selector

```typescript
// BEFORE:
const skipButton = screen.getByRole('button', { name: /skip/i });

// AFTER:
const skipButton = screen.getByRole('button', { name: /skip tour/i });
// OR
const skipButton = screen.getByTestId('help-tour-skip');
```

**Time:** 0.5 hours

---

#### useHelpTour.test.ts - Previous Step (Line 139)

**Error:** "expected +0 to be -1"

**Root Cause:** Navigation not respecting boundary when at first step

**Fix:** Add boundary check in hook

```typescript
// In useHelpTour.ts:
const goToPreviousStep = useCallback(() => {
  setCurrentStep((prev) => Math.max(0, prev - 1)); // ← Add Math.max
}, []);
```

**Time:** 0.5 hours

---

#### sessionStorage.test.ts - Multiple Failures

**File:** `apps/web/lib/session/__tests__/sessionStorage.test.ts`

**Pattern:** Test assertions on possibly undefined objects

**Fix:** Add null checks

```typescript
// BEFORE:
expect(stored.messages.length).toBe(1);

// AFTER:
expect(stored?.messages?.length).toBe(1);
```

**Time:** 0.5 hours

---

## Summary Checklist

### Day 1 (4-6 hours) - TypeScript Fixes

- [ ] Fix sessionStorage.ts (7 errors) — 1 hour
- [ ] Fix performanceUtils.ts (4 errors) — 0.5 hours
- [ ] Fix dark-mode.test.ts (3 errors) — 0.5 hours
- [ ] Auto-fix unused imports (20+ errors) — 0.5 hours (automated)
- [ ] Fix mock type mismatches (50+ errors) — 1 hour
- [ ] Fix session tests (10+ errors) — 1 hour
- [ ] Export SyncManagerState — 0.5 hours

**Verification:**

```bash
cd apps/web
pnpm typecheck
# Expected: 0 errors
```

### Day 2 (6-8 hours) - Tests & Runtime

- [ ] Fix motion-dom unhandled error — 1-2 hours
- [ ] Fix KeyboardShortcutsDialog tests (16 errors) — 0.5 hours
- [ ] Fix AdminToolsPanel test (1 error) — 0.5 hours
- [ ] Fix HelpTour skip button — 0.5 hours
- [ ] Fix useHelpTour navigation — 0.5 hours
- [ ] Fix sessionStorage test assertions — 0.5 hours

**Verification:**

```bash
cd apps/web
pnpm test --run
# Expected: All tests pass, 0 unhandled errors
pnpm build
# Expected: Build succeeds
```

---

## Fast-Track Workflow

### If You Have 4 Hours (Minimum)

1. Fix sessionStorage.ts (1 hour)
2. Auto-fix unused imports (0.5 hours)
3. Fix mock types (1 hour)
4. Export SyncManagerState (0.5 hours)
5. Test and verify (1 hour)

**Result:** TypeScript compiles, but tests still fail

### If You Have 8 Hours (Recommended)

1. All TypeScript fixes (4-6 hours)
2. Fix test failures (2-3 hours)
3. Verify both pass (0.5 hours)

**Result:** Both TypeScript and tests pass

### If You Have 12 Hours (Optimal)

1. All TypeScript fixes (4-6 hours)
2. All test fixes (2-3 hours)
3. Fix runtime error (1-2 hours)
4. Full verification (1 hour)
5. Document issues (1 hour)

**Result:** Clean codebase ready for Phase 6b

---

## Verification Commands

```bash
# Complete verification
cd /Users/siddhartha/Desktop/agiworkforce/apps/web

# 1. TypeScript check
echo "=== TypeScript Check ==="
pnpm typecheck
# Expected: exit code 0, 0 errors

# 2. Test run
echo "=== Test Run ==="
pnpm test --run
# Expected: All tests pass, no unhandled errors

# 3. Build check
echo "=== Build Check ==="
pnpm build
# Expected: Build succeeds
```

---

## Estimated Timeline

| Phase            | Time         | Owner         | Verification             |
| ---------------- | ------------ | ------------- | ------------------------ |
| TypeScript Fixes | 4-6 hrs      | TS Specialist | `pnpm typecheck` = 0     |
| Test Fixes       | 2-3 hrs      | Test Engineer | `pnpm test --run` = pass |
| Runtime Fix      | 1-2 hrs      | Test Engineer | No unhandled errors      |
| **Total**        | **8-12 hrs** | Both          | **All gates pass**       |

**Start:** Immediately
**Target Completion:** Tomorrow EOD
**Phase 6b Start:** Day after next
**Success Criteria:** All commands execute cleanly with 0 errors

---

## Need Help?

**For TypeScript Issues:**

- Run: `pnpm typecheck 2>&1 | head -50`
- Check: PHASE_6A_ISSUES_BY_SEVERITY.md (CRIT-001-007)

**For Test Issues:**

- Run: `pnpm test --run 2>&1 | grep FAIL`
- Check: PHASE_6A_ISSUES_BY_SEVERITY.md (CRIT-002, CRIT-005)

**For Build Issues:**

- Run: `pnpm build 2>&1 | tail -50`
- Check: Both TypeScript and tests must pass first

---

**Let's fix this! 🚀**

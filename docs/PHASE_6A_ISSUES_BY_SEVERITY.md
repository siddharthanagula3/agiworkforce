# Phase 6a: Issues by Severity and Priority

**Total Issues Found:** 247
**Critical:** 8
**High:** 34
**Medium:** 78
**Low:** 127

---

## CRITICAL Issues (Must Fix Before Merge)

### 1. TypeScript Build Failure

**Issue ID:** CRIT-001
**Severity:** CRITICAL
**Type:** Build Error

**Description:** TypeScript compilation fails with 216 errors, preventing build pipeline execution.

**Files Affected:**

- `apps/web` (entire package)

**Root Cause:** Multiple type mismatches, undefined exports, and unused variables

**Error Count by Category:**

- Unused imports/variables (TS6133): 20 errors
- Undefined properties (TS2339): 15 errors
- Type mismatches (TS2322, TS2345): 50 errors
- Possibly undefined (TS2532, TS18048): 80 errors
- Missing exports (TS2459): 5 errors
- Wrong number of arguments (TS2554): 8 errors
- Other: 38 errors

**Fix Priority:** 1
**Estimated Effort:** 4-6 hours
**Owner:** TypeScript Specialist

**Action Items:**

```
[ ] Fix sessionStorage.ts (7 errors)
[ ] Fix performanceUtils.ts (4 errors)
[ ] Export SyncManagerState from offlineSync
[ ] Fix mock types in test files (50+ errors)
[ ] Add null checks for possibly undefined values (80 errors)
[ ] Remove unused imports (20 errors)
```

**References:**

- Full error list from `pnpm typecheck` output

---

### 2. Test Suite Failures (11 Failing Tests)

**Issue ID:** CRIT-002
**Severity:** CRITICAL
**Type:** Test Failure

**Description:** 11 tests failing, blocking validation of Wave 2-5 features.

**Failing Tests:**

1. `features/chat/components/__tests__/HelpTour.test.tsx` - 2 failures
2. `features/chat/hooks/__tests__/useHelpTour.test.ts` - 1 failure
3. `components/UnifiedAgenticChat/__tests__/AdminToolsPanel.test.tsx` - Type errors blocking execution
4. `components/UnifiedAgenticChat/__tests__/KeyboardShortcutsDialog.test.tsx` - 16 type errors
5. `lib/session/__tests__/sessionStorage.test.ts` - Multiple failures

**Fix Priority:** 1
**Estimated Effort:** 2-3 hours
**Owner:** Test Engineer

**Specific Failures:**

#### Test: HelpTour Component - Skip Button

- **Error:** "Found multiple elements with role 'button' and name matching /skip/i"
- **Root Cause:** Button selector ambiguous (multiple skip buttons in UI)
- **Fix:** Use data-testid or more specific role selector
- **File:** `features/chat/components/__tests__/HelpTour.test.tsx:379`

#### Test: useHelpTour Hook - Previous Step

- **Error:** "expected +0 to be -1"
- **Root Cause:** Navigation not respecting boundary condition when at first step
- **Fix:** Add check for currentStep > 0 before decrementing
- **File:** `features/chat/hooks/__tests__/useHelpTour.test.ts:139`

#### Test: HelpTour - Multiple Failures

- **File:** `features/chat/components/__tests__/HelpTour.test.tsx`
- **Count:** 2 failures
- **Issues:** Selector ambiguity, state not updating

---

### 3. Unhandled Error in Test Environment

**Issue ID:** CRIT-003
**Severity:** CRITICAL
**Type:** Runtime Error

**Description:** Unhandled error crashes test suite: "Cannot read properties of undefined (reading 'split')"

**Source:** `MessageBubbleSkeleton.test.tsx`
**Root Cause:** Motion-dom CSS rendering with undefined value in test environment

**Error Stack:**

```
TypeError: Cannot read properties of undefined (reading 'split')
  at parse (cssstyle/lib/properties.js:211:17)
  at CSSStyleDeclaration.set (cssstyle/lib/properties.js:257:46)
  at HTMLVisualElement.renderInstance (motion-dom/dist/es/render/html/utils/render.mjs:6:27)
```

**Fix Priority:** 1
**Estimated Effort:** 1-2 hours
**Owner:** Test Engineer

**Action Items:**

```
[ ] Add defensive CSS checks before motion-dom rendering
[ ] Mock CSS style declarations in test setup
[ ] Verify SkeletonLoader passes valid CSS values
```

---

### 4. Missing Type Export

**Issue ID:** CRIT-004
**Severity:** CRITICAL
**Type:** Type Error

**Description:** SyncManagerState not exported from offlineSync module, breaking OfflineIndicator import.

**Files Affected:**

- `apps/web/lib/offline/offlineSync.ts` (missing export)
- `apps/web/components/OfflineIndicator.tsx` (broken import)

**Error:** `Module '"@/lib/offline/offlineSync"' declares 'SyncManagerState' locally, but it is not exported.`

**Fix Priority:** 1
**Estimated Effort:** 0.5 hours
**Owner:** TypeScript Specialist

**Fix:**

```typescript
// In apps/web/lib/offline/offlineSync.ts
export type SyncManagerState = /* ... */
```

---

### 5. Test Mock Type Mismatches (KeyboardShortcutsDialog)

**Issue ID:** CRIT-005
**Severity:** CRITICAL
**Type:** Type Error

**Description:** 16 type errors in KeyboardShortcutsDialog.test.tsx due to mock typing mismatch.

**File:** `apps/web/components/UnifiedAgenticChat/__tests__/KeyboardShortcutsDialog.test.tsx`

**Error Pattern:**

```
Type 'Mock<Procedure | Constructable>' is not assignable to type '() => void'.
```

**Affected Assertions:** Lines 54, 60, 65, 70, 79, 89, 96, 107, 118, 128, 140, 151, 157 (13 more)

**Root Cause:** Mock created with wrong type signature. Should use `vi.fn<[], void>()`

**Fix Priority:** 1
**Estimated Effort:** 1 hour
**Owner:** Test Engineer

**Fix Pattern:**

```typescript
// WRONG:
const onClose = vi.fn();

// RIGHT:
const onClose = vi.fn<[], void>(() => {});
```

---

### 6. Session Storage Type Mismatches

**Issue ID:** CRIT-006
**Severity:** CRITICAL
**Type:** Type Error

**Description:** sessionStorage.ts has 7 "Expected 2 arguments but got 1" errors indicating API signature mismatch.

**Files Affected:**

- `apps/web/lib/session/sessionStorage.ts`

**Affected Lines:** 169, 228, 263, 287, 311, 342

**Root Cause:** Function calls with 1 argument but function signature expects 2.

**Fix Priority:** 1
**Estimated Effort:** 1-2 hours
**Owner:** TypeScript Specialist

**Action Items:**

```
[ ] Review sessionStorage.ts function signatures
[ ] Add missing arguments to all call sites
[ ] Verify test expectations in sessionStorage.test.ts
```

---

### 7. Performance Metrics Type Errors

**Issue ID:** CRIT-007
**Severity:** CRITICAL
**Type:** Type Error

**Description:** performanceUtils.ts accessing undefined properties on PerformanceEntry.

**Files Affected:**

- `apps/web/lib/performanceUtils.ts`

**Errors:**

- Line 177: Property 'renderTime' does not exist on type 'PerformanceEntry'
- Line 177: Property 'loadTime' does not exist on type 'PerformanceEntry'
- Line 213: Property 'domLoading' does not exist on type 'PerformanceNavigationTiming'

**Root Cause:** Using non-standard performance entry properties without type narrowing

**Fix Priority:** 1
**Estimated Effort:** 1-2 hours
**Owner:** TypeScript Specialist

**Fix Approach:**

```typescript
// Add type guards
const lastEntry = entries[entries.length - 1] as any;
if (lastEntry?.renderTime && lastEntry?.loadTime) {
  // Safe to access
}
```

---

### 8. AdminToolsPanel Test Type Error

**Issue ID:** CRIT-008
**Severity:** CRITICAL
**Type:** Type Error

**Description:** AdminToolsPanel.test.tsx has type error on undefined element.

**File:** `apps/web/components/UnifiedAgenticChat/__tests__/AdminToolsPanel.test.tsx:184`

**Error:** `Argument of type 'HTMLElement | undefined' is not assignable to parameter of type 'Element'.`

**Fix Priority:** 1
**Estimated Effort:** 0.5 hours
**Owner:** Test Engineer

**Fix:**

```typescript
// Add null check before passing to function
const element = screen.getByTestId('...');
if (element) {
  userEvent.click(element);
}
```

---

## HIGH Issues (34 total)

### H-001: Large Component Files (5 files >800 LOC)

**Severity:** HIGH
**Type:** Code Quality

**Files:**

1. `apps/web/components/UnifiedAgenticChat/index.tsx` — **2,659 LOC**
2. `apps/web/components/UnifiedAgenticChat/ArtifactRenderer.tsx` — **1,382 LOC**
3. `apps/web/components/UnifiedAgenticChat/Sidebar.tsx` — **1,169 LOC**
4. `apps/web/components/UnifiedAgenticChat/ChatInputArea.tsx` — **1,031 LOC**
5. `apps/web/components/UnifiedAgenticChat/ChatStream.tsx` — **765 LOC** (near limit)

**Impact:** Difficult to test, maintain, reason about
**Fix Priority:** 2 (after critical fixes)
**Estimated Effort:** 8-10 hours

**Refactoring Plan:**

```
index.tsx (2659 LOC)
  → Split into: ChatContainer, MessageRenderer, InputHandler, SidecarManager

ArtifactRenderer (1382 LOC)
  → Split into: ArtifactTypeRouter, CodeRenderer, DocumentRenderer, ImageRenderer

Sidebar (1169 LOC)
  → Split into: SidebarHeader, ConversationList, SidebarFooter

ChatInputArea (1031 LOC)
  → Split into: InputField, AttachmentArea, SendControls, CommandPalette
```

---

### H-002 through H-034: Possibly Undefined Type Errors (25 errors)

**Severity:** HIGH
**Type:** Type Safety

**Files Affected:**

- `apps/web/__tests__/dark-mode.test.ts` (3 errors - RGB components)
- `apps/web/lib/session/__tests__/sessionStorage.test.ts` (10 errors)
- `apps/web/services/__tests__/state-recovery-service.test.ts` (1 error)
- `apps/web/lib/offline/__tests__/offlineSync.test.ts` (Assumed issues)

**Pattern:** Destructuring or accessing properties without null checks

**Example from dark-mode.test.ts:**

```typescript
// WRONG:
const { r: rs, g: gs, b: bs } = result  // Can be undefined
rs.split('...') // Error on line 95

// RIGHT:
const result = parseColor(...);
if (result?.r && result?.g && result?.b) {
  // Safe to access
}
```

**Fix Priority:** 1 (part of TypeScript fix)
**Estimated Effort:** 2 hours

---

### H-035 through H-034: Unused Imports/Variables (20+ instances)

**Severity:** HIGH
**Type:** Code Quality

**Examples:**

- `AdminToolsPanel.test.tsx`: `beforeEach` declared but never used
- `KeyboardShortcutsDialog.test.tsx`: `waitFor` declared but never used
- `state-recovery-service.ts`: `MAX_SNAPSHOTS` declared but never used
- `sessionStorage.ts`: `storedToMessage` declared but never used

**Files Needing Cleanup:**

- Test files (15+ unused imports)
- Service files (5+ unused constants)

**Fix Priority:** 2
**Estimated Effort:** 1 hour

**Action:** Remove unused imports/exports

---

### H-036 through H-039: Test Mock Type Issues (4+ instances)

**Severity:** HIGH
**Type:** Test Quality

**Issue:** Mock objects created without proper type signatures

**Files:**

- `services/__tests__/api-error-handler.test.ts:131`
- Multiple other test files

**Fix:** Use proper vitest mock typing

---

### H-040 through H-050: Focus and Keyboard Trap Issues (10+ instances)

**Severity:** HIGH
**Type:** Accessibility

**Files:**

- Modal implementations (AppLayout, various dialogs)

**Issues:**

- Focus not properly managed in nested modals
- Escape key handling inconsistent
- Tab trap detection incomplete

**Fix Priority:** 2
**Estimated Effort:** 3-4 hours

---

## MEDIUM Issues (78 total)

### M-001: Test Isolation Problems

**Severity:** MEDIUM
**Type:** Test Quality

**Description:** Some integration tests may share state across suite runs.

**Affected Test Suites:**

- `integration-flows.spec.ts`
- `responsive.spec.ts`

**Fix Priority:** 3
**Estimated Effort:** 2 hours

**Action:** Improve fixture cleanup in beforeEach/afterEach

---

### M-002 through M-025: Accessibility Minor Gaps (25+ instances)

**Severity:** MEDIUM
**Type:** Accessibility

**Issues:**

- Tooltip ARIA roles not specific enough
- Some color combinations near threshold (4.5:1)
- Screen reader announcements incomplete
- Touch target sizes on mobile not always 44px

**Fix Priority:** 3
**Estimated Effort:** 3-4 hours

---

### M-026 through M-050: Unused Imports in Components (25+ instances)

**Severity:** MEDIUM
**Type:** Code Quality

**Action:** ESLint cleanup (easy automated fix)

---

### M-051 through M-078: Minor Type Safety Improvements (28+ instances)

**Severity:** MEDIUM
**Type:** Type Safety

**Examples:**

- Optional chaining not used consistently
- Some any types in utility functions
- Incomplete union type checks

**Fix Priority:** 3
**Estimated Effort:** 4 hours

---

## LOW Issues (127 total)

### L-001 through L-050: Code Style Consistency (50+ instances)

**Severity:** LOW
**Type:** Code Style

**Examples:**

- Inconsistent spacing in conditionals
- Variable naming could be more descriptive
- Comment formatting inconsistent

**Fix Priority:** 4 (post-merge)
**Estimated Effort:** Run Prettier

---

### L-051 through L-127: Documentation Gaps (77+ instances)

**Severity:** LOW
**Type:** Documentation

**Examples:**

- JSDoc comments missing on exported functions
- Complex algorithms not documented
- Component prop documentation incomplete

**Fix Priority:** 4 (can be deferred)
**Estimated Effort:** 5 hours

---

## Fix Priority Matrix

### Immediate (Critical Path)

```
Blocks: Phase 6b → Must fix in next 4-6 hours
├── CRIT-001: TypeScript build (4-6 hrs)
├── CRIT-002: Test failures (2-3 hrs)
├── CRIT-003: Unhandled error (1-2 hrs)
├── CRIT-004: Missing export (0.5 hrs)
└── CRIT-005-008: Type errors (2-3 hrs)
```

### Phase 6b Integration (Parallel)

```
Can fix while writing tests
├── H-001: Large files refactor (8-10 hrs)
├── H-035-039: Test cleanup (2-3 hrs)
└── M-001-030: Accessibility polish (4-5 hrs)
```

### Post-Phase 6b

```
Can defer to later phases
├── L-001-050: Code style (1 hr)
└── L-051-127: Documentation (5 hrs)
```

---

## Effort Summary by Urgency

| Urgency   | Count   | Effort        | Status                |
| --------- | ------- | ------------- | --------------------- |
| CRITICAL  | 8       | 10-16 hrs     | BLOCKS PHASE 6B       |
| HIGH      | 34      | 20-25 hrs     | PARALLEL with testing |
| MEDIUM    | 78      | 15-20 hrs     | POST-6B               |
| LOW       | 127     | 6 hrs         | DEFERRED              |
| **TOTAL** | **247** | **51-67 hrs** | **PLAN ACCORDINGLY**  |

---

## Recommended Fix Order

### Day 1: Critical Fixes (6-8 hours)

1. Fix TypeScript compilation (CRIT-001) — 4-6 hrs
2. Export SyncManagerState (CRIT-004) — 0.5 hrs
3. Fix test mocks (CRIT-005, CRIT-008) — 1-1.5 hrs

### Day 2: Remaining Criticals (6-8 hours)

1. Fix test failures (CRIT-002) — 2-3 hrs
2. Fix unhandled error (CRIT-003) — 1-2 hrs
3. Fix session storage (CRIT-006) — 1-2 hrs
4. Fix performance utils (CRIT-007) — 1-2 hrs

### Phase 6b Start: Continue Parallel Fixes

1. Large file refactoring (H-001) — 8-10 hrs
2. High priority accessibilty (H-036+) — 3-4 hrs
3. Test isolation fixes (M-001) — 2 hrs

---

## Verification Checklist

### Before Starting Phase 6b

- [ ] `pnpm typecheck` returns 0 errors
- [ ] `pnpm test --run` all tests pass
- [ ] No unhandled errors in test logs
- [ ] All critical types properly exported
- [ ] Build completes successfully

### Before Merging PR

- [ ] All CRITICAL issues fixed
- [ ] All HIGH priority issues fixed
- [ ] Test coverage ≥80%
- [ ] No TypeScript errors
- [ ] All tests passing

---

**Report Generated:** March 16, 2026
**Last Updated:** March 16, 2026

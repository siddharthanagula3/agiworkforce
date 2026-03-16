# Accessibility & Test Quality Checklist

**Quick Reference Guide for AGI Workforce Desktop App**

---

## Before Running Tests

- [ ] Node 22+ installed: `node --version`
- [ ] pnpm 9.15.0+ installed: `pnpm --version`
- [ ] axe-playwright installed: `cd apps/desktop && pnpm add -D axe-playwright`
- [ ] Development server ready: `cd apps/desktop && pnpm dev`

---

## Running Tests

```bash
# Full suite
cd apps/desktop && pnpm test:e2e

# Accessibility only
pnpm exec playwright test e2e/accessibility-audit.spec.ts

# Stability only
pnpm exec playwright test e2e/test-stability-runner.spec.ts
```

---

## Expected Test Results

### Accessibility Tests Should Cover

#### Keyboard Navigation ✓

- [ ] Tab moves forward through interactive elements
- [ ] Shift+Tab moves backward
- [ ] Enter activates buttons
- [ ] Space activates buttons/checkboxes
- [ ] Escape closes modals/menus
- [ ] Arrow keys navigate lists/menus

#### Focus Management ✓

- [ ] Focus indicator visible on all interactive elements
- [ ] Focus order matches visual layout (top-to-bottom, left-to-right)
- [ ] Focus not trapped in subcomponents
- [ ] Modal focus returns to trigger after closing
- [ ] Focus persists during typing

#### ARIA Attributes ✓

- [ ] Icon buttons have aria-label
- [ ] Images have alt text
- [ ] Form inputs have labels
- [ ] Expandable sections have aria-expanded
- [ ] Live regions have aria-live
- [ ] Disabled controls have aria-disabled
- [ ] Dropdowns/menus have aria-haspopup

#### Color Contrast ✓

- [ ] Text has 4.5:1 contrast (normal)
- [ ] Large text has 3:1 contrast
- [ ] Graphics/UI have 3:1 contrast

#### Responsive ✓

- [ ] Layout works at 320px width
- [ ] No horizontal scrolling at mobile
- [ ] Buttons are 44x44 minimum

#### Screen Readers ✓

- [ ] Semantic HTML used (main, nav, aside)
- [ ] Heading hierarchy logical (h1 before h2)
- [ ] Lists use ul/ol/li elements

### Test Quality Tests Should Cover

#### Selector Stability ✓

- [ ] Selectors use data-testid or aria-label
- [ ] No index-dependent selectors (nth(3))
- [ ] No text-dependent selectors
- [ ] Element found consistently across runs

#### Timeout Appropriateness ✓

- [ ] Synchronous elements found < 1s
- [ ] API calls respond < 5s
- [ ] Navigation completes < 5s
- [ ] No timeouts too short (race conditions)

#### Test Isolation ✓

- [ ] Tests don't affect each other
- [ ] Storage cleared between tests
- [ ] Unique test data per run
- [ ] No shared state

#### Error Messages ✓

- [ ] Errors indicate what failed
- [ ] Errors show the selector/locator
- [ ] Errors suggest how to fix
- [ ] Screenshots captured on failure

#### Flakiness ✓

- [ ] Critical tests pass all 3 runs
- [ ] Navigation works consistently
- [ ] Chat interface reliable
- [ ] No random timeouts

---

## WCAG 2.1 AA - Summary Checklist

### Perceivable

- [ ] Text alternatives for images (alt text or role="presentation")
- [ ] Color is not sole means of information
- [ ] Text contrast minimum 4.5:1 (or 3:1 for large text)
- [ ] Content reflows at 320px viewport
- [ ] Graphical elements have 3:1 contrast

### Operable

- [ ] All functionality available via keyboard (no mouse-only)
- [ ] No keyboard traps (focus can escape)
- [ ] Focus order is logical and meaningful
- [ ] Keyboard focus indicator always visible
- [ ] Touch targets minimum 44x44 pixels
- [ ] No single pointer path required

### Understandable

- [ ] Page language declared (html lang="en")
- [ ] No unexpected context changes on focus
- [ ] Form errors identified clearly
- [ ] Error suggestions provided
- [ ] Consistent navigation

### Robust

- [ ] Valid HTML (no duplicate IDs)
- [ ] Proper use of semantic elements
- [ ] All controls have accessible name, role, value
- [ ] Status messages announced to screen readers

---

## Common Issues to Check

### Missing aria-label

```
✓ PASS: <button aria-label="Close menu">×</button>
✗ FAIL: <button>×</button>
```

### Color Contrast

```
✓ PASS: Black text on white (21:1 ratio)
✗ FAIL: Light gray text on white (1.2:1 ratio)
```

### Keyboard Navigation

```
✓ PASS: Can navigate with Tab, activate with Enter
✗ FAIL: Can only click with mouse
```

### Focus Indicator

```
✓ PASS: Border or ring visible on focus
✗ FAIL: No visible change when focused
```

### Alt Text

```
✓ PASS: <img alt="AGI Workforce logo">
✗ FAIL: <img> (no alt attribute)
```

---

## Test Report Locations

After running tests, find reports here:

```
apps/desktop/
├── playwright-report/
│   ├── index.html           ← Open this in browser
│   ├── results.json
│   ├── junit.xml
│   └── test-results/        ← Screenshots/videos
└── (test output in terminal)
```

**View Report**:

```bash
cd apps/desktop && pnpm exec playwright show-report
```

---

## Fixing Issues

### If Tests Fail

1. **Review the error message** - What failed?
2. **Check the screenshot** - What did the page look like?
3. **Review the documentation** - What should it be?
4. **Apply the fix** - Update code, rerun test
5. **Verify passing** - Run test again

### Common Fixes

#### Missing aria-label on button

```typescript
// BEFORE
<button onClick={close}>×</button>

// AFTER
<button onClick={close} aria-label="Close">×</button>
```

#### Low contrast text

```typescript
// BEFORE
<p className="text-gray-300">Light text</p>

// AFTER
<p className="text-gray-700">Darker text</p>
```

#### Keyboard not working

```typescript
// BEFORE
<div onClick={handleClick}>Click me</div>

// AFTER
<button onClick={handleClick}>Click me</button>
```

#### No focus indicator

```typescript
// CSS
input:focus {
  outline: 2px solid blue;
  outline-offset: 2px;
}
```

---

## Release Checklist

Before releasing new version:

- [ ] All E2E tests pass
- [ ] No WCAG violations (critical/serious)
- [ ] No flaky tests (0 retries)
- [ ] Accessibility report reviewed
- [ ] Performance within targets
- [ ] Screenshots captured correctly
- [ ] Keyboard navigation tested manually
- [ ] Dark mode tested for contrast

---

## Documentation Files

| File                | Purpose                    | Location                             |
| ------------------- | -------------------------- | ------------------------------------ |
| Setup Guide         | Installation & quick start | `docs/ACCESSIBILITY_TEST_SETUP.md`   |
| Accessibility Audit | Detailed test coverage     | `docs/ACCESSIBILITY_VERIFICATION.md` |
| Test Quality Report | Metrics & standards        | `docs/E2E_TEST_QUALITY_REPORT.md`    |
| Summary             | Overview & quick ref       | `docs/TESTING_FRAMEWORK_SUMMARY.md`  |
| This File           | Checklist                  | `ACCESSIBILITY_CHECKLIST.md`         |

---

## Support Commands

```bash
# Quick test run
cd apps/desktop && pnpm test:e2e

# See browser (headed)
cd apps/desktop && pnpm test:e2e --headed

# Interactive UI
cd apps/desktop && pnpm test:e2e --ui

# Debug mode
cd apps/desktop && pnpm test:e2e --debug

# View reports
cd apps/desktop && pnpm exec playwright show-report

# Run specific test
cd apps/desktop && pnpm exec playwright test -g "should have no accessibility violations"

# Generate report
cd apps/desktop && pnpm exec playwright test --reporter=html
```

---

## Status Dashboard

| Category      | Status     | Tests       | Next Step              |
| ------------- | ---------- | ----------- | ---------------------- |
| Accessibility | ✓ Ready    | 30+         | Run tests              |
| Stability     | ✓ Ready    | 15+         | Run tests              |
| WCAG 2.1 AA   | ✓ Complete | 26 criteria | Verify compliance      |
| Documentation | ✓ Complete | 4 docs      | Read docs              |
| Setup         | ✓ Complete | -           | Install axe-playwright |

---

**Last Updated**: March 16, 2026
**Status**: Ready for Test Execution ✓
**Next Action**: `cd apps/desktop && pnpm add -D axe-playwright && pnpm test:e2e`

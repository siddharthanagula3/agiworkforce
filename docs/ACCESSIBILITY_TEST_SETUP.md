# Accessibility & E2E Test Quality - Setup Guide

**Created**: March 16, 2026
**Project**: AGI Workforce Desktop Application

---

## Overview

A comprehensive accessibility and test quality framework has been created for the AGI Workforce desktop application. This guide provides setup instructions and quick-start commands.

---

## Files Created

### Test Files

1. **`/apps/desktop/e2e/accessibility-audit.spec.ts`** (650+ lines)
   - WCAG 2.1 AA compliance testing via axe-core
   - Keyboard navigation validation
   - Focus management testing
   - ARIA attribute verification
   - Screen reader compatibility checks
   - 30+ test cases

2. **`/apps/desktop/e2e/test-stability-runner.spec.ts`** (500+ lines)
   - Test flakiness detection
   - Selector stability validation
   - Timeout appropriateness checks
   - Test isolation verification
   - Performance assertion framework
   - 15+ test cases

### Documentation Files

3. **`/docs/ACCESSIBILITY_VERIFICATION.md`** (600+ lines)
   - Comprehensive accessibility audit framework
   - WCAG 2.1 AA checklist (all 13 categories)
   - Test coverage details
   - Compliance summary
   - Implementation recommendations

4. **`/docs/E2E_TEST_QUALITY_REPORT.md`** (700+ lines)
   - Test quality metrics and standards
   - Flakiness detection framework
   - Selector stability guidelines
   - Performance benchmarks
   - CI/CD integration guidance

---

## Installation & Setup

### Step 1: Install Dependencies

```bash
cd /Users/siddhartha/Desktop/agiworkforce

# Install axe-core testing package (for accessibility scanning)
pnpm add -D axe-playwright

# If using package.json scripts, ensure playwright is installed
pnpm add -D @playwright/test
```

### Step 2: Update Playwright Configuration

The new test files are compatible with the existing `playwright.config.ts`. To enable them as separate projects, update `/apps/desktop/playwright.config.ts`:

```typescript
projects: [
  // ... existing projects ...

  {
    name: 'accessibility',
    testMatch: '**/accessibility-audit.spec.ts',
    use: { ...devices['Desktop Chrome'] },
    fullyParallel: true,  // Can run in parallel (independent tests)
  },

  {
    name: 'stability',
    testMatch: '**/test-stability-runner.spec.ts',
    use: { ...devices['Desktop Chrome'] },
    fullyParallel: false,  // Sequential for timing accuracy
  },
],
```

### Step 3: Update npm Scripts (Optional)

Add convenience scripts to `/apps/desktop/package.json`:

```json
{
  "scripts": {
    "test:accessibility": "playwright test --project=accessibility",
    "test:stability": "playwright test --project=stability",
    "test:a11y-only": "playwright test e2e/accessibility-audit.spec.ts",
    "test:quality": "playwright test e2e/test-stability-runner.spec.ts"
  }
}
```

---

## Running Tests

### Quick Start

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/desktop

# Run all E2E tests (including accessibility)
pnpm test:e2e

# Run only accessibility tests
pnpm test:accessibility

# Run only stability tests
pnpm test:stability

# Run with browser visible (headed mode)
pnpm test:e2e --headed

# Run with interactive UI
pnpm test:e2e --ui

# View HTML report
pnpm exec playwright show-report
```

### Detailed Commands

```bash
# Run specific test file
pnpm exec playwright test e2e/accessibility-audit.spec.ts

# Run specific test by name
pnpm exec playwright test -g "should have no accessibility violations"

# Run in debug mode (step through code)
pnpm exec playwright test --debug

# Run with trace recording (for debugging failures)
pnpm exec playwright test --trace on

# Generate detailed JSON report
pnpm exec playwright test --reporter=json > test-results.json

# Run tests serially (no parallelization)
pnpm exec playwright test --workers=1
```

---

## Test Structure Overview

### Accessibility Audit (`accessibility-audit.spec.ts`)

**8 Test Suites, 30+ Tests**:

1. **Automated Accessibility Scanning** (4 tests)
   - Uses axe-core for WCAG violations
   - Scans home, chat, settings pages
   - Detects critical/serious violations

2. **Keyboard Navigation** (7 tests)
   - Tab/Shift+Tab order
   - Enter/Space activation
   - Escape to close menus
   - Arrow keys in lists

3. **Focus Management** (6 tests)
   - Visible focus indicators
   - Focus order logic
   - Focus trap prevention
   - Modal focus return

4. **ARIA Attributes** (7 tests)
   - aria-label on icon buttons
   - alt text on images
   - aria-expanded on expandables
   - aria-live on dynamic content

5. **Color Contrast** (1 test)
   - 4.5:1 ratio for text
   - 3:1 ratio for graphics

6. **Responsive Design** (3 tests)
   - 320px width support
   - No horizontal scrolling
   - 44x44px minimum buttons

7. **Screen Reader Compatibility** (3 tests)
   - Semantic HTML
   - Heading hierarchy
   - List structures

8. **Error Handling** (2 tests)
   - Error message association
   - Success announcements

### Test Stability (`test-stability-runner.spec.ts`)

**6 Test Categories, 15+ Tests**:

1. **Selector Stability** (2 tests)
   - Non-brittle selector patterns
   - Avoid index-dependent selectors

2. **Timeout Appropriateness** (3 tests)
   - Not too fast, not hanging
   - Proper async handling
   - Network wait patterns

3. **Test Isolation** (2 tests)
   - State cleanup between tests
   - No data leakage

4. **Async/Await Correctness** (3 tests)
   - Proper promise handling
   - Network operation waits
   - Race condition prevention

5. **Error Messages** (1 test)
   - Useful debugging information

6. **Screenshot/Video Capture** (1 test)
   - Failure diagnostics

7. **Flakiness Detection** (3+ tests)
   - Critical test 3x repetition
   - Identify unreliable tests

---

## Expected Test Results

### Baseline (Before any app changes)

When you first run the tests, they will:

1. **Scan the Application** for accessibility issues
2. **Report Violations** found by axe-core
3. **Check Keyboard Navigation** on available components
4. **Verify Focus Management** patterns
5. **Validate ARIA Attributes** where present
6. **Run Stability Tests** to establish baseline

### Typical Output

```
Accessibility Audit - WCAG 2.1 AA Compliance
  ✓ Home view accessibility (auto scan)
  ✓ Keyboard navigation works
  ✓ Focus indicators visible
  ⚠️ Missing aria-labels on buttons (if found)
  ⚠️ Contrast issue in dark mode (if found)

Test Stability Analysis
  ✓ Chat message send - 3/3 runs pass
  ✓ Navigation - 3/3 runs pass
  ⚠️ Some selector timeouts (if infrastructure slow)
```

---

## WCAG 2.1 AA Compliance Reference

### Quick Checklist

**Perceivable (Level A/AA)**

- [ ] Non-text content has alt text
- [ ] Colors are not sole means of information
- [ ] Text contrast is 4.5:1 (normal) or 3:1 (large)
- [ ] No horizontal scrolling at 320px

**Operable (Level A/AA)**

- [ ] All functionality works with keyboard
- [ ] No keyboard traps (except modals)
- [ ] Focus order is logical
- [ ] Focus indicator always visible
- [ ] Touch targets are 44x44px minimum

**Understandable (Level A/AA)**

- [ ] Page language is declared
- [ ] No unexpected context changes on focus
- [ ] Form errors are identified and suggested
- [ ] Consistent navigation

**Robust (Level A/AA)**

- [ ] Valid HTML (no duplicate IDs)
- [ ] All controls have accessible name/role/value
- [ ] Status messages announced to screen readers

---

## Troubleshooting

### Tests Won't Run

**Problem**: "Cannot find module 'axe-playwright'"

**Solution**:

```bash
cd apps/desktop
pnpm add -D axe-playwright
pnpm install
```

### Tests Timeout

**Problem**: Tests taking too long or timing out

**Solutions**:

1. Ensure app is running: `cd apps/desktop && pnpm dev`
2. Check network connectivity
3. Increase timeout in config: `actionTimeout: 15000`
4. Run serially: `pnpm exec playwright test --workers=1`

### Playwright Can't Connect to App

**Problem**: "Connection refused" at localhost:5175

**Solution**:

```bash
# In one terminal
cd apps/desktop && pnpm dev

# In another terminal
cd apps/desktop && pnpm test:e2e
```

### Flaky Test

**Problem**: Test passes sometimes, fails others

**Analysis**:

1. Check async operations are properly awaited
2. Verify network requests are waited for
3. Increase timeout for operations
4. Look for race conditions in selectors

**Example Fix**:

```typescript
// BEFORE (flaky)
await button.click();
const text = await element.textContent();

// AFTER (stable)
await button.click();
await element.waitFor({ state: 'visible' });
const text = await element.textContent();
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: E2E & Accessibility Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: pnpm install

      - name: Build app
        run: pnpm build

      - name: Run E2E tests
        run: pnpm exec playwright test

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Next Steps

1. **Run Tests**

   ```bash
   cd apps/desktop && pnpm test:e2e
   ```

2. **Review Results**
   - Check `playwright-report/index.html`
   - Review accessibility violations
   - Note any test failures

3. **Fix Issues**
   - Address WCAG violations
   - Fix flaky tests
   - Update selectors if needed

4. **Integrate into CI/CD**
   - Add to GitHub Actions
   - Fail builds on critical violations
   - Generate reports per release

5. **Ongoing Monitoring**
   - Run tests before every release
   - Track accessibility trends
   - Update tests for new features

---

## Resources

### Testing Tools

- [Playwright Docs](https://playwright.dev)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [axe-core Documentation](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)

### Accessibility Standards

- [WCAG 2.1 Overview](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Resources](https://webaim.org/)
- [A11y Project](https://www.a11yproject.com/)

### Best Practices

- [Accessible Interactions](https://www.w3.org/WAI/test-evaluate/)
- [Keyboard Navigation](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

---

## Support

For issues or questions:

1. Check test reports: `playwright-report/index.html`
2. Review error messages in console
3. Run with `--debug` flag for step-by-step debugging
4. Check documentation in `/docs/ACCESSIBILITY_VERIFICATION.md`

---

**Setup Status**: ✓ Complete
**Next Action**: Run tests with `pnpm test:e2e`
**Questions**: See `E2E_TEST_QUALITY_REPORT.md` and `ACCESSIBILITY_VERIFICATION.md`

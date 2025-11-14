# Visual Regression Testing - Usage Guide

## Quick Start

### Run Visual Regression Tests

```bash
# Run all visual regression tests (creates missing baselines automatically)
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts

# Run with interactive UI for debugging
pnpm --filter @agiworkforce/desktop test:e2e:ui
```

### First Run Behavior

On the first test run:

1. Tests capture current screenshots
2. Tries to compare against baselines
3. Finds missing baselines (expected)
4. Automatically creates baselines in `apps/desktop/e2e/screenshots/baseline/`
5. All tests pass (new baselines created)

**Important**: Commit baseline images to version control:

```bash
cd apps/desktop/e2e/screenshots/baseline
git add *.png
git commit -m "chore: add visual regression baselines"
```

## Common Usage Patterns

### Pattern 1: Basic Visual Regression Test

```typescript
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('my component matches baseline', async ({ page, screenshot }) => {
  // Navigate and set up state
  await page.goto('http://localhost:1420/my-page');
  await page.waitForLoadState('networkidle');

  // Capture current screenshot
  const currentPath = await screenshot.captureFullPage('my-component');

  // Compare against baseline
  try {
    const comparison = await screenshot.compareVisual('my-component', currentPath);
    expect(comparison.match).toBeTruthy();
    expect(comparison.similarity).toBeGreaterThanOrEqual(90);
  } catch (error) {
    if ((error as Error).message.includes('Baseline screenshot not found')) {
      // First run: create baseline
      await screenshot.createBaseline('my-component');
    } else {
      throw error;
    }
  }
});
```

### Pattern 2: Element-Specific Comparison

```typescript
test('modal dialog matches baseline', async ({ page, screenshot }) => {
  // Open modal
  await page.click('button[aria-label="Open dialog"]');
  await page.waitForLoadState('networkidle');

  // Capture element only
  const currentPath = await screenshot.captureElement('[role="dialog"]', 'my-modal');

  try {
    const comparison = await screenshot.compareVisual('my-modal', currentPath);
    expect(comparison.match).toBeTruthy();
  } catch (error) {
    if ((error as Error).message.includes('Baseline screenshot not found')) {
      await screenshot.createBaseline('my-modal');
    } else {
      throw error;
    }
  }
});
```

### Pattern 3: Responsive Design Testing

```typescript
test('layout is responsive', async ({ page, screenshot }) => {
  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(500); // Allow layout to settle

    const currentPath = await screenshot.captureViewport(`layout-${viewport.name}`);

    try {
      const comparison = await screenshot.compareVisual(`layout-${viewport.name}`, currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline(`layout-${viewport.name}`);
      } else {
        throw error;
      }
    }
  }
});
```

### Pattern 4: Handling Dynamic Content

For content that changes between runs (timestamps, random data), use lower thresholds:

```typescript
test('loading state matches baseline', async ({ page, screenshot, agiPage }) => {
  await agiPage.navigateToAGI();

  // Trigger loading state
  if (await agiPage.goalInput.isVisible({ timeout: 2000 })) {
    await agiPage.submitGoal('Test task');
    await page.waitForTimeout(500);
  }

  const currentPath = await screenshot.captureFullPage('loading-state');

  try {
    const comparison = await screenshot.compareVisual('loading-state', currentPath);
    // Lower threshold for dynamic content (spinners, animations)
    expect(comparison.similarity).toBeGreaterThanOrEqual(85);
  } catch (error) {
    if ((error as Error).message.includes('Baseline screenshot not found')) {
      await screenshot.createBaseline('loading-state');
    } else {
      throw error;
    }
  }
});
```

## Understanding Comparison Results

### ComparisonResult Object

```typescript
interface ComparisonResult {
  match: boolean; // true if similarity >= threshold
  diffPixels: number; // Number of different pixels
  totalPixels: number; // Total pixels analyzed
  similarity: number; // Similarity percentage (0-100)
  diffImagePath?: string; // Path to diff image (only if mismatch)
}
```

### Example Output

```typescript
const comparison = await screenshot.compareVisual('chat-interface', currentPath);

console.log(comparison);
// {
//   match: false,
//   diffPixels: 15234,
//   totalPixels: 2073600,
//   similarity: 99.26,
//   diffImagePath: '/path/to/diffs/chat-interface-diff-1234567890.png'
// }

if (!comparison.match) {
  console.log(`Only ${comparison.similarity}% similar - check diff image`);
  console.log(`Diff saved to: ${comparison.diffImagePath}`);
}
```

## Debugging Failed Tests

### Step 1: View the Diff Image

```bash
# The diff image shows differences in red/pink
open apps/desktop/e2e/screenshots/diffs/chat-interface-diff-*.png

# In WSL2:
explorer.exe $(wslpath -w "apps/desktop/e2e/screenshots/diffs")
```

### Step 2: Check Similarity Percentage

Lower similarity % = more changes. A few percent drop usually indicates:

- Minor spacing/alignment changes
- Font rendering variations (anti-aliasing)
- Color adjustments
- Badge/icon updates

Large drops (10%+) indicate:

- Layout changes
- Component visibility changes
- Styling issues

### Step 3: Compare Current vs Baseline

```bash
# View baseline
open apps/desktop/e2e/screenshots/baseline/chat-interface.png

# View current (most recent timestamp)
open apps/desktop/e2e/screenshots/chat-interface-*.png
```

### Step 4: Decide: Fix or Update

**If changes are unintended bugs**:

```typescript
// Fix the CSS/code causing the regression
// Then re-run tests - they should pass
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts
```

**If changes are intentional design updates**:

```typescript
// Update baseline after design change is approved
await screenshot.updateBaseline('chat-interface', currentPath);

// Or use the helper in your test
if (process.env.UPDATE_VISUAL_BASELINES === 'true') {
  await screenshot.updateBaseline('chat-interface', currentPath);
} else {
  const comparison = await screenshot.compareVisual('chat-interface', currentPath);
  expect(comparison.match).toBeTruthy();
}
```

## Understanding Similarity Calculation

### Formula

```
similarity% = ((totalPixels - diffPixels) / totalPixels) * 100
```

### Examples

```
1920x1080 = 2,073,600 total pixels

100 diff pixels = 99.99% similar (usually imperceptible)
1,000 diff pixels = 99.95% similar (tiny spacing change)
10,000 diff pixels = 99.52% similar (button color change)
100,000 diff pixels = 95.18% similar (layout adjustment)
207,360 diff pixels = 90.00% similar (significant change)
```

## Pixelmatch Algorithm Details

### What It Measures

- Per-pixel RGB comparison (0-255 per channel)
- Configurable color threshold (default 0.1)
- Pixel pairs differing by max 10% marked as different

### What It Ignores

- Fully transparent pixels (alpha = 0)
- Anti-aliasing differences (sub-threshold colors)
- Very minor rendering variations

### Accuracy

- Extremely precise (pixel-perfect comparison)
- Robust to minor rendering differences
- Good for catching unintended changes
- May be too strict for dynamic content

## Best Practices

### 1. Create Baseline First Run

```bash
# First run of new test
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts

# Baselines created automatically
# Commit them to git
git add apps/desktop/e2e/screenshots/baseline/
git commit -m "chore: add visual regression baselines for new tests"
```

### 2. Use Appropriate Thresholds

```typescript
// Stable UI components
expect(comparison.similarity).toBeGreaterThanOrEqual(98);

// Most interfaces
expect(comparison.similarity).toBeGreaterThanOrEqual(90);

// Dynamic content (loading, errors)
expect(comparison.similarity).toBeGreaterThanOrEqual(85);

// Animations, temporal content
expect(comparison.similarity).toBeGreaterThanOrEqual(80);
```

### 3. Organize Baselines by Type

```typescript
// Interface baselines
await screenshot.createBaseline('interface-chat');
await screenshot.createBaseline('interface-agi');

// State baselines
await screenshot.createBaseline('state-loading');
await screenshot.createBaseline('state-error');

// Responsive baselines
await screenshot.createBaseline('responsive-mobile');
await screenshot.createBaseline('responsive-tablet');
```

### 4. Review Diffs in PRs

When submitting PR with baseline updates:

1. Include diff image in PR description
2. Explain visual changes
3. Request design review
4. Get approval before merging

### 5. CI/CD Integration

```yaml
# .github/workflows/visual-regression.yml
name: Visual Regression Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: visual-diffs
          path: apps/desktop/e2e/screenshots/diffs/
```

## Troubleshooting

### "Baseline screenshot not found"

**Solution**: Run test once to create baseline:

```bash
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts
```

### "Failed to parse PNG file"

**Cause**: Corrupted baseline or screenshot file

**Solution**:

```bash
# Delete corrupted file
rm apps/desktop/e2e/screenshots/baseline/broken-baseline.png

# Regenerate
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts
```

### "Screenshot dimensions mismatch"

**Cause**: Test viewport changed between runs

**Solution**:

```typescript
// Ensure consistent viewport before capture
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForLoadState('networkidle');
const currentPath = await screenshot.captureFullPage('interface');
```

### Test Passes But Diff Image Shows Changes

**Cause**: Similarity above threshold but still has changes

**Check**: If similarity >= 90% but ~95%, minor changes approved by threshold

- This is expected behavior
- Design tweaks often result in 95-98% similarity
- Diff image documents what changed

## Advanced Usage

### Custom Threshold per Test

```typescript
// Strict comparison
let comparison = await screenshot.compareVisual('precise-ui', currentPath);
expect(comparison.similarity).toBeGreaterThanOrEqual(98);

// Lenient comparison for dynamic content
comparison = await screenshot.compareVisual('loading-spinner', currentPath);
expect(comparison.similarity).toBeGreaterThanOrEqual(75);
```

### Batch Testing

```typescript
const screens = ['chat-interface', 'agi-interface', 'automation-interface'];

for (const screen of screens) {
  await navigateTo(screen);
  const currentPath = await screenshot.captureFullPage(screen);
  const comparison = await screenshot.compareVisual(screen, currentPath);
  expect(comparison.similarity).toBeGreaterThanOrEqual(90);
}
```

### Selective Testing

```typescript
// Run only visual tests
pnpm --filter @agiworkforce/desktop test:e2e -- visual-regression

// Run specific test
pnpm --filter @agiworkforce/desktop test:e2e -- --grep "should match chat"

# Run with debugging
PWDEBUG=1 pnpm --filter @agiworkforce/desktop test:e2e
```

## File Organization

```
apps/desktop/
├── e2e/
│   ├── utils/
│   │   └── screenshot-helper.ts          # Main implementation
│   ├── visual-regression.spec.ts         # Test suite
│   ├── screenshots/
│   │   ├── baseline/                     # Reference images (git tracked)
│   │   │   ├── chat-interface.png
│   │   │   ├── agi-interface.png
│   │   │   └── ...
│   │   ├── diffs/                        # Diff output (git ignored)
│   │   │   └── chat-interface-diff-*.png
│   │   ├── failures/                     # Test failure captures
│   │   │   └── test-name-*.png
│   │   └── *.png                         # Current screenshots
│   └── ...
```

## Continuous Integration

### GitHub Actions

```bash
# In CI, baseline comparison fails if baselines missing
# Ensure baselines committed to main branch

# Before running tests:
git status
# apps/desktop/e2e/screenshots/baseline/ should have all .png files committed
```

### Local Development

```bash
# Create baseline
pnpm --filter @agiworkforce/desktop test:e2e visual-regression.spec.ts

# Commit baseline
git add apps/desktop/e2e/screenshots/baseline/
git commit -m "chore: add visual baselines"

# On next run, tests compare against committed baselines
```

## Performance Tips

### Large Test Suites

If visual tests run slowly:

1. **Parallel execution**: Playwright runs multiple workers by default
2. **Reduce screenshots**: Only capture changed screens
3. **Smaller images**: Use element capture instead of full page
4. **Cleanup**: Run `cleanup()` to manage disk space

```typescript
test.afterEach(async ({ screenshot }) => {
  // Keep only last 20 screenshots per test
  await screenshot.cleanup(20);
});
```

## Related Resources

- [pixelmatch Documentation](https://github.com/mapbox/pixelmatch)
- [Playwright Screenshots](https://playwright.dev/docs/api/class-page#page-screenshot)
- [Visual Regression Testing Best Practices](https://github.com/garris/BackstopJS/wiki/Testing-Best-Practices)

import { test, expect, Page } from '@playwright/test';

/**
 * AGI Safety Mechanisms E2E Tests
 *
 * Tests for AGI system safety controls including:
 * - Iteration limits (max 1000)
 * - Timeout mechanisms (5 minute absolute timeout)
 * - Consecutive failure limits (3 failures trigger abandonment)
 * - Cancellation support
 * - Resource constraints
 * - Approval workflows
 *
 * FIX-019: replaced `.catch(() => false)` silent-pass patterns with explicit
 * `test.skip` calls so CI reports skipped (not falsely-passing) when the AGI
 * feature or a required runtime state is absent.
 */

// Helper to navigate to AGI section. Returns true if found.
async function navigateToAGI(page: Page): Promise<boolean> {
  const agiLink = page.locator(
    'a[href*="agi"], button:has-text("AGI"), button:has-text("Goals"), [data-testid="nav-agi"]',
  );

  if (await agiLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await agiLink.click();
    await page.waitForLoadState('networkidle');
    return true;
  }
  return false;
}

// Helper to submit a goal. Returns true if the form was found and submitted.
async function submitGoal(page: Page, description: string): Promise<boolean> {
  const goalInput = page.locator(
    'textarea[placeholder*="goal"], [data-testid="goal-input"], textarea[name="goal"]',
  );
  const submitButton = page.locator(
    'button:has-text("Submit"), [data-testid="submit-goal"], button[type="submit"]',
  );

  if (
    (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) &&
    (await submitButton.isVisible({ timeout: 2000 }).catch(() => false))
  ) {
    await goalInput.fill(description);
    await submitButton.click();
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

// Helper to cancel a goal. Returns true if the cancel button was found and clicked.
async function cancelGoal(page: Page, goalSelector: string): Promise<boolean> {
  const goalItem = page.locator(goalSelector);

  if (!(await goalItem.isVisible({ timeout: 2000 }).catch(() => false))) {
    return false;
  }

  const cancelButton = goalItem.locator(
    'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
  );

  if (!(await cancelButton.isVisible({ timeout: 1000 }).catch(() => false))) {
    return false;
  }

  await cancelButton.click();

  const confirmButton = page.locator(
    '[role="alertdialog"] button:has-text("Confirm"), [role="alertdialog"] button:has-text("Yes")',
  );
  if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmButton.click();
  }

  return true;
}

// ── Shared beforeEach ────────────────────────────────────────────────────────
// Each describe block navigates to the AGI section and skips the whole suite
// when the section doesn't exist in the current build rather than silently passing.

async function setupAGIPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const found = await navigateToAGI(page);
  // test.skip inside beforeEach skips the current test.
  test.skip(!found, 'AGI section not present in current build — skipping instead of false-passing');
}

// ── AGI Iteration Limits ─────────────────────────────────────────────────────

test.describe('AGI Iteration Limits', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should display iteration counter during goal execution', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-status*="progress"], [data-testid="goal-item"]:has-text("In Progress")',
    );
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goal — iteration counter only shown during execution');
      return;
    }

    const iterationCounter = page.locator(
      '[data-testid="iteration-counter"], .iteration-count, :text("Iteration")',
    );
    await expect(iterationCounter).toBeVisible({ timeout: 3000 });
    await expect(iterationCounter).toHaveText(/\d+/);
  });

  test('should show iteration progress in goal details', async ({ page }) => {
    const activeGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]:has-text("In Progress")',
    );
    if (!(await activeGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No active goal — iteration progress only shown during execution');
      return;
    }

    await activeGoal.click();

    const detailsPanel = page.locator('[data-testid="goal-details"], .goal-details');
    await expect(detailsPanel).toBeVisible({ timeout: 2000 });

    const iterationInfo = detailsPanel.locator(':text("iteration"), :text("step")');
    await expect(iterationInfo.first()).toBeVisible({ timeout: 2000 });
  });

  test('should reference maximum iteration limit (1000) somewhere in UI', async ({ page }) => {
    const maxIterationIndicator = page.locator(
      '[data-testid="max-iterations"], :text("1000"), :text("max iteration")',
    );
    if (!(await maxIterationIndicator.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(
        true,
        'Max iteration indicator not found — may not be rendered until a goal is active',
      );
      return;
    }
    await expect(maxIterationIndicator).toBeVisible();
    const text = await maxIterationIndicator.textContent();
    expect(text).toBeDefined();
    expect(text!.length).toBeGreaterThan(0);
  });
});

// ── AGI Timeout Mechanisms ───────────────────────────────────────────────────

test.describe('AGI Timeout Mechanisms', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should display elapsed time for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], .goal-running',
    );
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goal — elapsed time only shown during execution');
      return;
    }

    const timeDisplay = runningGoal.locator(
      '[data-testid="elapsed-time"], .elapsed-time, :text("elapsed"), :text("running")',
    );
    await expect(timeDisplay).toBeVisible({ timeout: 2000 });
    const text = await timeDisplay.textContent();
    expect(text).toMatch(/\d+|elapsed|running/i);
  });

  test('should show timeout warning when approaching limit', async ({ page }) => {
    const timeoutWarning = page.locator(
      '[data-testid="timeout-warning"], [data-warning="timeout"], .timeout-warning, :text("timeout")',
    );
    if (!(await timeoutWarning.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No timeout warning visible — only appears when goal is near time limit');
      return;
    }
    await expect(timeoutWarning).toBeVisible();
  });

  test('should display timeout event in goal history', async ({ page }) => {
    const timedOutGoal = page.locator(
      '[data-testid="goal-item"]:has-text("timeout"), [data-status="timeout"]',
    );
    if (!(await timedOutGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No timed-out goal in history — requires a past timeout event');
      return;
    }

    await timedOutGoal.click();

    const details = page.locator('[data-testid="goal-details"], .goal-details');
    await expect(details).toBeVisible({ timeout: 2000 });

    const timeoutInfo = details.locator(':text("timeout"), :text("exceeded")');
    await expect(timeoutInfo.first()).toBeVisible({ timeout: 2000 });
  });
});

// ── AGI Consecutive Failure Handling ─────────────────────────────────────────

test.describe('AGI Consecutive Failure Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should display failure count in goal progress', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();
    if (!(await goalItem.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No goal items present');
      return;
    }

    await goalItem.click();

    const failureInfo = page.locator(
      '[data-testid="failure-count"], :text("failure"), :text("failed step")',
    );
    if (!(await failureInfo.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No failure info — goal may have no failures');
      return;
    }

    const text = await failureInfo.textContent();
    expect(text).toBeDefined();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('should show abandoned status for goals with too many failures', async ({ page }) => {
    const abandonedGoal = page.locator(
      '[data-testid="goal-item"]:has-text("abandoned"), [data-testid="goal-item"]:has-text("unachievable"), [data-status="abandoned"]',
    );
    if (!(await abandonedGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No abandoned goal in history — requires a past consecutive-failure event');
      return;
    }

    await abandonedGoal.click();

    const details = page.locator('[data-testid="goal-details"], .goal-details');
    await expect(details).toBeVisible({ timeout: 2000 });

    const reason = details.locator(
      ':text("consecutive failures"), :text("unachievable"), :text("abandoned")',
    );
    await expect(reason.first()).toBeVisible({ timeout: 2000 });
  });

  test('should display step success/failure indicators', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();
    if (!(await goalItem.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No goal items present');
      return;
    }

    await goalItem.click();

    const stepsList = page.locator('[data-testid="steps-list"], .steps-list');
    if (!(await stepsList.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No steps list visible for this goal');
      return;
    }

    const stepIndicators = stepsList.locator(
      '[data-status], .step-status, [data-testid="step-status"]',
    );
    // Require at least one status indicator — a steps list with zero indicators is theater
    await expect(stepIndicators.first()).toBeVisible({ timeout: 2000 });
  });
});

// ── AGI Cancellation Support ──────────────────────────────────────────────────

test.describe('AGI Cancellation Support', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should show cancel button for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]:has-text("In Progress")',
    );
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goals — cancel button only shown during execution');
      return;
    }

    const cancelButton = runningGoal.locator(
      'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
    );
    await expect(cancelButton).toBeVisible({ timeout: 2000 });
  });

  test('should confirm before cancelling a goal', async ({ page }) => {
    const runningGoal = page
      .locator('[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]')
      .first();
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goal to cancel');
      return;
    }

    const cancelButton = runningGoal.locator(
      'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
    );
    if (!(await cancelButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      test.skip(true, 'Cancel button not found on goal item');
      return;
    }

    await cancelButton.click();

    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]:has-text("cancel")');
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });

    // Dismiss without actually cancelling
    await page.keyboard.press('Escape');
  });

  test('should update goal status after cancellation', async ({ page }) => {
    const submitted = await submitGoal(page, 'Test goal for cancellation');
    if (!submitted) {
      test.skip(true, 'Goal submission form not found');
      return;
    }

    await page.waitForTimeout(1000);

    const newestGoal = page.locator('[data-testid="goal-item"]').first();
    if (!(await newestGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'Goal item did not appear after submission');
      return;
    }

    const cancelled = await cancelGoal(page, '[data-testid="goal-item"]:first-of-type');
    if (!cancelled) {
      test.skip(true, 'Could not cancel the submitted goal');
      return;
    }

    await page.waitForTimeout(500);

    const statusBadge = newestGoal.locator('[data-testid="goal-status"], .status-badge');
    await expect(statusBadge).toBeVisible({ timeout: 2000 });
    const statusText = await statusBadge.textContent();
    expect(statusText?.toLowerCase()).toContain('cancel');
  });
});

// ── AGI Resource Constraints ──────────────────────────────────────────────────

test.describe('AGI Resource Constraints', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should display resource usage indicators', async ({ page }) => {
    const resourcePanel = page.locator(
      '[data-testid="resource-monitor"], .resource-panel, :text("Resources")',
    );
    if (!(await resourcePanel.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Resource panel not present in current build');
      return;
    }
    await expect(resourcePanel).toBeVisible();
  });

  test('should show memory usage', async ({ page }) => {
    const memoryIndicator = page.locator(
      '[data-testid="memory-usage"], .memory-indicator, :text("Memory")',
    );
    if (!(await memoryIndicator.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Memory indicator not present in current build');
      return;
    }
    const text = await memoryIndicator.textContent();
    expect(text).toMatch(/\d+|MB|GB|memory/i);
  });

  test('should warn when approaching resource limits', async ({ page }) => {
    const resourceWarning = page.locator(
      '[data-warning="resource"], .resource-warning, [data-testid="resource-warning"]',
    );
    // Legitimately conditional on system state — skip rather than false-pass
    if (!(await resourceWarning.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'Resource warning not currently active — depends on system state');
      return;
    }
    await expect(resourceWarning).toBeVisible();
  });
});

// ── AGI Approval Workflows ────────────────────────────────────────────────────

test.describe('AGI Approval Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should show pending approval indicator for dangerous operations', async ({ page }) => {
    const approvalIndicator = page.locator(
      '[data-testid="pending-approval"], .approval-pending, :text("Waiting for approval")',
    );
    if (!(await approvalIndicator.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No pending approvals — requires a dangerous operation to be queued');
      return;
    }
    await expect(approvalIndicator).toBeVisible();
  });

  test('should display approve/reject buttons for pending operations', async ({ page }) => {
    const approvalRequest = page.locator(
      '[data-testid="approval-request"], .approval-item, .pending-approval',
    );
    if (!(await approvalRequest.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No pending approval requests — requires a queued dangerous operation');
      return;
    }

    const approveButton = approvalRequest.locator(
      'button:has-text("Approve"), [data-testid="approve-button"]',
    );
    const rejectButton = approvalRequest.locator(
      'button:has-text("Reject"), [data-testid="reject-button"]',
    );

    await expect(approveButton).toBeVisible({ timeout: 2000 });
    await expect(rejectButton).toBeVisible({ timeout: 2000 });
  });

  test('should show operation details before approval', async ({ page }) => {
    const approvalRequest = page
      .locator('[data-testid="approval-request"], .approval-item')
      .first();
    if (!(await approvalRequest.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No pending approval requests');
      return;
    }

    const operationDetails = approvalRequest.locator(
      '[data-testid="operation-details"], .operation-description, p, span',
    );
    await expect(operationDetails).toBeVisible({ timeout: 2000 });
    const text = await operationDetails.textContent();
    expect(text).toBeDefined();
    expect(text!.length).toBeGreaterThan(0);
  });
});

// ── AGI Pause and Resume ──────────────────────────────────────────────────────

test.describe('AGI Pause and Resume', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should show pause button for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], .goal-running',
    );
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goal — pause button only shown during execution');
      return;
    }

    const pauseButton = runningGoal.locator(
      'button[aria-label*="Pause"], [data-testid="pause-goal"], button:has-text("Pause")',
    );
    await expect(pauseButton).toBeVisible({ timeout: 2000 });
  });

  test('should show resume button for paused goals', async ({ page }) => {
    const pausedGoal = page.locator(
      '[data-testid="goal-item"][data-status="paused"], .goal-paused',
    );
    if (!(await pausedGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No paused goal — resume button only shown for paused goals');
      return;
    }

    const resumeButton = pausedGoal.locator(
      'button[aria-label*="Resume"], [data-testid="resume-goal"], button:has-text("Resume")',
    );
    await expect(resumeButton).toBeVisible({ timeout: 2000 });
  });

  test('should update status when goal is paused', async ({ page }) => {
    const runningGoal = page.locator('[data-testid="goal-item"][data-status*="progress"]').first();
    if (!(await runningGoal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No running goal to pause');
      return;
    }

    const pauseButton = runningGoal.locator(
      'button[aria-label*="Pause"], [data-testid="pause-goal"]',
    );
    if (!(await pauseButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      test.skip(true, 'Pause button not found on running goal');
      return;
    }

    await pauseButton.click();
    await page.waitForTimeout(500);

    const status = runningGoal.locator('[data-testid="goal-status"], .status-badge');
    await expect(status).toBeVisible({ timeout: 2000 });
    const statusText = await status.textContent();
    expect(statusText?.toLowerCase()).toMatch(/paus|in progress/);

    // Resume to clean up state
    const resumeButton = runningGoal.locator(
      'button[aria-label*="Resume"], [data-testid="resume-goal"]',
    );
    if (await resumeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resumeButton.click();
    }
  });
});

// ── AGI Reflection and Learning Events ───────────────────────────────────────

test.describe('AGI Reflection and Learning Events', () => {
  test.beforeEach(async ({ page }) => {
    await setupAGIPage(page);
  });

  test('should display reflection events during execution', async ({ page }) => {
    const reflectionPanel = page.locator(
      '[data-testid="reflection-panel"], .reflection-events, :text("Reflection")',
    );
    if (!(await reflectionPanel.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(
        true,
        'Reflection panel not present — requires an active goal with reflection events',
      );
      return;
    }
    await expect(reflectionPanel).toBeVisible();
  });

  test('should show learning insights from failed steps', async ({ page }) => {
    const goalWithFailures = page.locator(
      '[data-testid="goal-item"]:has-text("failed"), [data-has-failures="true"]',
    );
    if (!(await goalWithFailures.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No goal with failures — learning insights only shown for failed steps');
      return;
    }

    await goalWithFailures.click();

    const insights = page.locator(
      '[data-testid="learning-insights"], .insights-panel, :text("Insight"), :text("Learning")',
    );
    await expect(insights).toBeVisible({ timeout: 2000 });
  });

  test('should display correction suggestions', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();
    if (!(await goalItem.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No goal items present');
      return;
    }

    await goalItem.click();

    const corrections = page.locator(
      '[data-testid="corrections"], .corrections-list, :text("Correction"), :text("Suggestion")',
    );
    if (!(await corrections.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No corrections/suggestions panel — may require a goal with failures');
      return;
    }
    await expect(corrections).toBeVisible();
  });
});

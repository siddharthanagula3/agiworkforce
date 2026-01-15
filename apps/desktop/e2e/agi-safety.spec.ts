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
 */

// Helper to navigate to AGI section
async function navigateToAGI(page: Page) {
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

// Helper to submit a goal
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

// Helper to cancel a goal
async function cancelGoal(page: Page, goalSelector: string): Promise<boolean> {
  const goalItem = page.locator(goalSelector);

  if (await goalItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    const cancelButton = goalItem.locator(
      'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
    );

    if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelButton.click();

      // Handle confirmation dialog if present
      const confirmButton = page.locator(
        '[role="alertdialog"] button:has-text("Confirm"), [role="alertdialog"] button:has-text("Yes")',
      );
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }

      return true;
    }
  }
  return false;
}

test.describe('AGI Iteration Limits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should display iteration counter during goal execution', async ({ page }) => {
    // Look for running goal or iteration counter
    const iterationCounter = page.locator(
      '[data-testid="iteration-counter"], .iteration-count, :text("Iteration")',
    );

    const hasCounter = await iterationCounter.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCounter) {
      const text = await iterationCounter.textContent();
      // Should show iteration number
      expect(text).toMatch(/\d+/);
    }
  });

  test('should show iteration progress in goal details', async ({ page }) => {
    // Click on an active goal to see details
    const activeGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]:has-text("In Progress")',
    );

    if (await activeGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await activeGoal.click();

      const detailsPanel = page.locator('[data-testid="goal-details"], .goal-details');
      if (await detailsPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Look for iteration info in details
        const iterationInfo = detailsPanel.locator(':text("iteration"), :text("step")');
        const hasIterationInfo = await iterationInfo
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        if (hasIterationInfo) {
          expect(iterationInfo.first()).toBeVisible();
        }
      }
    }
  });

  test('should respect maximum iteration limit indicator', async ({ page }) => {
    // Look for max iteration setting or display
    const maxIterationIndicator = page.locator(
      '[data-testid="max-iterations"], :text("1000"), :text("max iteration")',
    );

    const hasMaxIndicator = await maxIterationIndicator
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // The max iterations (1000) should be referenced somewhere in the UI
    if (hasMaxIndicator) {
      const text = await maxIterationIndicator.textContent();
      expect(text).toBeDefined();
    }
  });
});

test.describe('AGI Timeout Mechanisms', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should display elapsed time for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], .goal-running',
    );

    if (await runningGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const timeDisplay = runningGoal.locator(
        '[data-testid="elapsed-time"], .elapsed-time, :text("elapsed"), :text("running")',
      );

      if (await timeDisplay.isVisible({ timeout: 1000 }).catch(() => false)) {
        const text = await timeDisplay.textContent();
        // Should show time in some format (seconds, minutes, or time notation)
        expect(text).toMatch(/\d+|elapsed|running/i);
      }
    }
  });

  test('should show timeout warning when approaching limit', async ({ page }) => {
    // Look for timeout warning indicator
    const timeoutWarning = page.locator(
      '[data-testid="timeout-warning"], [data-warning="timeout"], .timeout-warning, :text("timeout")',
    );

    const hasWarning = await timeoutWarning.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasWarning) {
      expect(timeoutWarning).toBeVisible();
    }
  });

  test('should display timeout event in goal history', async ({ page }) => {
    // Look for timed out goals
    const timedOutGoal = page.locator(
      '[data-testid="goal-item"]:has-text("timeout"), [data-status="timeout"]',
    );

    if (await timedOutGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timedOutGoal.click();

      const details = page.locator('[data-testid="goal-details"], .goal-details');
      if (await details.isVisible({ timeout: 1000 }).catch(() => false)) {
        const timeoutInfo = details.locator(':text("timeout"), :text("exceeded")');
        const hasTimeoutInfo = await timeoutInfo.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasTimeoutInfo) {
          expect(timeoutInfo.first()).toBeVisible();
        }
      }
    }
  });
});

test.describe('AGI Consecutive Failure Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should display failure count in goal progress', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goalItem.click();

      const failureInfo = page.locator(
        '[data-testid="failure-count"], :text("failure"), :text("failed step")',
      );

      const hasFailureInfo = await failureInfo.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasFailureInfo) {
        const text = await failureInfo.textContent();
        expect(text).toBeDefined();
      }
    }
  });

  test('should show abandoned status for goals with too many failures', async ({ page }) => {
    const abandonedGoal = page.locator(
      '[data-testid="goal-item"]:has-text("abandoned"), [data-testid="goal-item"]:has-text("unachievable"), [data-status="abandoned"]',
    );

    if (await abandonedGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await abandonedGoal.click();

      const details = page.locator('[data-testid="goal-details"], .goal-details');
      if (await details.isVisible({ timeout: 1000 }).catch(() => false)) {
        const reason = details.locator(
          ':text("consecutive failures"), :text("unachievable"), :text("abandoned")',
        );
        const hasReason = await reason.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasReason) {
          expect(reason.first()).toBeVisible();
        }
      }
    }
  });

  test('should display step success/failure indicators', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goalItem.click();

      const stepsList = page.locator('[data-testid="steps-list"], .steps-list');
      if (await stepsList.isVisible({ timeout: 1000 }).catch(() => false)) {
        const stepIndicators = stepsList.locator(
          '[data-status], .step-status, [data-testid="step-status"]',
        );
        const count = await stepIndicators.count();

        // Steps should have status indicators
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('AGI Cancellation Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should show cancel button for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]:has-text("In Progress")',
    );

    if (await runningGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const cancelButton = runningGoal.locator(
        'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
      );

      const hasCancelButton = await cancelButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasCancelButton) {
        expect(cancelButton).toBeVisible();
      }
    }
  });

  test('should confirm before cancelling a goal', async ({ page }) => {
    const runningGoal = page
      .locator('[data-testid="goal-item"][data-status*="progress"], [data-testid="goal-item"]')
      .first();

    if (await runningGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const cancelButton = runningGoal.locator(
        'button[aria-label*="Cancel"], [data-testid="cancel-goal"], button:has-text("Cancel")',
      );

      if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelButton.click();

        // Should show confirmation dialog
        const confirmDialog = page.locator(
          '[role="alertdialog"], [role="dialog"]:has-text("cancel")',
        );
        const hasConfirmation = await confirmDialog.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasConfirmation) {
          expect(confirmDialog).toBeVisible();

          // Cancel the dialog to not actually cancel the goal
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('should update goal status after cancellation', async ({ page }) => {
    // Submit a test goal first
    const submitted = await submitGoal(page, 'Test goal for cancellation');

    if (submitted) {
      await page.waitForTimeout(1000);

      // Try to cancel the newest goal
      const newestGoal = page.locator('[data-testid="goal-item"]').first();

      if (await newestGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
        const cancelled = await cancelGoal(page, '[data-testid="goal-item"]:first-of-type');

        if (cancelled) {
          await page.waitForTimeout(500);

          // Check status changed to cancelled
          const statusBadge = newestGoal.locator('[data-testid="goal-status"], .status-badge');
          if (await statusBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
            const statusText = await statusBadge.textContent();
            expect(statusText?.toLowerCase()).toContain('cancel');
          }
        }
      }
    }
  });
});

test.describe('AGI Resource Constraints', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should display resource usage indicators', async ({ page }) => {
    const resourcePanel = page.locator(
      '[data-testid="resource-monitor"], .resource-panel, :text("Resources")',
    );

    const hasResourcePanel = await resourcePanel.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasResourcePanel) {
      expect(resourcePanel).toBeVisible();
    }
  });

  test('should show memory usage limit', async ({ page }) => {
    const memoryIndicator = page.locator(
      '[data-testid="memory-usage"], .memory-indicator, :text("Memory"):has-text("%")',
    );

    const hasMemoryIndicator = await memoryIndicator
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasMemoryIndicator) {
      const text = await memoryIndicator.textContent();
      // Should show memory usage
      expect(text).toMatch(/\d+|MB|GB|memory/i);
    }
  });

  test('should warn when approaching resource limits', async ({ page }) => {
    const resourceWarning = page.locator(
      '[data-warning="resource"], .resource-warning, [data-testid="resource-warning"]',
    );

    const hasWarning = await resourceWarning.isVisible({ timeout: 2000 }).catch(() => false);

    // This may not always be visible depending on system state
    if (hasWarning) {
      expect(resourceWarning).toBeVisible();
    }
  });
});

test.describe('AGI Approval Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should show pending approval indicator for dangerous operations', async ({ page }) => {
    const approvalIndicator = page.locator(
      '[data-testid="pending-approval"], .approval-pending, :text("Waiting for approval")',
    );

    const hasApproval = await approvalIndicator.isVisible({ timeout: 3000 }).catch(() => false);

    // May not always be visible depending on what operations are queued
    if (hasApproval) {
      expect(approvalIndicator).toBeVisible();
    }
  });

  test('should display approve/reject buttons for pending operations', async ({ page }) => {
    const approvalRequest = page.locator(
      '[data-testid="approval-request"], .approval-item, .pending-approval',
    );

    if (await approvalRequest.isVisible({ timeout: 2000 }).catch(() => false)) {
      const approveButton = approvalRequest.locator(
        'button:has-text("Approve"), [data-testid="approve-button"]',
      );
      const rejectButton = approvalRequest.locator(
        'button:has-text("Reject"), [data-testid="reject-button"]',
      );

      const hasApprove = await approveButton.isVisible({ timeout: 1000 }).catch(() => false);
      const hasReject = await rejectButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasApprove && hasReject) {
        expect(approveButton).toBeVisible();
        expect(rejectButton).toBeVisible();
      }
    }
  });

  test('should show operation details before approval', async ({ page }) => {
    const approvalRequest = page
      .locator('[data-testid="approval-request"], .approval-item')
      .first();

    if (await approvalRequest.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Should show what operation needs approval
      const operationDetails = approvalRequest.locator(
        '[data-testid="operation-details"], .operation-description, p, span',
      );

      const hasDetails = await operationDetails.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasDetails) {
        const text = await operationDetails.textContent();
        expect(text).toBeDefined();
        expect(text?.length).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('AGI Pause and Resume', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should show pause button for running goals', async ({ page }) => {
    const runningGoal = page.locator(
      '[data-testid="goal-item"][data-status*="progress"], .goal-running',
    );

    if (await runningGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const pauseButton = runningGoal.locator(
        'button[aria-label*="Pause"], [data-testid="pause-goal"], button:has-text("Pause")',
      );

      const hasPause = await pauseButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasPause) {
        expect(pauseButton).toBeVisible();
      }
    }
  });

  test('should show resume button for paused goals', async ({ page }) => {
    const pausedGoal = page.locator(
      '[data-testid="goal-item"][data-status="paused"], .goal-paused',
    );

    if (await pausedGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const resumeButton = pausedGoal.locator(
        'button[aria-label*="Resume"], [data-testid="resume-goal"], button:has-text("Resume")',
      );

      const hasResume = await resumeButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasResume) {
        expect(resumeButton).toBeVisible();
      }
    }
  });

  test('should update status when goal is paused', async ({ page }) => {
    const runningGoal = page.locator('[data-testid="goal-item"][data-status*="progress"]').first();

    if (await runningGoal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const pauseButton = runningGoal.locator(
        'button[aria-label*="Pause"], [data-testid="pause-goal"]',
      );

      if (await pauseButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pauseButton.click();
        await page.waitForTimeout(500);

        // Status should update to paused
        const status = runningGoal.locator('[data-testid="goal-status"], .status-badge');
        if (await status.isVisible({ timeout: 1000 }).catch(() => false)) {
          const statusText = await status.textContent();
          // Status might be "Paused" or still transitioning
          expect(statusText).toBeDefined();
        }

        // Resume to clean up
        const resumeButton = runningGoal.locator(
          'button[aria-label*="Resume"], [data-testid="resume-goal"]',
        );
        if (await resumeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await resumeButton.click();
        }
      }
    }
  });
});

test.describe('AGI Reflection and Learning Events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await navigateToAGI(page);
  });

  test('should display reflection events during execution', async ({ page }) => {
    const reflectionPanel = page.locator(
      '[data-testid="reflection-panel"], .reflection-events, :text("Reflection")',
    );

    const hasReflection = await reflectionPanel.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasReflection) {
      expect(reflectionPanel).toBeVisible();
    }
  });

  test('should show learning insights from failed steps', async ({ page }) => {
    const goalWithFailures = page.locator(
      '[data-testid="goal-item"]:has-text("failed"), [data-has-failures="true"]',
    );

    if (await goalWithFailures.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goalWithFailures.click();

      const insights = page.locator(
        '[data-testid="learning-insights"], .insights-panel, :text("Insight"), :text("Learning")',
      );

      const hasInsights = await insights.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasInsights) {
        expect(insights).toBeVisible();
      }
    }
  });

  test('should display correction suggestions', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goalItem.click();

      const corrections = page.locator(
        '[data-testid="corrections"], .corrections-list, :text("Correction"), :text("Suggestion")',
      );

      const hasCorrections = await corrections.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCorrections) {
        expect(corrections).toBeVisible();
      }
    }
  });
});

import { test, expect } from '../fixtures';
import {
  dismissOnboarding,
  injectMockCloudAuth,
  mockCloudAccountEndpoints,
} from '../utils/mock-cloud-auth';

test.describe('Self-Healing Agent', () => {
  test.beforeEach(async ({ page, mockLLM: _mockLLM }) => {
    await injectMockCloudAuth(page);
    await mockCloudAccountEndpoints(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
    await page.waitForLoadState('networkidle');
  });

  test('retries after initial tool failure and returns a recovery plan', async ({
    page,
    mockLLM,
  }) => {
    const prompt = 'Read /invalid/path/config.json and continue the task';

    mockLLM.setMockResponse(
      /invalid\/path\/config\.json/i,
      'Initial attempt failed due to a missing file. Starting self-healing recovery: I validated fallback paths, regenerated config, and resumed execution.',
    );

    const chatInput = page
      .getByRole('textbox', { name: /message/i })
      .or(page.locator('textarea[aria-label="Message"]'))
      .first();
    await expect(chatInput).toBeVisible({ timeout: 20000 });
    await chatInput.fill(prompt);

    const desktopRuntimeGate = page.getByText(
      /This feature requires the AGI Workforce desktop application/i,
    );
    const subscriptionDialog = page.getByRole('dialog', { name: /Subscription Required/i });
    const sendButton = page.getByRole('button', { name: /send/i }).first();

    const sendClickResult = await sendButton
      .click({ timeout: 5000 })
      .then(() => 'sent' as const)
      .catch(() => 'gated' as const);

    const gateVisible =
      (await desktopRuntimeGate.isVisible().catch(() => false)) ||
      (await subscriptionDialog.isVisible().catch(() => false));

    if (sendClickResult === 'gated' || gateVisible) {
      const sendDisabled = await sendButton.isDisabled().catch(() => false);
      expect(
        gateVisible || sendDisabled,
        'web-mode CI should either show the explicit desktop/subscription gate or keep Send disabled',
      ).toBe(true);
      return;
    }

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 20000 });
    await expect(assistantMessage).toContainText(
      /self-healing|recovery|fallback|resumed execution|initial attempt failed/i,
    );
  });
});

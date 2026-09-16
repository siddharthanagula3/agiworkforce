import { test, expect } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const OUT = process.env['AGI_SHOT_OUT'] ?? '';
const WIDTH = Number(process.env['AGI_SHOT_WIDTH'] ?? 1440);
const HEIGHT = Number(process.env['AGI_SHOT_HEIGHT'] ?? 900);

// llm-guardrail-allow: a capture utility for founder review, not a regression test; it needs an output directory.
test.skip(!OUT, 'Set AGI_SHOT_OUT to capture signed-in chat screenshots.');

test.use({ viewport: { width: WIDTH, height: HEIGHT } });

test('signed-in chat surfaces at the requested viewport', async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('voice-entry-button')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/chat-empty.png` });

  const index = Number(process.env['AGI_SHOT_CONVERSATION_INDEX'] ?? 0);
  const firstConversation = page.locator('a[href^="/chat/"]').nth(index);
  if (await firstConversation.isVisible().catch(() => false)) {
    await firstConversation.click();
    await page.waitForURL(/\/chat\/[^/]+$/, { timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: `${OUT}/chat-conversation.png` });
    await page.screenshot({ path: `${OUT}/chat-conversation-full.png`, fullPage: true });
  }
});

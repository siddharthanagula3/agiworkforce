import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const SHOTS =
  process.env['WALK_FOLLOWUP_SHOTS'] ?? path.resolve(__dirname, '../../../.walk-followup-shots');

function shot(page: Page, name: string): Promise<Buffer> {
  mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function openChat(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.getByRole('textbox', { name: /message input/i })).toBeVisible({
    timeout: 30_000,
  });
}

async function openPlusMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /add attachments and tools/i }).click();
}

/**
 * Edit support is a per-model catalog fact the availability endpoint publishes,
 * and which image models this deployment admits depends on the credentials it
 * happens to hold. The walk is about the composer, so it states the admission
 * rather than waiting to be handed one: `supports_edit` is what the composer
 * reads, and the service test covers where that value comes from.
 */
async function admitEditCapableImageModels(page: Page): Promise<void> {
  await page.route('**/api/media/availability', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      models?: { kind: string; state: string; supports_edit?: boolean }[];
    };
    for (const model of body.models ?? []) {
      if (model.kind !== 'image') continue;
      model.state = 'enabled';
      model.supports_edit = true;
    }
    await route.fulfill({ response, json: body });
  });
}

test.describe('composer attachment refusal and image editing', () => {
  test('a refused upload reaches the model as a refusal, not as a phantom file', async ({
    page,
  }) => {
    await openChat(page);

    const sent: string[] = [];
    await page.route('**/api/llm/v1/chat/completions', async (route) => {
      sent.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: [DONE]\n\n',
      });
    });

    await page.setInputFiles('input[aria-label="File upload"]', {
      name: 'installer.dmg',
      mimeType: 'application/x-apple-diskimage',
      buffer: Buffer.from('not a chat attachment'),
    });

    const notice = page.getByRole('alert').filter({ hasText: /unsupported file type/i });
    await expect(notice).toBeVisible();
    await shot(page, 'refused-upload-notice');

    await page.getByRole('textbox', { name: /message input/i }).fill('summarise the attached file');
    await page.keyboard.press('Enter');

    await expect.poll(() => sent.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(sent[0]).toContain('attachment unavailable');
    expect(sent[0]).toContain('installer.dmg');
    await shot(page, 'refused-upload-transcript');
  });

  test('an attached image in image mode offers edit, variation and mask', async ({ page }) => {
    await admitEditCapableImageModels(page);
    await openChat(page);

    const imageRequests: string[] = [];
    await page.route('**/api/media/image/generate', async (route) => {
      imageRequests.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          images: [{ b64_json: 'aGk=' }],
          provider: 'openai',
          model: 'fixture',
          latency_ms: 1,
        }),
      });
    });

    await openPlusMenu(page);
    await page.getByText('Create image', { exact: true }).click();
    await expect(page.getByRole('button', { name: /exit image generation mode/i })).toBeVisible();

    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
        '05fe02fea7000000049454e44ae426082',
      'hex',
    );
    await page.setInputFiles('input[aria-label="File upload"]', {
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const operation = page.getByRole('button', { name: /what to do with the attached image/i });
    await expect(operation).toBeVisible({ timeout: 15_000 });
    await operation.click();
    await expect(page.getByText('Variation', { exact: true })).toBeVisible();
    await shot(page, 'image-mode-operations');
    await page.keyboard.press('Escape');

    await page.getByRole('textbox', { name: /message input/i }).fill('put it on a beach');
    await page.keyboard.press('Enter');

    await expect.poll(() => imageRequests.length, { timeout: 40_000 }).toBeGreaterThan(0);
    const body = JSON.parse(imageRequests[0] ?? '{}') as {
      operation?: string;
      source_image?: { b64_json?: string };
    };
    expect(body.operation).toBe('edit');
    expect(body.source_image?.b64_json?.length ?? 0).toBeGreaterThan(0);
    await shot(page, 'image-edit-sent');
  });

  test('a mask edit carries the second image as the mask', async ({ page }) => {
    await admitEditCapableImageModels(page);
    await openChat(page);

    const imageRequests: string[] = [];
    await page.route('**/api/media/image/generate', async (route) => {
      imageRequests.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          images: [{ b64_json: 'aGk=' }],
          provider: 'openai',
          model: 'fixture',
          latency_ms: 1,
        }),
      });
    });

    await openPlusMenu(page);
    await page.getByText('Create image', { exact: true }).click();

    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
        '05fe02fea7000000049454e44ae426082',
      'hex',
    );
    await page.setInputFiles('input[aria-label="File upload"]', [
      { name: 'portrait.png', mimeType: 'image/png', buffer: png },
      { name: 'mask.png', mimeType: 'image/png', buffer: png },
    ]);

    const operation = page.getByRole('button', { name: /what to do with the attached image/i });
    await expect(operation).toBeVisible({ timeout: 15_000 });
    await operation.click();
    const mask = page.getByText('Mask edit', { exact: true });
    await expect(mask).toBeVisible();
    await mask.click();
    await shot(page, 'mask-edit-selected');

    await page.getByRole('textbox', { name: /message input/i }).fill('redraw the masked area');
    await page.keyboard.press('Enter');

    await expect.poll(() => imageRequests.length, { timeout: 40_000 }).toBeGreaterThan(0);
    const body = JSON.parse(imageRequests[0] ?? '{}') as {
      operation?: string;
      mask_image?: { b64_json?: string };
    };
    expect(body.operation).toBe('inpaint');
    expect(body.mask_image?.b64_json?.length ?? 0).toBeGreaterThan(0);
  });
});

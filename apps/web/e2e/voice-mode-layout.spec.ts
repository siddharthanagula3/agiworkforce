import { test, expect, type Page, type Route } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Voice mode geometry against a mocked session, so nothing reaches the voice
 * provider and no voice minutes are spent. The session endpoint answers with
 * an SDP the browser cannot apply, which leaves the surface in its error
 * state: the orb, the error row and the composer all on screen at once, the
 * layout the orb used to cover. Conversation creation is refused so the spec
 * writes nothing to the account. It clicks only the voice entry button, the
 * microphone note's Continue the way a user accepts it on first use, the
 * orb and the composer's + button; it never sends a message or opens a
 * menu item.
 */

const SESSIONS = '**/api/voice/live/sessions';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 640 },
  { width: 390, height: 700 },
];

async function mockVoiceEndpoints(page: Page): Promise<void> {
  await page.route(SESSIONS, (route: Route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'live_e2e',
            sdp: 'v=0\r\n',
            voiceSessionId: 'vs_e2e',
            settlement: { ceilingSeconds: 600 },
            settings: { voice: 'marin', language: null, pace: 1, reasoning: 'instant' },
            tools: [],
          }),
        })
      : route.fallback(),
  );
  await page.route('**/api/voice/live/sessions/active**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"session":null}' }),
  );
  await page.route('**/api/chat/conversations', (route: Route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.fallback(),
  );
}

async function enterVoiceMode(page: Page): Promise<void> {
  await page.goto('/chat');
  const start = page.getByRole('button', { name: 'Start voice mode' }).first();
  const surface = page.getByTestId('voice-mode-surface');
  await start.click();
  await expect(surface).toBeVisible({ timeout: 20_000 });
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone'],
});

test.describe('voice mode layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockVoiceEndpoints(page);
    await signIn(page);
  });

  test('the + menu opens above its button, not in the corner of the page', async ({ page }) => {
    await enterVoiceMode(page);
    const plus = page.getByRole('button', { name: 'Open this chat panel' });
    await plus.click();

    const menu = page.getByTestId('voice-chat-dock');
    await expect(menu).toBeVisible();
    const button = (await plus.boundingBox())!;
    const panel = (await menu.boundingBox())!;
    expect(panel.y + panel.height).toBeLessThanOrEqual(button.y);
    expect(button.y - (panel.y + panel.height)).toBeLessThanOrEqual(24);
    expect(Math.abs(panel.x - button.x)).toBeLessThanOrEqual(24);

    await plus.click();
    await expect(menu).toBeHidden();
  });

  for (const viewport of VIEWPORTS) {
    test(`the orb never covers the error row or the composer at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await enterVoiceMode(page);
      await expect(page.getByTestId('voice-error')).toBeVisible({ timeout: 20_000 });

      for (const focused of [false, true]) {
        if (focused) await page.getByTestId('voice-orb').click();
        const orb = (await page.getByTestId('voice-orb-canvas').boundingBox())!;
        const error = (await page.getByTestId('voice-error').boundingBox())!;
        const composer = (await page.getByTestId('voice-composer').boundingBox())!;
        expect(overlaps(orb, error)).toBe(false);
        expect(overlaps(orb, composer)).toBe(false);
      }
    });
  }
});

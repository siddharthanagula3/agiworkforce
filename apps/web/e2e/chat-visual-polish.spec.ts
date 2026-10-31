import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { signIn } from './qa-capability-harness';
import { CHAT_RENDERING_FIXTURES } from '../test/fixtures/chat-rendering';
import { THEME_STORAGE_KEY } from '../shared/components/ThemeConstants';
import { settleConsent } from './lib/settle-consent';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  SERVICE_NOTICES_PATH,
} from '@agiworkforce/cloud-contracts';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];
const MARKDOWN = CHAT_RENDERING_FIXTURES.find((fixture) => fixture.id === 'markdown')!;
const EVIDENCE_DIR = process.env['QA_RENDER_EVIDENCE_DIR'];

for (const appearance of ['light', 'dark'] as const) {
  for (const touch of [false, true]) {
    test.describe(`${appearance} ${touch ? 'touch' : 'pointer'} chat`, () => {
      test.use({ hasTouch: touch, reducedMotion: 'reduce' });

      test('keeps readable type, usable actions and aligned columns from phone to large display', async ({
        page,
        baseURL,
      }) => {
        expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL ?? '').hostname);
        expect(['localhost', '127.0.0.1']).toContain(
          new URL(process.env['DATABASE_URL'] ?? '').hostname,
        );
        expect(process.env['CLERK_SECRET_KEY']?.startsWith('sk_test_')).toBe(true);
        await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
          key: THEME_STORAGE_KEY,
          value: appearance,
        });
        let inferenceCalls = 0;
        let imageCalls = 0;
        await page.route('**/api/consent', (route) => {
          if (route.request().method() === 'GET') return route.fulfill({ json: { consents: [] } });
          if (route.request().method() === 'POST') return route.fulfill({ json: { recorded: 1 } });
          return route.abort();
        });
        const settings: Record<string, Record<string, unknown>> = {
          appearance: { theme: appearance },
        };
        await page.route(`**${MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH}*`, (route) => {
          const request = route.request();
          if (request.method() === 'GET') {
            const namespace = new URL(request.url()).searchParams.get('namespace');
            return route.fulfill({
              json: { settings: namespace ? (settings[namespace] ?? {}) : settings, version: 'qa' },
            });
          }
          if (request.method() !== 'PUT') return route.abort();
          const body = request.postDataJSON() as {
            namespace: string;
            patch?: Record<string, unknown>;
            value?: Record<string, unknown>;
          };
          if (!body.namespace)
            return route.fulfill({ status: 400, json: { error: 'Namespace required' } });
          settings[body.namespace] = body.patch
            ? { ...settings[body.namespace], ...body.patch }
            : (body.value ?? {});
          return route.fulfill({ json: { version: 'qa' } });
        });
        await page.route(`**${SERVICE_NOTICES_PATH}`, (route) =>
          route.fulfill({
            json: {
              notices: Array.from({ length: 3 }, (_, index) => ({
                id: `incident:visual-polish-${index}`,
                kind: 'incident',
                scope: 'product',
                tone: 'danger',
                message:
                  'A test service is unavailable right now, and some requests may fail. The service status page has more information.',
                href: '/status',
                linkLabel: 'Status',
              })),
            },
          }),
        );
        await page.route('**/api/media/image/**', async (route) => {
          imageCalls++;
          await route.abort();
        });
        await page.route('**/api/llm/v1/chat/completions', async (route) => {
          inferenceCalls++;
          const payload = route.request().postDataJSON() as { model: string };
          await route.fulfill({
            contentType: 'text/event-stream',
            body:
              [
                { model: payload.model, choices: [{ delta: { content: MARKDOWN.content } }] },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ]
                .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                .join('') + 'data: [DONE]\n\n',
          });
        });
        await signIn(page);
        await page.goto('/chat');
        await settleConsent(page);
        await page.getByRole('button', { name: /^new chat$/i }).click();
        const composer = page.getByRole('textbox', { name: 'Message input', exact: true });
        await composer.fill(MARKDOWN.prompt);
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        const assistant = page.locator('[data-role="assistant"]').last();
        await expect(assistant.locator('u')).toHaveText('underlined');
        await expect(
          assistant.getByRole('button', { name: 'Copy message', exact: true }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/);
        await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);

        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport);
          await page.waitForFunction(() => document.fonts.status === 'loaded');
          await expect(composer).toBeInViewport();
          if (viewport.height < 600 || viewport.width === 320) {
            const notices = page.locator('[data-product-notice-stack]');
            await composer.focus();
            await notices.getByRole('button', { name: 'Dismiss this notice' }).last().focus();
            await expect
              .poll(() => notices.evaluate((element) => element.scrollTop))
              .toBeGreaterThan(0);
            const header = await page.locator('[data-app-header]').evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const top = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
              return {
                bottom: rect.bottom,
                covered: Boolean(top?.closest('[data-product-notice-stack]')),
                noticeTop: document
                  .querySelector('[data-product-notice-stack]')!
                  .getBoundingClientRect().top,
              };
            });
            expect(header.covered).toBe(false);
            expect(header.noticeTop).toBeGreaterThanOrEqual(header.bottom);
          }
          const geometry = await page.evaluate(() => {
            const assistant = [...document.querySelectorAll('[data-role="assistant"]')].at(-1)!;
            const text = assistant.querySelector('.message-text')!;
            const column = assistant.querySelector('.message-inner')!;
            const input = document.querySelector('[aria-label="Message input"]')!;
            const composerColumn = input.closest('.max-w-3xl')!;
            const box = (element: Element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width };
            };
            const actions = assistant.querySelector('[data-testid="message-action-row"]')!;
            return {
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
              font: parseFloat(getComputedStyle(text).fontSize),
              line: parseFloat(getComputedStyle(text).lineHeight),
              headings: [...text.querySelectorAll('[data-markdown-heading]')].map((heading) =>
                parseFloat(getComputedStyle(heading).fontSize),
              ),
              column: box(column),
              composer: box(composerColumn),
              actionsVisible: parseFloat(getComputedStyle(actions).opacity),
              targets: [...actions.querySelectorAll('button')].map((button) => {
                const rect = button.getBoundingClientRect();
                return {
                  name: button.getAttribute('aria-label'),
                  width: rect.width,
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                };
              }),
              noticeBottom: document
                .querySelector('[data-product-notice-stack]')
                ?.getBoundingClientRect().bottom,
              transcriptTop: document.querySelector('[role="log"]')?.getBoundingClientRect().top,
            };
          });
          expect(geometry.pageWidth).toBeLessThanOrEqual(viewport.width);
          expect(geometry.font).toBe(16);
          expect(geometry.line).toBe(26);
          expect(geometry.headings.slice(0, 3)).toEqual([20, 18, 16]);
          expect(geometry.column.width).toBeLessThanOrEqual(768);
          expect(Math.abs(geometry.column.left - geometry.composer.left)).toBeLessThanOrEqual(1);
          expect(Math.abs(geometry.column.right - geometry.composer.right)).toBeLessThanOrEqual(1);
          for (const target of geometry.targets) {
            expect(target.left, target.name ?? '').toBeGreaterThanOrEqual(0);
            expect(target.right, target.name ?? '').toBeLessThanOrEqual(viewport.width);
            if (touch) {
              expect(target.width, target.name ?? '').toBeGreaterThanOrEqual(44);
              expect(target.height, target.name ?? '').toBeGreaterThanOrEqual(44);
            }
          }
          if (touch) expect(geometry.actionsVisible).toBe(1);
          expect(geometry.noticeBottom).toBeDefined();
          expect(geometry.transcriptTop).toBeGreaterThanOrEqual(geometry.noticeBottom! - 1);
          if (EVIDENCE_DIR) {
            mkdirSync(EVIDENCE_DIR, { recursive: true });
            await page.screenshot({
              path: path.join(
                EVIDENCE_DIR,
                `chat-${appearance}-${touch ? 'touch' : 'pointer'}-${viewport.width}.png`,
              ),
            });
          }
        }
        expect(inferenceCalls).toBe(1);
        expect(imageCalls).toBe(0);
        const dismiss = page
          .locator('[data-product-notice-stack]')
          .getByRole('button', { name: 'Dismiss this notice' });
        while (await dismiss.count()) await dismiss.first().click();
        await expect
          .poll(() =>
            page
              .locator('[data-chat-surface]')
              .evaluate((element) => element.style.getPropertyValue('--agi-product-notice-inset')),
          )
          .toBe('0px');
        const restored = await page.evaluate(() => ({
          header: document.querySelector('[data-app-header]')!.getBoundingClientRect().bottom,
          transcript: document.querySelector('[role="log"]')!.getBoundingClientRect().top,
        }));
        expect(Math.abs(restored.transcript - restored.header)).toBeLessThanOrEqual(1);
        if (EVIDENCE_DIR) {
          for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            const transcript = page.getByRole('log', { name: 'Chat messages', exact: true });
            await transcript.hover();
            await page.mouse.wheel(0, -3000);
            const heading = assistant.getByRole('heading', {
              name: 'Formatting showcase',
              exact: true,
            });
            await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }));
            await expect(heading).toBeInViewport();
            await page.screenshot({
              path: path.join(
                EVIDENCE_DIR,
                `chat-normal-${appearance}-${touch ? 'touch' : 'pointer'}-${width}.png`,
              ),
            });
            await page.locator('#main-content').screenshot({
              path: path.join(
                EVIDENCE_DIR,
                `chat-main-${appearance}-${touch ? 'touch' : 'pointer'}-${width}.png`,
              ),
            });
          }
        }
        expect(inferenceCalls).toBe(1);
        expect(imageCalls).toBe(0);
      });
    });
  }
}

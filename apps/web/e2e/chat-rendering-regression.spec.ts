import { test, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  QA_EMAIL_SOURCE,
  QA_WRITING_SOURCES,
  QA_CODE_SOURCES,
  QA_DIAGRAMS,
} from '../test/fixtures/chat-rendering';
import { LUNA_QA_MATH_EXPRESSIONS, LUNA_QA_MATH_MARKDOWN } from '../test/fixtures/luna-math';

const EVIDENCE_DIR = process.env['QA_RENDER_EVIDENCE_DIR'];
if (EVIDENCE_DIR) mkdirSync(EVIDENCE_DIR, { recursive: true });
const WIDTHS = [1440, 1024, 390, 320];
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function openFixture(page: Page, id: string) {
  const response = await page.goto(`/dev/renderer-probe?case=${id}&conversation=${randomUUID()}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-renderer-conversation]')).toBeVisible();
  const consent = page.getByRole('button', { name: 'Necessary only', exact: true });
  await consent.click();
  await expect(page.getByRole('region', { name: 'Cookie consent', exact: true })).toBeHidden();
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, {
    timeout: 15_000,
  });
}

async function theme(page: Page, next: string) {
  const button = page.getByRole('button', { name: `Use ${next} theme`, exact: true });
  if (await button.isVisible()) await button.click();
  await expect(
    page.getByRole('button', {
      name: `Use ${next === 'dark' ? 'light' : 'dark'} theme`,
      exact: true,
    }),
  ).toBeVisible();
}

async function evidence(page: Page, name: string) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true });
}

async function assertNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    controls: Array.from(
      document.querySelectorAll(
        '[data-probe-root] button, [data-probe-root] input, [data-probe-root] select',
      ),
    )
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          bounds.width > 0 &&
          style.visibility !== 'hidden' &&
          (bounds.right > innerWidth + 1 || bounds.left < -1)
        );
      })
      .map((element) => element.getAttribute('aria-label') ?? element.textContent),
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.controls).toEqual([]);
}

test.beforeEach(async ({ page, baseURL, context }) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL ?? '').hostname);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  if (process.env['QA_RENDER_DEBUG'] === '1') {
    page.on('console', (message) =>
      console.info('[renderer console]', message.type(), message.text().slice(0, 600)),
    );
    page.on('pageerror', (error) => console.info('[renderer error]', error.message.slice(0, 600)));
    page.on('requestfailed', (request) =>
      console.info('[renderer request failed]', request.url(), request.failure()?.errorText),
    );
    page.on('response', (response) => {
      if (/localhost:3001|dompurify/.test(response.url()))
        console.info('[renderer response]', response.status(), response.url());
    });
    page.on('framenavigated', async (frame) => {
      if (!frame.url().includes('localhost:3001')) return;
      try {
        console.info(
          '[renderer frame]',
          frame.url(),
          await frame.evaluate(() => ({
            body: document.body?.innerText.slice(0, 200),
            scripts: Array.from(document.scripts).map((script) => ({
              src: script.src,
              type: script.type,
            })),
          })),
        );
      } catch {
        console.info('[renderer frame detached]');
      }
    });
  }
  const sanitizerPath = process.env['QA_RENDER_PINNED_SANITIZER'];
  if (sanitizerPath) {
    const renderer = readFileSync(
      path.resolve(process.cwd(), '../../infrastructure/sandbox/index.html'),
      'utf8',
    );
    const pinned = renderer.match(/<script\s+src="([^"]*dompurify[^"]*)"\s+integrity="([^"]+)"/);
    expect(pinned).not.toBeNull();
    const bytes = readFileSync(sanitizerPath);
    expect(`sha384-${createHash('sha384').update(bytes).digest('base64')}`).toBe(pinned![2]);
    await page.route(pinned![1]!, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        headers: { 'access-control-allow-origin': '*' },
        body: bytes,
      }),
    );
  }

  await page.route('**/qa-render-image-*.svg', async (route) => {
    const match = /image-(\d)/.exec(route.request().url());
    const number = Number(match?.[1] ?? 1);
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><title>Fixture image ${number}</title><rect width="320" height="180" fill="${['white', 'lightgray', 'silver', 'gainsboro'][number - 1]}"/><text x="20" y="90">Fixture resource ${number}</text></svg>`,
    });
  });
});

for (const width of WIDTHS) {
  test(`exact math geometry and source survive completion and reopening at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openFixture(page, 'math');
    for (const appearance of ['dark', 'light']) {
      await theme(page, appearance);
      const math = page.locator('.message-text .katex');
      await expect(math).toHaveCount(6);
      await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, {
        timeout: 15_000,
      });
      const result = await page.evaluate(() => {
        const math = Array.from(document.querySelectorAll('.message-text .katex'));
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        };
        const energy = math[0]!;
        const base = Array.from(energy.querySelectorAll('.katex-html .mathnormal')).find(
          (element) => element.textContent === 'c',
        )!;
        const exponent = energy.querySelector('.katex-html .msupsub .mord')!;
        const fractions = Array.from(document.querySelectorAll('.message-text .frac-line')).map(
          (element) => ({
            ...bounds(element),
            rule: parseFloat(getComputedStyle(element).borderBottomWidth),
          }),
        );
        const matrix = math[3]!;
        const columns = Array.from(matrix.querySelectorAll('.mtable .col-align-c'));
        return {
          sources: math.map((element) => element.querySelector('annotation')?.textContent?.trim()),
          hiddenHtml: math.every(
            (element) =>
              element.querySelector('.katex-html')?.getAttribute('aria-hidden') === 'true',
          ),
          fonts: Array.from(document.fonts)
            .filter((face) => /KaTeX_(Main|Math)/.test(face.family))
            .map((face) => ({ family: face.family, status: face.status })),
          base: bounds(base),
          exponent: bounds(exponent),
          fractions,
          matrixColumns: columns.map((column) =>
            Array.from(
              column.querySelectorAll(':scope > .vlist-t > .vlist-r > .vlist > span > .mord'),
            ).map(bounds),
          ),
          boxes: math.map(bounds),
        };
      });
      expect(result.sources).toEqual(LUNA_QA_MATH_EXPRESSIONS);
      expect(result.hiddenHtml).toBe(true);
      expect(
        result.fonts.some((font) => /KaTeX_Main/.test(font.family) && font.status === 'loaded'),
      ).toBe(true);
      expect(
        result.fonts.some((font) => /KaTeX_Math/.test(font.family) && font.status === 'loaded'),
      ).toBe(true);
      expect(result.exponent.top + result.exponent.height / 2).toBeLessThan(
        result.base.top + result.base.height / 2,
      );
      expect(result.fractions.length).toBeGreaterThanOrEqual(3);
      for (const rule of result.fractions) {
        expect(rule.width).toBeGreaterThan(5);
        expect(rule.rule).toBeGreaterThan(0);
      }
      expect(result.matrixColumns).toHaveLength(4);
      for (const column of result.matrixColumns) {
        expect(column).toHaveLength(4);
        const byTop = [...column].sort((a, b) => a.top - b.top);
        for (let i = 1; i < byTop.length; i++)
          expect(byTop[i]!.top).toBeGreaterThanOrEqual(byTop[i - 1]!.bottom - 1);
      }
      for (const box of result.boxes) {
        expect(box.height).toBeGreaterThan(8);
        expect(box.width).toBeGreaterThan(12);
      }
      await assertNoPageOverflow(page);
      await page.getByRole('button', { name: 'Copy message', exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LUNA_QA_MATH_MARKDOWN);
      if (EVIDENCE_DIR)
        writeFileSync(
          path.join(EVIDENCE_DIR, `math-${width}-${appearance}.json`),
          JSON.stringify(result, null, 2),
        );
      await evidence(page, `math-${width}-${appearance}`);
      await page.getByRole('button', { name: 'Stream fixture', exact: true }).click();
      await expect(page.locator('.katex-error')).toHaveCount(0);
      await page.getByRole('button', { name: 'Complete response', exact: true }).click();
      await expect(math).toHaveCount(6);
      await page.reload();
      await expect(math).toHaveCount(6);
      await expect(page.locator('.katex-html[aria-hidden="true"]')).toHaveCount(6);
    }
  });
}

test('headings stay distinct, compact and scoped in both themes', async ({ page }) => {
  await openFixture(page, 'markdown');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ['dark', 'light']) {
      await theme(page, appearance);
      const sizes = await page
        .locator('.message-text [data-markdown-heading]')
        .evaluateAll((headings) =>
          headings.slice(0, 3).map((h) => ({
            tag: h.tagName,
            size: parseFloat(getComputedStyle(h).fontSize),
            weight: getComputedStyle(h).fontWeight,
          })),
        );
      expect(sizes.map((h) => h.tag)).toEqual(['H1', 'H2', 'H3']);
      expect(sizes[0]!.size).toBeGreaterThan(sizes[1]!.size);
      expect(sizes[1]!.size).toBeGreaterThan(sizes[2]!.size);
      expect(sizes[0]!.size).toBeLessThanOrEqual(24);
      expect(
        await page
          .locator('[data-unrelated-heading]')
          .evaluate((h) => getComputedStyle(h).fontSize),
      ).toBe('14px');
      await assertNoPageOverflow(page);
      await evidence(page, `headings-${width}-${appearance}`);
    }
  }
});

test('email Copy and Edit act on real text and Save survives reload', async ({ page }) => {
  await openFixture(page, 'email');
  const card = page.locator('[data-rich-block="email"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /^Send/i })).toHaveCount(0);
  await expect(card.getByLabel('To', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Edit email', exact: true }).click();
  await expect(card.getByLabel('To', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Edit email', exact: true }).click();
  await expect(card.getByLabel('To', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Copy email' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, '\n')).toBe(QA_EMAIL_SOURCE);
  const subject = card.getByLabel('Subject', { exact: true });
  const reviewedSubject = 'Reviewed launch subject that wraps cleanly on a narrow screen';
  await subject.fill(reviewedSubject);
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.reload();
  await expect(
    page.locator('[data-rich-block="email"]').getByLabel('Subject', { exact: true }),
  ).toHaveValue(reviewedSubject);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => subject.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeLessThanOrEqual(1);
    await assertNoPageOverflow(page);
  }
  await evidence(page, 'email-saved');
});

test('seven writing artifacts copy independently and persist only the saved block', async ({
  page,
}) => {
  await openFixture(page, 'writing');
  const blocks = page.locator('[data-rich-block]');
  await expect(blocks).toHaveCount(7);
  await blocks.nth(2).getByRole('button', { name: 'Edit text', exact: true }).click();
  await expect(
    blocks.nth(2).getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeDisabled();
  await blocks.nth(2).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(blocks.nth(2).getByRole('textbox')).toHaveCount(0);
  for (let index = 0; index < QA_WRITING_SOURCES.length; index++) {
    const block = blocks.nth(index);
    await block
      .getByRole('button', {
        name: index === 4 ? 'Copy full prompt' : 'Copy this text',
        exact: true,
      })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      QA_WRITING_SOURCES[index]![1],
    );
  }
  await blocks.nth(2).getByRole('button', { name: 'Edit text', exact: true }).click();
  await blocks.nth(2).getByRole('textbox').fill('# Reviewed report\n\nPersist only this block.');
  await blocks.nth(2).getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.reload();
  await expect(blocks).toHaveCount(7);
  await expect(blocks.nth(2)).toContainText('Persist only this block.');
  await expect(blocks.nth(0)).toContainText(QA_WRITING_SOURCES[0][1]);
  await page.setViewportSize({ width: 320, height: 900 });
  await assertNoPageOverflow(page);
  await evidence(page, 'seven-writing-320');
});

test('project form validates, applies locally and supports keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openFixture(page, 'form');
  const form = page.getByRole('form', { name: 'Project configuration' });
  await expect(form).toBeVisible();
  for (const appearance of ['light', 'dark']) {
    await theme(page, appearance);
    const choices = await form
      .locator('input[type="radio"], button[role="checkbox"]')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const glyph = button.getBoundingClientRect();
          const target = button.closest('label')!.getBoundingClientRect();
          return {
            width: glyph.width,
            height: glyph.height,
            targetWidth: target.width,
            targetHeight: target.height,
          };
        }),
      );
    expect(choices.length).toBe(4);
    for (const choice of choices) {
      expect(choice.width).toBe(16);
      expect(choice.height).toBe(16);
      expect(choice.targetWidth).toBeGreaterThanOrEqual(44);
      expect(choice.targetHeight).toBeGreaterThanOrEqual(44);
    }
  }
  let completions = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/llm/')) completions++;
  });
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Project name');
  await expect(form.getByLabel('Project name', { exact: false })).toBeFocused();
  await form.getByLabel('Project name', { exact: false }).fill('Northstar');
  await form.getByLabel('Fictional model', { exact: false }).selectOption('Nova');
  await form.getByRole('radio', { name: 'Concise', exact: true }).focus();
  await form.getByRole('radio', { name: 'Concise', exact: true }).press('ArrowDown');
  await expect(form.getByRole('radio', { name: 'Detailed', exact: true })).toBeChecked();
  await form.getByRole('checkbox', { name: 'Web search', exact: true }).focus();
  await form.getByRole('checkbox', { name: 'Web search', exact: true }).press('Space');
  await form.getByRole('checkbox', { name: 'Code generation', exact: true }).check();
  const budget = form.getByRole('slider', { name: 'Monthly budget', exact: true });
  await budget.focus();
  await budget.press('ArrowRight');
  await form.getByLabel('Target date', { exact: true }).fill('2026-12-01');
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  const result = form.getByRole('status', { name: 'Applied values' });
  await expect(result).toContainText('Northstar');
  await expect(result).toContainText('Nova');
  await expect(result).toContainText('Detailed');
  await expect(result).toContainText('Web search, Code generation');
  await expect(result).toContainText('26 credits');
  await expect(result).toContainText('2026-12-01');
  expect(completions).toBe(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await assertNoPageOverflow(page);
  await evidence(page, 'functional-form-320');
});

test('cards and carousel use DOM navigation and expandable details', async ({ page }) => {
  await openFixture(page, 'cards');
  await expect(page.locator('[data-answer-surface="stats"]')).toBeVisible();
  await expect(page.locator('[data-answer-surface="card"]')).toHaveCount(3);
  const carousel = page.locator('[data-answer-surface="carousel"]');
  await expect(carousel.getByRole('heading', { name: 'Atlas', exact: true })).toBeVisible();
  await carousel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(carousel.getByRole('heading', { name: 'Nova', exact: true })).toBeVisible();
  await carousel.focus();
  await carousel.press('End');
  await expect(carousel.getByRole('heading', { name: 'Comet', exact: true })).toBeVisible();
  await expect(carousel.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByText('More details', { exact: true }).click();
  await expect(
    page.getByText('All product names in this example are fictional.', { exact: true }),
  ).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoPageOverflow(page);
  }
  await evidence(page, 'cards-carousel');
});

test('bar, line and pie charts are data-backed SVG and preserve labels', async ({ page }) => {
  await openFixture(page, 'charts');
  await expect(page.locator('[data-chart-kind]')).toHaveCount(3);
  await expect(page.locator('.recharts-wrapper > svg.recharts-surface')).toHaveCount(3);
  const kinds = await page
    .locator('[data-chart-kind]')
    .evaluateAll((charts) => charts.map((c) => c.getAttribute('data-chart-kind')));
  expect(kinds).toEqual(['bar', 'line', 'pie']);
  await expect(page.getByRole('table').first()).toContainText('310');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoPageOverflow(page);
  }
  await evidence(page, 'native-charts');
});

test('three diagrams stay separate and source controls preserve diagram text', async ({ page }) => {
  await openFixture(page, 'diagrams');
  await expect(page.locator('.message-text svg')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Show source', exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Copy diagram source', exact: true }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(QA_DIAGRAMS[0]);
  await page.getByRole('button', { name: 'Show source', exact: true }).first().click();
  await expect(page.getByText(/flowchart LR/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.message-text svg')).toHaveCount(3);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ['dark', 'light']) {
      await theme(page, appearance);
      const diagrams = page.locator('.mermaid-diagram');
      await expect(diagrams).toHaveCount(3);
      const drawing = await diagrams.evaluateAll((elements) => {
        const color = (value: string) => {
          const match = /^rgba?\(([^)]+)\)$/.exec(value);
          if (!match) throw new Error(`Unreadable diagram color: ${value}`);
          const parts = match[1]!.split(/[\s,]+/).map(Number);
          if (parts.length > 3 && parts[3] !== 1)
            throw new Error(`Translucent diagram color: ${value}`);
          return parts.slice(0, 3);
        };
        const luminance = (value: string) =>
          color(value)
            .map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
        const contrast = (foreground: string, background: string) => {
          const first = luminance(foreground);
          const second = luminance(background);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        return elements.map((element) => {
          const svg = element.querySelector('svg')!;
          const labels = Array.from(svg.querySelectorAll('text')).filter((label) =>
            label.textContent?.trim(),
          );
          return {
            id: svg.id,
            insidePre: Boolean(element.closest('pre')),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            labelPixels: labels.map((label) => {
              const matrix = label.getScreenCTM();
              if (!matrix) throw new Error('Diagram label has no screen geometry');
              return parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b);
            }),
            timeline: Array.from(svg.querySelectorAll('.timeline-node')).map((node) => {
              const background = node.querySelector('.node-bkg');
              const label = node.querySelector('text');
              if (!background || !label)
                throw new Error('Timeline node is missing its label or background');
              return contrast(getComputedStyle(label).fill, getComputedStyle(background).fill);
            }),
          };
        });
      });
      expect(new Set(drawing.map((diagram) => diagram.id)).size).toBe(3);
      for (const diagram of drawing) {
        expect(diagram.insidePre).toBe(false);
        expect(diagram.labelPixels.length).toBeGreaterThanOrEqual(4);
        for (const pixels of diagram.labelPixels) expect(pixels).toBeGreaterThanOrEqual(13.5);
      }
      expect(drawing[2]!.timeline.length).toBeGreaterThan(0);
      for (const ratio of drawing[2]!.timeline) expect(ratio).toBeGreaterThanOrEqual(4.5);
      if (width === 320) {
        expect(drawing.some((diagram) => diagram.scrollWidth > diagram.clientWidth)).toBe(true);
        const scroller = diagrams.nth(
          drawing.findIndex((diagram) => diagram.scrollWidth > diagram.clientWidth),
        );
        await scroller.evaluate((element) => {
          element.scrollLeft = 0;
        });
        await scroller.focus();
        await scroller.press('ArrowRight');
        await expect
          .poll(() => scroller.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
      await assertNoPageOverflow(page);
      for (let index = 0; index < 3; index++) {
        await page.getByRole('button', { name: 'Expand diagram', exact: true }).nth(index).click();
        const dialog = page.getByRole('dialog', { name: 'Diagram', exact: true });
        await expect(dialog.locator('.mermaid-diagram > svg')).toHaveCount(1);
        await expect(page.locator('.message-text svg')).toHaveCount(2);
        await expect(page.locator('.mermaid-diagram > svg')).toHaveCount(3);
        const clipped = await dialog.evaluate((element) =>
          Array.from(element.querySelectorAll('button'))
            .filter((button) => {
              const bounds = button.getBoundingClientRect();
              return (
                bounds.left < 0 ||
                bounds.right > innerWidth ||
                bounds.top < 0 ||
                bounds.bottom > innerHeight
              );
            })
            .map((button) => button.textContent),
        );
        expect(clipped).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Expand diagram', exact: true }).nth(index),
        ).toBeFocused();
      }
      await evidence(page, `three-diagrams-${width}-${appearance}`);
    }
  }
});

test('four images remain ordered independent resources through partial failure and reopen', async ({
  page,
}) => {
  await page.route('**/qa-render-image-3.svg', (route) =>
    route.fulfill({ status: 404, body: 'missing' }),
  );
  await openFixture(page, 'gallery');
  const gallery = page.locator('[data-answer-surface="gallery"]');
  await expect(gallery.locator('figure')).toHaveCount(4);
  const resources = await gallery
    .locator('[data-gallery-resource]')
    .evaluateAll((elements) => elements.map((e) => e.getAttribute('data-gallery-resource')));
  expect(resources).toEqual(['0', '1', '2', '3']);
  await expect(gallery.getByRole('button', { name: /Retry/ })).toBeVisible();
  await expect(gallery.getByRole('link', { name: /Open image:/ })).toHaveCount(4);
  await gallery
    .getByRole('button', { name: 'Copy image URL: Analytics dashboard', exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '/qa-render-image-2.svg',
  );
  await page.reload();
  await expect(gallery.locator('figure')).toHaveCount(4);
  await page.setViewportSize({ width: 320, height: 900 });
  await assertNoPageOverflow(page);
  await evidence(page, 'gallery-partial-failure-320');
});

test('ten code blocks retain exact independent Copy', async ({ page }) => {
  await openFixture(page, 'code');
  const blocks = page.locator('.code-block-container');
  await expect(blocks).toHaveCount(10);
  for (let index = 0; index < 10; index++) {
    await blocks.nth(index).getByRole('button', { name: 'Copy code', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      QA_CODE_SOURCES[index]![1],
    );
  }
});

test('calculator preview computes real results and stays isolated from its parent', async ({
  page,
}) => {
  await openFixture(page, 'calculator');
  const preview = page.locator('iframe[title="HTML preview"]');
  await expect(preview).toBeVisible();
  const outer = page.frameLocator('iframe[title="HTML preview"]');
  const frame = (await preview.getAttribute('src'))
    ? outer.frameLocator('iframe.artifact-frame')
    : outer;
  await frame.getByLabel('First number', { exact: true }).fill('2');
  await frame.getByLabel('Second number', { exact: true }).fill('3');
  await frame.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(frame.locator('output')).toHaveText('5');
  await frame.getByRole('button', { name: 'Multiply', exact: true }).click();
  await expect(frame.locator('output')).toHaveText('6');
  await frame.getByLabel('First number', { exact: true }).fill('-2');
  await frame.getByRole('button', { name: 'Multiply', exact: true }).click();
  await expect(frame.locator('output')).toHaveText('-6');
  await frame.getByLabel('First number', { exact: true }).fill('');
  await frame.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(frame.locator('output')).toHaveText('Please enter both numbers.');
  const parentAccess = await frame.locator('body').evaluate(() => {
    try {
      return { accessible: Boolean(window.top?.document.documentElement), error: null };
    } catch (error) {
      return { accessible: false, error: error instanceof Error ? error.name : 'unknown' };
    }
  });
  expect(parentAccess).toEqual({ accessible: false, error: 'SecurityError' });
  await evidence(page, 'calculator-validation');
});

test('long headings, matrix and code scroll inside their own surfaces at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openFixture(page, 'long');
  await expect(page.locator('.message-text .katex')).toHaveCount(1);
  const layout = await page.evaluate(() => {
    const heading = document.querySelector('.message-text h1')!;
    const headingRect = heading.getBoundingClientRect();
    const math = document.querySelector('.message-text .katex-html')!;
    const mathRect = (math.querySelector('.mtable') ?? math).getBoundingClientRect();
    let scroller = math.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX))
      scroller = scroller.parentElement;
    const code = document.querySelector('.code-block-body-scroll pre')!;
    return {
      heading: {
        left: headingRect.left,
        right: headingRect.right,
        height: headingRect.height,
        lineHeight: parseFloat(getComputedStyle(heading).lineHeight),
      },
      math: {
        width: mathRect.width,
        scrollerClass: scroller?.className,
        scrollWidth: scroller?.scrollWidth,
        clientWidth: scroller?.clientWidth,
      },
      code: {
        scrollWidth: code.scrollWidth,
        clientWidth: code.clientWidth,
        overflow: getComputedStyle(code).overflowX,
      },
    };
  });
  expect(layout.heading.left).toBeGreaterThanOrEqual(0);
  expect(layout.heading.right).toBeLessThanOrEqual(320);
  expect(layout.heading.height).toBeGreaterThan(layout.heading.lineHeight * 2);
  if (process.env['QA_RENDER_DEBUG'] === '1')
    console.info('[long-renderer geometry]', JSON.stringify(layout));
  expect(layout.math.width).toBeGreaterThan(320);
  expect(layout.math.scrollerClass).toContain('katex-display');
  expect(layout.math.scrollWidth).toBeGreaterThan(layout.math.clientWidth!);
  expect(layout.code.scrollWidth).toBeGreaterThan(layout.code.clientWidth);
  expect(['auto', 'scroll']).toContain(layout.code.overflow);
  await assertNoPageOverflow(page);
  await evidence(page, 'long-content-320');
});

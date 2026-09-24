import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const ROUTES = [
  '/billing',
  '/settings/privacy',
  '/settings/account',
  '/gallery',
  '/pricing',
] as const;

async function spacingResolution(page: Page) {
  return page.locator('[style*="var(--space-"]').evaluateAll((elements) => {
    const failures: string[] = [];
    let declarations = 0;

    for (const element of elements as HTMLElement[]) {
      for (const property of element.style) {
        const authored = element.style.getPropertyValue(property);
        if (!authored.includes('var(--space-')) continue;
        declarations += 1;
        const resolved = getComputedStyle(element).getPropertyValue(property);
        if (!resolved || resolved.includes('var(')) {
          failures.push(`${element.tagName.toLowerCase()}.${element.className} ${property}`);
        }
      }
    }

    return { declarations, failures };
  });
}

async function radiusResolution(page: Page) {
  return page.locator('[style*="var(--corner-"]').evaluateAll((elements) => {
    const failures: string[] = [];
    let declarations = 0;

    for (const element of elements as HTMLElement[]) {
      const authored = element.style.borderRadius;
      if (!authored.includes('var(--corner-')) continue;
      declarations += 1;
      const resolved = getComputedStyle(element).borderRadius;
      if (!resolved || resolved.includes('var(')) {
        failures.push(`${element.tagName.toLowerCase()}.${element.className}`);
      }
    }

    return { declarations, failures };
  });
}

test('inline spacing resolves through the shared ladder on representative surfaces', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);

  const rootTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Array.from({ length: 10 }, (_, index) =>
      style.getPropertyValue(`--space-${index + 1}`).trim(),
    );
  });
  expect(rootTokens).toEqual([
    '4px',
    '8px',
    '12px',
    '16px',
    '24px',
    '32px',
    '48px',
    '64px',
    '96px',
    '128px',
  ]);

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (route.startsWith('/settings/') || route === '/billing') {
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    }
    await page
      .locator('[style*="var(--space-"]')
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 });

    const report = await spacingResolution(page);
    expect(
      report.declarations,
      `${route} should exercise tokenized inline spacing`,
    ).toBeGreaterThan(0);
    expect(report.failures, `${route} has unresolved spacing variables`).toEqual([]);
  }
});

test('shared radius tokens, utilities and inline styles resolve in the browser', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

  const rootTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return [
      'detail',
      'compact',
      'control',
      'field',
      'menu',
      'surface',
      'panel',
      'overlay',
      'hero',
      'pill',
    ].map((name) => style.getPropertyValue(`--corner-${name}`).trim());
  });
  expect(rootTokens).toEqual([
    '2px',
    '4px',
    '6px',
    '8px',
    '10px',
    '12px',
    '16px',
    '24px',
    '32px',
    '9999px',
  ]);

  const generatedUtilities = await page.evaluate(() => {
    const sample = document.createElement('div');
    sample.className = 'rounded-compact rounded-t-menu';
    document.body.append(sample);
    const style = getComputedStyle(sample);
    const result = {
      topLeft: style.borderTopLeftRadius,
      topRight: style.borderTopRightRadius,
      bottomRight: style.borderBottomRightRadius,
      bottomLeft: style.borderBottomLeftRadius,
    };
    sample.remove();
    return result;
  });
  expect(generatedUtilities).toEqual({
    topLeft: '10px',
    topRight: '10px',
    bottomRight: '4px',
    bottomLeft: '4px',
  });

  for (const route of ['/pricing', '/gallery', '/settings/account'] as const) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (route.startsWith('/settings/')) {
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    }
    await page
      .locator('[style*="var(--corner-"]')
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 });
    const report = await radiusResolution(page);
    expect(report.declarations, `${route} should exercise tokenized inline radii`).toBeGreaterThan(
      0,
    );
    expect(report.failures, `${route} has unresolved radius variables`).toEqual([]);
  }
});

test('shared motion tokens and utilities resolve in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });

  const rootTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      durations: ['instant', 'quick', 'moved', 'reveal'].map((name) =>
        style.getPropertyValue(`--duration-${name}`).trim(),
      ),
      curves: ['standard', 'exit', 'spring', 'reveal'].map((name) =>
        style.getPropertyValue(`--curve-${name}`).trim(),
      ),
    };
  });
  expect(rootTokens).toEqual({
    durations: ['90ms', '.16s', '.26s', '.7s'],
    curves: [
      'cubic-bezier(.2, 0, 0, 1)',
      'cubic-bezier(.4, 0, 1, 1)',
      'cubic-bezier(.22, 1.2, .36, 1)',
      'cubic-bezier(.22, 1, .36, 1)',
    ],
  });

  const generatedUtilities = await page.evaluate(() => {
    const classes = [
      'duration-instant ease-standard',
      'duration-quick ease-exit',
      'duration-moved ease-spring',
      'duration-reveal ease-reveal',
    ];
    return classes.map((className) => {
      const sample = document.createElement('div');
      sample.className = `transition ${className}`;
      document.body.append(sample);
      const style = getComputedStyle(sample);
      const result = {
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
      };
      sample.remove();
      return result;
    });
  });
  expect(generatedUtilities).toEqual([
    { duration: '0.09s', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    { duration: '0.16s', easing: 'cubic-bezier(0.4, 0, 1, 1)' },
    { duration: '0.26s', easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)' },
    { duration: '0.7s', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  ]);

  const liveQuickMotion = page.locator('[class*="duration-quick"]').first();
  await expect(liveQuickMotion).toBeAttached({ timeout: 15_000 });
  await expect
    .poll(() => liveQuickMotion.evaluate((element) => getComputedStyle(element).transitionDuration))
    .toBe('0.16s');

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  const marketingAlias = await page.evaluate(() => {
    const designScope = document.querySelector("[data-design='agi']");
    if (!(designScope instanceof HTMLElement)) throw new Error('Marketing design scope missing');
    const sample = document.createElement('div');
    sample.style.transition = 'opacity var(--agi-dur-fast) var(--agi-ease-out)';
    designScope.append(sample);
    const style = getComputedStyle(sample);
    const result = {
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
    };
    sample.remove();
    return result;
  });
  expect(marketingAlias).toEqual({
    duration: '0.16s',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  });
});

test('shared stacking tokens and utilities resolve in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });

  const generatedLayers = await page.evaluate(() => {
    const names = ['base', 'control', 'overlay', 'modal', 'popover', 'notification', 'skip-link'];
    return names.map((name) => {
      const sample = document.createElement('div');
      sample.className = `z-[var(--z-${name})]`;
      document.body.append(sample);
      const result = getComputedStyle(sample).zIndex;
      sample.remove();
      return result;
    });
  });
  expect(generatedLayers).toEqual(['0', '10', '200', '300', '350', '400', '10000']);

  const composer = page.locator('.chat-composer-container');
  await expect(composer).toBeAttached({ timeout: 15_000 });
  await expect
    .poll(() => composer.evaluate((element) => getComputedStyle(element).zIndex))
    .toBe('20');

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  const marketingHeader = page
    .locator("[data-design='agi'] .agi-top, [data-design='agi'] .agi-ds-header")
    .first();
  await expect(marketingHeader).toBeAttached({ timeout: 15_000 });
  await expect
    .poll(() => marketingHeader.evaluate((element) => getComputedStyle(element).zIndex))
    .toBe('70');
});

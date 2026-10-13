import { expect, test } from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  buildCookieConsentRecord,
} from '../shared/lib/cookie-consent';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test.describe(`public stylesheet with motion ${reducedMotion}`, () => {
    test.use({ reducedMotion, storageState: { cookies: [], origins: [] } });

    test('reduces real geometry transitions without removing normal-mode transitions', async ({
      page,
    }) => {
      await page.addInitScript(([key, record]) => window.localStorage.setItem(key, record), [
        COOKIE_CONSENT_STORAGE_KEY,
        JSON.stringify(buildCookieConsentRecord(NECESSARY_ONLY_PREFERENCES)),
      ] as const);
      expect((await page.goto('/providers'))?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      const control = page.locator('[data-design="agi"] .agi-ds-btn').first();
      await expect(control).toBeAttached();
      const controlTransition = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });
      if (reducedMotion === 'reduce') {
        expect(controlTransition.property).toBe('none');
        expect(controlTransition.duration).toBe('0s');
      } else {
        expect(controlTransition.property).toContain('background-color');
        expect(controlTransition.duration.split(',').some((value) => parseFloat(value) > 0)).toBe(
          true,
        );
      }

      await page.addStyleTag({
        content: `
        body { transition:padding-bottom 1s linear; }
        #motion-regression { position:fixed; top:20px; left:20px; width:40px; height:40px;
          border:1px solid currentColor; box-sizing:border-box;
          transition:transform 1s linear, width 1s linear; }
        #motion-regression::before, #motion-regression::after { content:""; position:absolute;
          width:10px; height:10px; border:1px solid currentColor;
          transition:transform 1s linear; }
        #motion-regression::after { top:15px; }
        body[data-motion-regression="changed"] { padding-bottom:80px; }
        body[data-motion-regression="changed"] #motion-regression { transform:translateX(80px); width:80px; }
        body[data-motion-regression="changed"] #motion-regression::before,
        body[data-motion-regression="changed"] #motion-regression::after { transform:translateX(20px); }
      `,
      });
      const measurement = await page.evaluate(async () => {
        const fixture = document.createElement('div');
        fixture.id = 'motion-regression';
        document.body.append(fixture);
        const transition = (element: Element, pseudo?: string) => {
          const style = getComputedStyle(element, pseudo);
          return {
            property: style.transitionProperty,
            duration: style.transitionDuration,
            x: style.transform === 'none' ? 0 : new DOMMatrix(style.transform).m41,
          };
        };
        const sample = () => ({
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          width: fixture.getBoundingClientRect().width,
          paddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
          body: transition(document.body),
          element: transition(fixture),
          before: transition(fixture, '::before'),
          after: transition(fixture, '::after'),
          active: [
            ...document.body.getAnimations(),
            ...fixture.getAnimations({ subtree: true }),
          ].filter((animation) => animation.playState === 'running' || animation.pending).length,
        });
        sample();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const before = sample();
        document.body.dataset['motionRegression'] = 'changed';
        return { before, immediate: sample() };
      });

      expect(measurement.before.width).toBe(40);
      expect(measurement.before.element.x).toBe(0);
      expect(measurement.immediate.reduced).toBe(reducedMotion === 'reduce');
      if (reducedMotion === 'reduce') {
        expect(measurement.immediate.width).toBe(80);
        expect(measurement.immediate.element.x).toBe(80);
        expect(measurement.immediate.before.x).toBe(20);
        expect(measurement.immediate.after.x).toBe(20);
        expect(measurement.immediate.paddingBottom).toBe(80);
        expect(measurement.immediate.active).toBe(0);
        for (const entry of [
          measurement.immediate.body,
          measurement.immediate.element,
          measurement.immediate.before,
          measurement.immediate.after,
        ]) {
          expect(entry.property).toBe('none');
          expect(entry.duration).toBe('0s');
        }
      } else {
        expect(measurement.immediate.body.property).toBe('padding-bottom');
        expect(measurement.immediate.element.property).toContain('transform');
        expect(measurement.immediate.before.property).toBe('transform');
        expect(measurement.immediate.after.property).toBe('transform');
        expect(measurement.immediate.width).toBeLessThan(80);
        expect(measurement.immediate.element.x).toBeLessThan(80);
        expect(measurement.immediate.active).toBeGreaterThan(0);
      }
    });
  });
}

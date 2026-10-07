import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../../shared/lib/cookie-consent';
import { measurePublicFontProof, settlePublicPage } from '../lib/public-page-readiness';
import { scanPublicTypography } from '../lib/public-typography';
import { evaluatePublicTextContrast } from '../lib/public-text-contrast';

import {
  FOOTER_MAX_HEIGHT_PX,
  FOOTER_REPOSITORY_ROOT,
  FOOTER_SAMPLE_ROUTES,
  FOOTER_THEMES,
  FOOTER_WIDTHS,
  equalFooterState,
  footerFocusReturn,
  footerLegacyRules,
  footerNativeImages,
  footerSourceSnapshot,
  stableFooterState,
} from '../lib/public-footer-capture';

test.use({ storageState: { cookies: [], origins: [] } });

const selectedPaths = process.env['PUBLIC_DESIGN_ROUTES']?.split(',');
const selectedWidths = process.env['PUBLIC_DESIGN_WIDTHS']?.split(',').map(Number);
const routes = FOOTER_SAMPLE_ROUTES.filter(
  (route) => !selectedPaths || selectedPaths.includes(route.pathname),
);
const widths = FOOTER_WIDTHS.filter((width) => !selectedWidths || selectedWidths.includes(width));

test.describe('shared footer measured readability and controls', () => {
  for (const route of routes) {
    for (const width of widths) {
      for (const theme of FOOTER_THEMES) {
        test(`footer measured ${route.name} at ${width}px ${theme}`, async ({
          browser,
          baseURL,
        }, testInfo) => {
          const evidence: Record<string, unknown> = {
            route,
            width,
            theme,
            repeatEachIndex: testInfo.repeatEachIndex,
            contextClosed: false,
            limits: [
              'Three representative footer callers only, not all public pages.',
              'Reduced-motion native viewport screenshots with footer coverage, not the static mockup capture contract, production CSS ordering, normal motion or full-page acceptance.',
              'Source snapshots cover declared inputs, not every transitive dependency or runtime value.',
            ],
          };
          let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
          let failure: unknown;
          try {
            if (!baseURL) throw new Error('Footer measurement requires a base URL');
            evidence['sourceStart'] = footerSourceSnapshot();
            context = await browser.newContext({
              baseURL,
              viewport: { width, height: 844 },
              colorScheme: theme,
              reducedMotion: 'reduce',
              hasTouch: width < 1024,
              storageState: { cookies: [], origins: [] },
            });
            expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
            const page = await context.newPage();
            const destination = new URL(route.pathname, baseURL);
            const expectation = {
              path: route.pathname,
              expectedHttpStatuses: [200],
              expectedFinalPath: destination.pathname,
              expectedOrigin: destination.origin,
              expectedQuery: destination.search,
            };
            evidence['initialReadiness'] = await settlePublicPage(page, expectation);
            const consentBanner = page.getByRole('region', { name: 'Cookie consent', exact: true });
            await expect(consentBanner).toBeVisible();
            await consentBanner
              .getByRole('button', { name: 'Necessary only', exact: true })
              .click();
            await expect(consentBanner).toHaveCount(0);
            const consent = parseCookieConsentRecord(
              await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
            );
            expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
            expect(isCookieConsentCurrent(consent)).toBe(true);
            evidence['readiness'] = await settlePublicPage(page, expectation);
            const footer = page.getByRole('contentinfo');
            await expect(footer).toHaveCount(1);
            await expect(footer).toHaveClass(/agi-ds-footer/u);
            const scopeSelector = 'footer.agi-ds-footer';
            const ownership = await footer.evaluate(
              (root, selector) => ({
                matches: document.querySelectorAll(selector).length,
                sameElement: document.querySelector(selector) === root,
                elementIndex: [...document.querySelectorAll('*')].indexOf(root),
                tag: root.localName,
                label: root.getAttribute('aria-label'),
              }),
              scopeSelector,
            );
            expect(ownership.matches).toBe(1);
            expect(ownership.sameElement).toBe(true);
            await footer.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            const measuredState = await stableFooterState(page, footer);
            evidence['footerHeight'] = measuredState.rect.height;
            if (width >= 1024)
              expect.soft(measuredState.rect.height).toBeLessThanOrEqual(FOOTER_MAX_HEIGHT_PX);
            let fontFailure: unknown;
            try {
              evidence['fontProof'] = await measurePublicFontProof(page, footer, [
                { cssVariable: '--font-geist-sans' },
              ]);
            } catch (error) {
              fontFailure = error;
              evidence['fontProofError'] = String(error);
            }
            expect.soft(fontFailure, 'Footer font proof').toBeUndefined();
            const typography = await page.evaluate(scanPublicTypography, {
              pageType: 'marketing' as const,
              pathname: route.pathname,
              scopeSelector,
            });
            evidence['typography'] = typography;
            expect.soft(typography.scope).toEqual({
              selector: scopeSelector,
              elementIndex: ownership.elementIndex,
              tag: ownership.tag,
              label: ownership.label,
            });
            expect.soft(typography.samples.length).toBeGreaterThan(0);
            const rawTextCount = await footer.evaluate((root) => {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              let count = 0;
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (
                  node.textContent?.trim() &&
                  !node.parentElement?.closest('script,style,noscript')
                )
                  count += 1;
              }
              return count;
            });
            evidence['rawTextCount'] = rawTextCount;
            expect.soft(rawTextCount).toBeGreaterThan(0);
            expect.soft(typography.coverage.textNodes).toBe(rawTextCount);
            expect
              .soft(typography.samples.filter((sample) => sample.kind === 'text').length)
              .toBe(rawTextCount);
            expect
              .soft(new Set(typography.samples.map((sample) => sample.sourceKey)).size)
              .toBe(typography.samples.length);
            expect.soft(typography.findings).toEqual([]);
            expect.soft(typography.unmeasured).toEqual([]);
            expect.soft(typography.excluded).toEqual([]);
            const contrast = typography.canvasColor
              ? evaluatePublicTextContrast(typography.samples, typography.canvasColor)
              : null;
            evidence['contrast'] = contrast;
            expect.soft(contrast).not.toBeNull();
            if (contrast) {
              expect.soft(contrast.findings).toEqual([]);
              expect.soft(contrast.unmeasured).toEqual([]);
              expect.soft(contrast.coverage.measured).toBe(typography.samples.length);
            }
            const pointer = await page.evaluate(() => ({
              coarse: matchMedia('(pointer: coarse)').matches,
              touch: navigator.maxTouchPoints,
            }));
            evidence['pointer'] = pointer;
            const targetMinimum = pointer.coarse ? 44 : 24;
            const targets = await footer.locator('a[href],button').evaluateAll((elements) =>
              elements.map((element) => {
                const rect = element.getBoundingClientRect();
                const css = getComputedStyle(element);
                return {
                  text: element.textContent,
                  width: rect.width,
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  display: css.display,
                  visibility: css.visibility,
                  disabled: element.hasAttribute('disabled'),
                  tabindex: element.tabIndex,
                  pointerEvents: css.pointerEvents,
                  inert: element.closest('[inert]') !== null,
                  ariaDisabled: element.getAttribute('aria-disabled'),
                };
              }),
            );
            evidence['targets'] = targets;
            expect.soft(targets.length).toBeGreaterThan(0);
            for (const target of targets) {
              expect.soft(target.width, target.text ?? '').toBeGreaterThanOrEqual(targetMinimum);
              expect.soft(target.height, target.text ?? '').toBeGreaterThanOrEqual(targetMinimum);
              expect.soft(target.left, target.text ?? '').toBeGreaterThanOrEqual(0);
              expect.soft(target.right, target.text ?? '').toBeLessThanOrEqual(width);
              expect.soft(target.disabled).toBe(false);
              expect.soft(target.inert).toBe(false);
              expect.soft(target.ariaDisabled).not.toBe('true');
              expect.soft(target.tabindex).toBeGreaterThanOrEqual(0);
              expect.soft(target.pointerEvents).not.toBe('none');
            }
            const columns = footer.getByRole('navigation', { name: 'Footer', exact: true });
            await expect(columns).toHaveCount(route.condensed ? 0 : 1);
            await expect(
              footer.getByRole('navigation', { name: 'Legal', exact: true }),
            ).toHaveCount(1);
            expect
              .soft(
                await footer
                  .locator('.agi-ds-footer-legal')
                  .evaluate((element) => getComputedStyle(element).fontSize),
              )
              .toBe('14px');
            if (!route.condensed) {
              const tracks = await columns.evaluate(
                (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
              );
              evidence['columns'] = tracks;
              const brandSize = await footer
                .locator('.agi-ds-footer-statement')
                .evaluate((element) => getComputedStyle(element).fontSize);
              expect.soft(brandSize).toBe('17px');
              const phraseLines = await footer
                .getByText('AI-assisted', { exact: true })
                .evaluate((element) => {
                  const range = document.createRange();
                  range.selectNodeContents(element);
                  return range.getClientRects().length;
                });
              evidence['brandPhraseLines'] = phraseLines;
              expect.soft(phraseLines).toBe(1);
              const navigationSizes = await columns
                .getByRole('heading', { level: 2 })
                .evaluateAll((headings) =>
                  headings.map((element) => getComputedStyle(element).fontSize),
                );
              expect.soft(navigationSizes).toEqual(Array(5).fill('16px'));
              const linkSizes = await columns
                .getByRole('link')
                .evaluateAll((links) => links.map((element) => getComputedStyle(element).fontSize));
              expect.soft(linkSizes.length).toBeGreaterThan(0);
              expect.soft(linkSizes.every((size) => size === '16px')).toBe(true);
              expect.soft(tracks).toBe(width >= 1024 ? 5 : width >= 768 ? 3 : 2);
            }
            const header = page.getByRole('banner');
            await expect(header).toHaveCount(1);
            evidence['nativeViews'] = await footerNativeImages(
              page,
              footer,
              testInfo,
              measuredState,
            );
            const controls = footer.locator('a[href],button');
            await controls.first().focus();
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.press('Tab');
            for (let index = 0; index < (await controls.count()); index += 1) {
              const control = controls.nth(index);
              await expect(control).toBeFocused();
              await expect(control).toBeVisible();
              const controlFocus = await control.evaluate((element) => ({
                visible: element.matches(':focus-visible'),
                style: getComputedStyle(element).outlineStyle,
                width: parseFloat(getComputedStyle(element).outlineWidth),
              }));
              expect.soft(controlFocus.visible).toBe(true);
              expect.soft(controlFocus.style).not.toBe('none');
              expect.soft(controlFocus.width).toBeGreaterThan(0);
              await control.click({ trial: true });
              if (index + 1 < (await controls.count())) await page.keyboard.press('Tab');
            }
            evidence['footerNativeTabOrderAndActionability'] = true;
            const opener = footer.getByRole('button', { name: 'Cookie preferences', exact: true });
            await opener.focus();
            await expect(opener).toBeFocused();
            const focusStyle = await opener.evaluate((element) => {
              const css = getComputedStyle(element);
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const pen = canvas.getContext('2d');
              if (!pen) throw new Error('Focus color probe is unavailable');
              pen.fillStyle = css.outlineColor;
              pen.fillRect(0, 0, 1, 1);
              return {
                style: css.outlineStyle,
                width: parseFloat(css.outlineWidth),
                color: css.outlineColor,
                alpha: pen.getImageData(0, 0, 1, 1).data[3],
                focusVisible: element.matches(':focus-visible'),
              };
            });
            evidence['focusStyle'] = focusStyle;
            expect.soft(focusStyle.style).not.toBe('none');
            expect.soft(focusStyle.width).toBeGreaterThan(0);
            expect.soft(focusStyle.alpha).toBe(255);
            expect.soft(focusStyle.focusVisible).toBe(true);
            await page.keyboard.press('Space');
            const dialog = page.getByRole('dialog', { name: 'Cookie preferences', exact: true });
            await expect(dialog).toBeVisible();
            await expect(dialog.locator(':focus')).toHaveCount(1);
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            evidence['cookieKeyboardOpenedAndClosed'] = true;
            evidence['cookieFocusImmediatelyReturned'] = await opener.evaluate(
              (element) => element === document.activeElement,
            );
            const focusReturn = await footerFocusReturn(opener);
            evidence['cookieFocusAtWaitStart'] = focusReturn.immediatelyReturned;
            evidence['cookieFocusReturned'] = focusReturn.returned;
            expect.soft(evidence['cookieFocusReturned']).toBe(true);
            const accessibility = await new AxeBuilder({ page: page as never })
              .include(scopeSelector)
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze();
            evidence['scopedAccessibility'] = accessibility;
            expect
              .soft(
                accessibility.violations.filter((item) =>
                  ['serious', 'critical'].includes(item.impact ?? ''),
                ),
              )
              .toEqual([]);
            expect
              .soft(
                accessibility.incomplete.filter((item) =>
                  ['serious', 'critical'].includes(item.impact ?? ''),
                ),
              )
              .toEqual([]);
            evidence['themeState'] = await page.evaluate(() => ({
              marker: document.documentElement.dataset['theme'],
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
              scheme: getComputedStyle(document.documentElement).colorScheme,
              prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
            }));
            expect(evidence['themeState']).toEqual({
              marker: theme,
              light: theme === 'light',
              dark: theme === 'dark',
              scheme: theme,
              prefersDark: theme === 'dark',
            });
            const legacySource = execFileSync(
              'git',
              ['show', 'HEAD:apps/web/features/marketing/components/system/system.css'],
              { cwd: FOOTER_REPOSITORY_ROOT, encoding: 'utf8' },
            );
            const legacy = await footerLegacyRules(page, legacySource);
            expect(legacy.selectors).toBeGreaterThan(0);
            expect(legacy.content).toContain('.agi-ds-footer-brand');
            expect(legacy.content).toContain('.agi-ds-footer-wordmark');
            expect(legacy.content).toContain('.agi-ds-footer-legal');
            const beforeLegacy = await stableFooterState(page, footer);
            await page.addStyleTag({ content: legacy.content });
            await equalFooterState(
              await stableFooterState(page, footer),
              beforeLegacy,
              'Footer changes when committed base rules load after scoped CSS',
            );
            evidence['committedBaseFooterIsolation'] = {
              fullSourceHash: createHash('sha256').update(legacySource).digest('hex'),
              selectors: legacy.selectors,
              injectedRulesHash: createHash('sha256').update(legacy.content).digest('hex'),
              unchanged: true,
              limit:
                'Only committed base footer selectors injected late; this does not verify production CSS chunks or page styles outside the footer.',
            };
            if (testInfo.errors.length)
              throw new Error('Footer has failed or unmeasured witnesses');
          } catch (error) {
            failure = error;
          } finally {
            try {
              await context?.close();
              evidence['contextClosed'] = context !== undefined;
            } catch (error) {
              failure ??= error;
              evidence['contextCloseError'] = String(error);
            }
            try {
              evidence['sourceEnd'] = footerSourceSnapshot();
              evidence['sourceUnchanged'] =
                JSON.stringify(evidence['sourceStart']) === JSON.stringify(evidence['sourceEnd']);
              if (!evidence['sourceUnchanged'])
                failure ??= new Error('Footer source changed during measurement');
            } catch (error) {
              failure ??= error;
            }
            evidence['status'] = failure ? 'failed' : 'passed';
            if (failure)
              evidence['error'] = failure instanceof Error ? failure.message : String(failure);
            const evidencePath = testInfo.outputPath('footer-measurement.json');
            writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
            await testInfo.attach('footer-measurement.json', {
              path: evidencePath,
              contentType: 'application/json',
            });
          }
          if (failure) throw failure;
        });
      }
    }
  }
});

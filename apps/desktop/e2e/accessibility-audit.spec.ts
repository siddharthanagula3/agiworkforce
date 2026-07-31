/**
 * Blocking WCAG 2.1 A/AA audit for the reachable Desktop cloud-web sign-in.
 *
 * The Desktop E2E harness serves the same React tree used by the Tauri shell
 * with VITE_BUILD_TARGET=web. The signed-out surface does not require secrets,
 * which keeps the audit deterministic in CI while still exercising rendered
 * product UI rather than an isolated component.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target)
        .slice(0, 5)
        .join(', ');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}; ${targets}`;
    })
    .join('\n');
}

test.describe('Desktop accessibility audit — WCAG 2.1 A/AA', () => {
  test('cloud sign-in has no automated WCAG violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

    expect(
      results.violations,
      `Accessibility violations on cloud sign-in:\n${formatViolations(results.violations)}`,
    ).toEqual([]);
  });
});


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

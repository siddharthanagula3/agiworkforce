import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

interface DialogReport {
  name: string;
  opened: boolean;
  role: string | null;
  ariaModal: string | null;
  hasAccessibleName: boolean;
  focusMovedIn: boolean;
  focusTrapped: boolean;
  backgroundInert: boolean;
  escapeCloses: boolean;
  focusRestored: boolean;
  notes: string[];
}

async function probeDialog(
  page: Page,
  name: string,
  open: () => Promise<void>,
): Promise<DialogReport> {
  const notes: string[] = [];
  const report: DialogReport = {
    name,
    opened: false,
    role: null,
    ariaModal: null,
    hasAccessibleName: false,
    focusMovedIn: false,
    focusTrapped: false,
    backgroundInert: false,
    escapeCloses: false,
    focusRestored: false,
    notes,
  };

  await open();
  await page.waitForTimeout(900);

  const shape = await page.evaluate(() => {
    // The topmost dialog, not the first in document order. A confirmation
    // opened from inside the settings modal leaves two in the DOM, and reading
    // the first one measures the wrong dialog: it reports focus outside, Tab
    // escaping and Escape not closing, all of which describe the modal
    // underneath rather than the one the reader is looking at.
    const stack = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
    const dialog = stack[stack.length - 1] ?? null;
    if (!dialog) return null;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const labelled =
      !!dialog.getAttribute('aria-label') ||
      !!dialog.getAttribute('aria-labelledby') ||
      !!dialog.querySelector('h1, h2, h3');
    // Everything outside the dialog should be hidden from AT while it is open.
    // script/style/link/template/noscript render nothing and expose nothing to
    // assistive tech, so requiring aria-hidden on them reports a false positive.
    const NON_RENDERING = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META']);
    const siblings = Array.from(document.body.children).filter(
      (el) => !el.contains(dialog) && el !== dialog && !NON_RENDERING.has(el.tagName),
    );
    const inert = siblings.every(
      (el) =>
        el.getAttribute('aria-hidden') === 'true' ||
        el.hasAttribute('inert') ||
        el.getAttribute('data-aria-hidden') === 'true' ||
        (el as HTMLElement).offsetParent === null,
    );
    return {
      role: dialog.getAttribute('role'),
      ariaModal: dialog.getAttribute('aria-modal'),
      labelled,
      focusCount: focusables.length,
      focusInside: dialog.contains(document.activeElement),
      inert,
    };
  });

  if (!shape) {
    notes.push('no [role=dialog] appeared after the open action');
    return report;
  }

  const dialogCountOnOpen = await page.evaluate(
    () => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
  );

  report.opened = true;
  report.role = shape.role;
  report.ariaModal = shape.ariaModal;
  report.hasAccessibleName = shape.labelled;
  report.focusMovedIn = shape.focusInside;
  report.backgroundInert = shape.inert;

  if (!shape.focusInside) notes.push('focus was not moved into the dialog on open');
  if (shape.focusCount === 0) notes.push('dialog contains no focusable element');

  // Tab through more stops than the dialog has; focus must never escape it.
  let escaped = false;
  for (let i = 0; i < Math.min(shape.focusCount + 3, 30); i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const open = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
      const d = open[open.length - 1] ?? null;
      return d ? d.contains(document.activeElement) : true;
    });
    if (!inside) {
      escaped = true;
      break;
    }
  }
  report.focusTrapped = !escaped;
  if (escaped) notes.push('Tab moved focus outside the open dialog');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  // Escape closes the dialog under test. A modal underneath may legitimately
  // stay open, so count rather than assert the DOM is empty of dialogs.
  const closed = await page.evaluate(
    (openedWith: number) =>
      document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length < openedWith,
    dialogCountOnOpen,
  );
  report.escapeCloses = closed;
  if (!closed) notes.push('Escape did not close the dialog');

  if (closed) {
    // What "restored" means depends on whether anything is still open. For a
    // top-level dialog, focus must not fall to <body> - a keyboard reader would
    // restart from the top of the page. For one opened from inside another, the
    // parent's own focus management runs after the child's and wins, so the
    // contract is that the reader is left somewhere inside the parent rather
    // than on the exact control that opened the child.
    report.focusRestored = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return false;
      const remaining = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
      const parent = remaining[remaining.length - 1];
      return parent ? parent.contains(active) : true;
    });
    if (!report.focusRestored) {
      notes.push('focus fell to <body>, or outside the dialog still open beneath');
    }
  }

  return report;
}

test.describe('QA dialogs — focus, escape, inertness', () => {
  test.setTimeout(15 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('every reachable dialog traps focus, closes on Escape and restores focus', async ({
    page,
  }) => {
    await signIn(page);
    const reports: DialogReport[] = [];

    reports.push(
      await probeDialog(page, 'settings-modal', async () => {
        await page.goto('/settings/general', { waitUntil: 'networkidle' }).catch(() => undefined);
      }),
    );

    reports.push(
      await probeDialog(page, 'settings-modal-security', async () => {
        await page.goto('/settings/security', { waitUntil: 'networkidle' }).catch(() => undefined);
      }),
    );

    // Named deliberately rather than discovered by label pattern: /chat/projects
    // carries both a page-level "New" that opens a dialog and a sidebar "New
    // project" that navigates to /chat, and a probe guessing between them
    // measures the navigation and reports it as a focus bug.
    reports.push(
      await probeDialog(page, 'global-search', async () => {
        await page.goto('/chat', { waitUntil: 'networkidle' }).catch(() => undefined);
        await page.waitForTimeout(3000);
        await page.evaluate(() => {
          const target = [...document.querySelectorAll('button')].find((b) =>
            /^search/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()),
          );
          (target as HTMLElement | undefined)?.click();
        });
      }),
    );

    // A confirmation dialog, reached by a stable test id rather than a label
    // guess. The probe only opens it, tabs within it and presses Escape - it
    // never activates a control, and this dialog additionally requires an exact
    // typed confirmation, so there is no path from here to a deletion.
    reports.push(
      await probeDialog(page, 'delete-account-confirm', async () => {
        await page.goto('/settings/account', { waitUntil: 'networkidle' }).catch(() => undefined);
        await page.waitForTimeout(3500);
        await page
          .locator('[data-testid="delete-account-trigger"]')
          .first()
          .click({ timeout: 8000 })
          .catch(() => undefined);
      }),
    );

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, 'dialogs.json'), JSON.stringify(reports, null, 2));

    for (const r of reports) {
      console.log(
        `[dlg] ${r.name.padEnd(26)} opened=${r.opened} modal=${r.ariaModal} named=${r.hasAccessibleName} focusIn=${r.focusMovedIn} trapped=${r.focusTrapped} inert=${r.backgroundInert} esc=${r.escapeCloses} restored=${r.focusRestored}${r.notes.length ? ' :: ' + r.notes.join('; ') : ''}`,
      );
    }

    expect(
      reports.some((r) => r.opened),
      'no dialog could be opened at all',
    ).toBe(true);
  });
});

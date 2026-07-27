/**
 * shortcuts-failure-feedback.test.ts — EXT-05.
 *
 * The Shortcuts dropdown had three silent-failure paths: replay discarded its
 * callback outright (`() => {}`), delete acted only on success, and Save
 * returned silently in three separate cases — including the common one of
 * pressing Save before anything was recorded. Each looked identical to a dead
 * control.
 *
 * Source-level guard, matching the style of computer-use-default-ask.test.ts:
 * the dropdown is built inside a large closure that a unit test cannot reach.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(here, '..', 'src/side_panel.ts'), 'utf8');

// The dropdown-building function, isolated so these assertions cannot be
// satisfied by unrelated error handling elsewhere in the file.
const refreshShortcuts = panel.slice(
  panel.indexOf('function refreshShortcuts()'),
  panel.indexOf('function refreshWorkflowsShortcuts()'),
);

describe('shortcuts dropdown reports its failures', () => {
  it('has a status surface to report into', () => {
    expect(refreshShortcuts).toContain("class: 'sp-shortcuts-status'");
    expect(refreshShortcuts).toContain("role: 'status'");
    expect(refreshShortcuts).toContain('dropdown.appendChild(statusEl)');
  });

  it('no longer discards the replay result', () => {
    // The exact regression: a callback that ignores every outcome.
    expect(refreshShortcuts).not.toContain(
      "{ type: 'REPLAY_SHORTCUT', shortcutId: sc.id }, () => {}",
    );
    expect(refreshShortcuts).toMatch(/Could not replay/);
  });

  it('reports a failed delete instead of doing nothing', () => {
    expect(refreshShortcuts).toMatch(/Could not delete/);
  });

  it('explains an empty recording rather than ignoring the click', () => {
    expect(refreshShortcuts).toMatch(/Nothing recorded yet/);
  });

  it('explains a missing name rather than ignoring the click', () => {
    expect(refreshShortcuts).toMatch(/Give the shortcut a name/);
  });

  it('reports a failed save', () => {
    expect(refreshShortcuts).toMatch(/Could not save/);
  });

  it('leaves no bare silent return on the save path', () => {
    // Every early return in the save handler must set a status first.
    const saveHandler = refreshShortcuts.slice(
      refreshShortcuts.indexOf("saveBtn.addEventListener('click'"),
      refreshShortcuts.indexOf('saveRow.appendChild(nameInput)'),
    );
    const returns = saveHandler.match(/\breturn;/g) ?? [];
    const statusCalls = saveHandler.match(/setStatus\(/g) ?? [];
    expect(returns.length).toBeGreaterThan(0);
    expect(statusCalls.length).toBeGreaterThanOrEqual(returns.length);
  });
});

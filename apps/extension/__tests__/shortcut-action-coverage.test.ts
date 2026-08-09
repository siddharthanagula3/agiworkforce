/**
 * Coverage contract between `ALLOWED_SHORTCUT_ACTION_TYPES` in
 * `src/background/policy.ts` and the `executePlannedAction` switch in
 * `src/content.ts`.
 *
 * The allowlist is the save-time gate for shortcut and scheduled-task plans;
 * the switch is the only thing that executes them. When the allowlist is the
 * wider of the two, the extra type strings are not a feature — they are
 * reserved payload slots that a hostile allowlisted page can plant today and
 * that start executing the day someone adds the matching `case`. Eight of them
 * (the computer-use bridge passthroughs) sat there for exactly that reason:
 * their only producer, `planActionsFromBrowserTool`, had no caller — the
 * computer-use agent drives the page through `cdpDriver` instead — and that
 * producer plus its `browserTool` bridge were deleted alongside the entries.
 *
 * The switch is parsed from source rather than imported: `content.ts` is a
 * content-script entrypoint with module-load side effects. Source scanning is
 * the established pattern here (see `message-policy-coverage.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_SHORTCUT_ACTION_TYPES, validateShortcutActions } from '../src/background/policy';

const contentSource = readFileSync(resolve(process.cwd(), 'src/content.ts'), 'utf8');

/**
 * Body of `executePlannedAction`, from its declaration to the first column-0
 * closing brace. Bounding the slice keeps the message dispatcher's own switch
 * out of the scan.
 */
function readExecutorBody(): string {
  const start = contentSource.indexOf('async function executePlannedAction(');
  expect(start).toBeGreaterThan(-1);
  const end = contentSource.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return contentSource.slice(start, end);
}

function executorCaseLabels(): Set<string> {
  const labels = new Set<string>();
  for (const match of readExecutorBody().matchAll(/\bcase '([a-z0-9_]+)':/g)) {
    labels.add(match[1] as string);
  }
  return labels;
}

describe('shortcut action allowlist mirrors the content-script executor', () => {
  it('finds the executor switch', () => {
    expect(executorCaseLabels().size).toBeGreaterThan(10);
  });

  it('allowlists no action type the executor cannot run', () => {
    const executed = executorCaseLabels();
    const unexecutable = [...ALLOWED_SHORTCUT_ACTION_TYPES].filter((t) => !executed.has(t));
    expect(unexecutable).toEqual([]);
  });

  it('allowlists every action type the executor can run', () => {
    const ungated = [...executorCaseLabels()].filter((t) => !ALLOWED_SHORTCUT_ACTION_TYPES.has(t));
    expect(ungated).toEqual([]);
  });

  it('rejects a plan carrying a computer-use passthrough the page cannot run', () => {
    // Previously accepted at save time, then answered with "Unsupported page
    // action" at replay — after the whole plan had been admitted to storage.
    for (const type of [
      'screenshot',
      'right_click',
      'double_click',
      'triple_click',
      'execute_script',
      'snapshot',
      'wait',
      'unsupported',
    ]) {
      expect(validateShortcutActions([{ id: '1', type }] as never)).toBe(false);
    }
  });
});

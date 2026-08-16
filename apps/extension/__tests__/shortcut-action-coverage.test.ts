
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_SHORTCUT_ACTION_TYPES, validateShortcutActions } from '../src/background/policy';

const contentSource = readFileSync(resolve(process.cwd(), 'src/content.ts'), 'utf8');

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

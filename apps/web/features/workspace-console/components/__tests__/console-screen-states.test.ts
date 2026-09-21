import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingStates, stripComments } from '../../../../../../scripts/lib/route-states.mjs';

const COMPONENTS_DIR = path.resolve(__dirname, '..');

// A console panel reads its data through the hooks beside it, which the
// repository-wide route-state scan does not follow, so it never saw most of them.
const DATA_SOURCE = [
  /from '\.\.\/hooks\/use-[^']+'/,
  /from '@\/features\/[^']*\/hooks\/[^']+'/,
  /\buse(?:Suspense)?(?:Infinite)?Query\s*\(/,
  /\bfetch\s*\(/,
];

// Single-record panels: there is no list to be empty, and each renders its own
// unset state in words the list-shaped signals do not match.
const UNSET_STATE: Readonly<Record<string, string>> = {
  'WorkspaceAuditStreaming.tsx': 'No destination',
  'WorkspaceBillingSummary.tsx': 'No workspace selected',
  'WorkspaceIdentityPanels.tsx': 'No workspace selected',
  'WorkspaceSpendLimit.tsx': 'Set limit',
};

function consolePanels(): { file: string; source: string }[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, source: readFileSync(path.join(COMPONENTS_DIR, file), 'utf8') }))
    .filter(({ source }) => DATA_SOURCE.some((signal) => signal.test(stripComments(source))));
}

describe('every workspace console panel that reads data', () => {
  const panels = consolePanels();

  it('is found, so the checks below are not vacuous', () => {
    expect(panels.length).toBeGreaterThanOrEqual(15);
  });

  it.each(panels.map(({ file }) => file))('%s shows the request in flight', (file) => {
    const { source } = panels.find((panel) => panel.file === file)!;
    expect(missingStates(source)).not.toContain('loading');
  });

  it.each(panels.map(({ file }) => file))('%s shows a failed request', (file) => {
    const { source } = panels.find((panel) => panel.file === file)!;
    expect(missingStates(source)).not.toContain('error');
  });

  it.each(panels.map(({ file }) => file))('%s says when there is nothing to show', (file) => {
    const { source } = panels.find((panel) => panel.file === file)!;
    if (!missingStates(source).includes('empty')) return;
    const unset = UNSET_STATE[file];
    expect(unset, `${file} renders no empty state and has no stated unset state`).toBeDefined();
    expect(stripComments(source)).toContain(unset!);
  });

  it('keeps no stated exception for a panel that no longer needs one', () => {
    const stale = Object.keys(UNSET_STATE).filter((file) => {
      const panel = panels.find((candidate) => candidate.file === file);
      return !panel || !missingStates(panel.source).includes('empty');
    });
    expect(stale).toEqual([]);
  });
});

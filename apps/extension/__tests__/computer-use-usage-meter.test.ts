/**
 * computer-use-usage-meter.test.ts
 *
 * Regression guard for the fake-data defect: the Computer-Use usage meter
 * rendered a hardcoded "Steps: 0/20" and never updated, because the background
 * agent-loop call omitted the `onUsageUpdate` callback that the loop already
 * emits — so live step/token counts were never broadcast to the panel.
 *
 * The fix is cross-context message wiring (background -> panel) that cannot be
 * unit-tested through the non-importable entry modules, so — matching the
 * established source-level invariant pattern in computer-use-default-ask.test.ts
 * and security-fixes.test.ts §4 — these assert the real wiring exists on both
 * ends. If either side is removed the meter silently reverts to a placeholder.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('computer-use usage meter is wired to live agent-loop usage', () => {
  const background = read('src/background.ts');
  const sidePanel = read('src/side_panel.ts');

  it('background passes onUsageUpdate to runAgentLoop and broadcasts AGI_CU_USAGE', () => {
    expect(background).toMatch(/onUsageUpdate:\s*\(usage\)\s*=>/);
    expect(background).toMatch(/type:\s*'AGI_CU_USAGE',\s*usage/);
  });

  it('side panel handles AGI_CU_USAGE and feeds the usage meter', () => {
    expect(sidePanel).toMatch(/AGI_CU_USAGE/);
    expect(sidePanel).toMatch(/cuPanel\.updateUsageMeter\(usage\)/);
  });
});

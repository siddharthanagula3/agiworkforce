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

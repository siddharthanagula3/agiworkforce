import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(APP, relative), 'utf8');

describe('/agent-permissions is presented as Approvals', () => {
  it('titles the page Approvals while keeping its URL', () => {
    const page = read('agent-permissions/page.tsx');
    expect(page).toMatch(/title:\s*'Approvals'/u);
    expect(page).toMatch(/path:\s*'\/agent-permissions'/u);
    expect(page).toContain('eyebrow="Approvals"');
  });

  it.each([
    'agent-permissions/page.tsx',
    'sitemap-page/page.tsx',
    'legal/page.tsx',
    'acceptable-use/page.tsx',
  ])('%s no longer names it Agent permissions', (relative) => {
    expect(read(relative)).not.toContain('Agent permissions');
  });
});

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const settingsTabsDir = join(here, '..', 'settings', 'tabs');

function tabsMountingSkillMarketplace(): string[] {
  return readdirSync(settingsTabsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const file = join(settingsTabsDir, name, 'index.tsx');
      return (
        existsSync(file) &&
        readFileSync(file, 'utf8').includes('skill-marketplace/SkillMarketplace')
      );
    })
    .sort();
}

describe('SkillMarketplace mount points', () => {
  it('is mounted from exactly one desktop settings tab', () => {
    expect(tabsMountingSkillMarketplace()).toEqual(['Capabilities']);
  });
});

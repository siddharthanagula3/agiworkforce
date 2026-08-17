import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const componentsDir = join(srcDir, 'components');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !full.includes('__tests__')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('ArtifactsSidebar removal', () => {
  it('no longer exists as a component file', () => {
    expect(existsSync(join(componentsDir, 'ArtifactsSidebar.tsx'))).toBe(false);
  });

  it('is not re-exported from the package barrel', () => {
    const barrel = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    expect(barrel).not.toContain('ArtifactsSidebar');
  });

  it('has no importers left in the package', () => {
    const importers = sourceFiles(srcDir).filter((file) =>
      readFileSync(file, 'utf8').includes('ArtifactsSidebar'),
    );
    expect(importers).toEqual([]);
  });
});

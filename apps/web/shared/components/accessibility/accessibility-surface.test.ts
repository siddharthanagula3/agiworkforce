import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const surfaceDirectory = path.join(process.cwd(), 'shared/components/accessibility');

const sourceFiles = fs
  .readdirSync(surfaceDirectory)
  .filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
  .sort();

const readSource = (file: string) => fs.readFileSync(path.join(surfaceDirectory, file), 'utf8');

describe('accessibility component surface', () => {
  it('ships no in-app audit panel', () => {
    expect(sourceFiles.filter((file) => /audit/i.test(file))).toEqual([]);
  });

  it('hardcodes no audit verdict', () => {
    for (const file of sourceFiles) {
      const source = readSource(file);
      expect(source, file).not.toMatch(/all checks passed/i);
      expect(source, file).not.toMatch(/\b(score|passed|failed|warnings):\s*\d/);
    }
  });

  it('keeps a single skip-link implementation', () => {
    expect(sourceFiles.filter((file) => /^SkipLinks?\.tsx$/.test(file))).toEqual(['SkipLinks.tsx']);
  });
});

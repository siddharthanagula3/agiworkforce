import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(__dirname, '..');

function productTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...productTypeScriptFiles(absolute));
    } else if (entry.isFile() && absolute.endsWith('.ts')) {
      files.push(absolute);
    }
  }
  return files;
}

describe('agent control mutation boundary', () => {
  it('keeps every literal mode and effort configuration write in the consent module', () => {
    const writers = productTypeScriptFiles(sourceRoot)
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return /\.update\(\s*['"]agent\.(?:mode|effort)['"]/u.test(source);
      })
      .map((file) => path.relative(sourceRoot, file));

    expect(writers).toEqual(['features/permissions/agentModeConsent.ts']);
  });
});

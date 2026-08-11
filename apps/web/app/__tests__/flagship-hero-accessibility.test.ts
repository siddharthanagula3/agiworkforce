import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(__dirname, '..');

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(absolute);
    return entry.name === 'page.tsx' ? [absolute] : [];
  });
}

describe('flagship marketing hero accessibility', () => {
  it('separates adjacent visual headline lines in the accessible name', () => {
    const offenders = pageFiles(APP_DIR)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /<\/span>\s*<span className="agi-fl-h1-line">/u.test(source);
      })
      .map((file) => path.relative(APP_DIR, file));

    expect(offenders).toEqual([]);
  });
});

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

describe('route-level structured data', () => {
  it('does not render inline JSON-LD as a page sibling ahead of streamed content', () => {
    const offenders = pageFiles(APP_DIR)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return source.includes('<JsonLd') || source.includes('application/ld+json');
      })
      .map((file) => path.relative(APP_DIR, file));

    expect(offenders).toEqual([]);
  });
});

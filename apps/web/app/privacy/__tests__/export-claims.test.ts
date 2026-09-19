import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\s+/gu, ' ');
}

describe('published account-export claims', () => {
  it.each(['app/privacy/page.tsx', 'app/privacy/requests/page.tsx'])(
    '%s explains completeness and intentional exclusions',
    (path) => {
      const copy = source(path);

      expect(copy).toMatch(/completeness record/i);
      expect(copy).toMatch(/unavailable, skipped, or truncated/i);
      expect(copy).toMatch(/live secrets, credential verifiers/i);
      expect(copy).not.toMatch(/does not yet cover every category/i);
    },
  );
});

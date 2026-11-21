// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GATE_CALL = 'await requireAdultEligibility(';

const PRODUCT_ENTRY_POINTS = [
  'app/chat/layout.tsx',
  'app/code/layout.tsx',
  'app/quick-ask/layout.tsx',
  'app/workspace/layout.tsx',
  'app/tasks/layout.tsx',
  'app/admin/layout.tsx',
  'app/welcome/page.tsx',
];

const ACCOUNT_DATA_ENTRY_POINTS = ['app/settings/layout.tsx', 'app/billing/layout.tsx'];

function source(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

describe('which signed-in areas need an 18 and over decision', () => {
  it.each(PRODUCT_ENTRY_POINTS)('%s opens only with a decision on record', (file) => {
    expect(source(file)).toContain(GATE_CALL);
  });

  it.each(ACCOUNT_DATA_ENTRY_POINTS)(
    '%s stays open so a refused account can export or delete its data',
    (file) => {
      expect(source(file)).not.toContain(GATE_CALL);
    },
  );
});

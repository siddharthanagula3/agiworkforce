import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidePanel = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');

describe('a model refused by privacy settings or workspace policy', () => {
  const start = sidePanel.indexOf('const errorAction =');
  const block = sidePanel.slice(start, sidePanel.indexOf('const streamUsedQuick', start));

  it('offers the switch-model action, which only codes that a model change cannot fix withhold', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("? 'switch-model'");
    expect(block).not.toContain("'model_refused'");
    for (const withheld of [
      'auth_required',
      'account_suspended',
      'terms_required',
      'plan_required',
      'policy_blocked',
    ])
      expect(block).toContain(`'${withheld}'`);
  });
});

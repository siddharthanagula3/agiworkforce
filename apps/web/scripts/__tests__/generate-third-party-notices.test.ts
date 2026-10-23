// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { generate } from '../generate-third-party-notices.mjs';

describe('generate-third-party-notices', () => {
  it('lists the web app packages only', () => {
    const { notices } = generate();

    expect(notices.packages.length).toBeGreaterThan(0);
    for (const pkg of notices.packages) {
      expect(pkg.sources).toEqual(['web']);
      expect(pkg.ecosystem).toBe('npm');
    }
  });
});

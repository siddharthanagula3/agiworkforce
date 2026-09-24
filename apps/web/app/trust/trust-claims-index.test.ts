import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runTrustClaimsCheck } from '../../../../scripts/check-trust-claims.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('/trust rows are owned, evidenced and reviewed before they are published', () => {
  it('holds no row whose text, date or evidence moved after its last review', () => {
    expect(runTrustClaimsCheck(REPO_ROOT)).toEqual([]);
  });
});

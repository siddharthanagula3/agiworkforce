import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_ROOTS = ['app', 'lib', 'features', 'shared', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'e2e', 'dist']);
const SOURCE = /\.tsx?$/;
const NOT_PRODUCTION = /\.(?:test|spec)\.tsx?$|\.d\.ts$/;
const STRING_LITERAL = /`[^`]*`|'[^'\n]*'|"[^"\n]*"/g;
const PROFILE_BY_EMAIL =
  /\bprofiles\b[\s\S]*?\b(?:\w+\.)?email\s*\)?\s*=\s*(?:lower\s*\(\s*)?\$\d/i;
const SHORTEST_REASON = 60;

/**
 * Every query that finds an account by its email address, and why its answer
 * cannot reach someone who does not already own that address. A new one fails
 * until its reason is written here.
 */
const LOOKUPS: Record<string, { count: number; reason: string }> = {
  'app/api/settings/team/route.ts': {
    count: 1,
    reason:
      'Runs only after organizationOwnsEmailDomain accepts the address, and the refusal before it is word for word the same whether or not an account uses the address.',
  },
  'app/api/stripe-webhook/lib/db.ts': {
    count: 3,
    reason:
      'Driven by a Stripe-signed webhook with the customer email Stripe holds; the result links a subscription and is never returned to an HTTP caller.',
  },
  'lib/server/scim/scim-provisioning-service.ts': {
    count: 1,
    reason:
      'linkAccount returns before the lookup unless the address is on a domain the provisioning organization verified, and the SCIM caller is that organization.',
  },
  'lib/services/organization-invitation-service.ts': {
    count: 1,
    reason:
      'Joins organization_members for the inviting workspace only, so the answer is whether the address already belongs to a member the admin can already list.',
  },
};

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) out.push(full);
    }
  };
  for (const root of SCAN_ROOTS) {
    const full = path.join(APP_ROOT, root);
    if (fs.existsSync(full)) walk(full);
  }
  return out;
}

function lookupsByFile(): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of productionFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    let count = 0;
    for (const literal of source.matchAll(STRING_LITERAL)) {
      if (PROFILE_BY_EMAIL.test(literal[0])) count += 1;
    }
    if (count > 0) found.set(path.relative(APP_ROOT, file).split(path.sep).join('/'), count);
  }
  return found;
}

describe('an email address never tells a stranger whether an account uses it', () => {
  const files = productionFiles();
  const found = lookupsByFile();

  it('reads the real source tree', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(found.size).toBeGreaterThan(0);
  });

  it('finds every account lookup by email in the inventory, with its count', () => {
    const actual = Object.fromEntries([...found.entries()].sort());
    const declared = Object.fromEntries(
      Object.entries(LOOKUPS)
        .map(([file, entry]) => [file, entry.count] as const)
        .sort(),
    );
    expect(actual).toEqual(declared);
  });

  it('says for each lookup why its answer stays with the owner of the address', () => {
    for (const [file, entry] of Object.entries(LOOKUPS)) {
      expect(entry.reason.length, file).toBeGreaterThanOrEqual(SHORTEST_REASON);
    }
  });
});

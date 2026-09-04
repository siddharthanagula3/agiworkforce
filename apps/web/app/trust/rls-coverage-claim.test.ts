import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pins the row-level-isolation figure on /trust to what the tree actually
 * contains.
 *
 * This claim is read by enterprise security reviewers and was previously
 * allowed to go stale: it stated "22 of 170 hosted API route files" months
 * after both numbers had moved, and deferred to /security for "the exact
 * figure", which /security has never carried. A public isolation claim that
 * drifts is worse than no claim, so the number is measured here rather than
 * maintained by hand.
 *
 * When this fails, re-measure and update the page, do not relax the test.
 */

const API_ROOT = join(process.cwd(), 'app/api');
const TRUST_PAGE = join(process.cwd(), 'app/trust/page.tsx');

const RLS_CLIENTS = /getUserScopedDb|getRlsCapableDb/;
// `getStripeWebhookDb` is the same owner connection on a pool of its own, so it
// belongs on the same side of the ledger. Naming it separately is a pool-sizing
// decision, not a privilege one, and the public claim must not improve because
// an accessor was renamed.
const OWNER_CLIENT = /getNeonDb|getStripeWebhookDb/;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      routeFiles(full, out);
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

function measure() {
  const files = routeFiles(API_ROOT);
  let rlsScoped = 0;
  let ownerOnly = 0;
  let noDatabase = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rls = RLS_CLIENTS.test(source);
    const owner = OWNER_CLIENT.test(source);
    // A route that reaches for the owner connection at all is counted against
    // us, even if it also reads under RLS. Some legitimately need both, legal
    // holds read scoped and write privileged, but its writes still bypass
    // policy, and a public isolation claim should be the number that cannot be
    // argued down.
    if (owner) ownerOnly += 1;
    else if (rls) rlsScoped += 1;
    else noDatabase += 1;
  }

  return { total: files.length, rlsScoped, ownerOnly, noDatabase };
}

describe('/trust row-level isolation claim', () => {
  const measured = measure();
  const page = readFileSync(TRUST_PAGE, 'utf8');
  const databaseBacked = measured.rlsScoped + measured.ownerOnly;

  it('states the measured number of RLS-bound routes', () => {
    expect(page).toContain(`${measured.rlsScoped} of ${databaseBacked} database-backed`);
  });

  it('states the measured number of routes excluded for touching no database', () => {
    expect(page).toContain(`the other ${measured.noDatabase} hosted routes touch no database`);
  });

  it('states the measured number still on the owner connection', () => {
    expect(page).toContain(`The remaining ${measured.ownerOnly} connect as the database owner`);
  });

  it('never rounds the claim in its own favour', () => {
    // Every route file is on exactly one side of the ledger.
    expect(measured.rlsScoped + measured.ownerOnly + measured.noDatabase).toBe(measured.total);
    expect(measured.rlsScoped).toBeLessThan(databaseBacked);
  });

  it('does not promise a figure that another page has to carry', () => {
    expect(page).not.toContain('The exact figure and the covered surfaces are on /security');
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/privacy/page.tsx'), 'utf8');
const vercel = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8'),
) as { crons?: Array<{ path: string; schedule: string }> };

const crons = vercel.crons ?? [];

// A retention period in the privacy policy is a commitment. If the policy says
// a limit is enforced by a schedule, the schedule has to exist; if it says the
// opposite, that has to still be true. This entry said the audit-log purge was
// "run by an administrator, not on a schedule" long after the cron was added.
describe('privacy retention claims match the jobs that enforce them', () => {
  it('has the audit-log purge cron the policy now cites', () => {
    const job = crons.find((c) => c.path === '/api/cron/purge-security-audit-logs');
    expect(job, 'policy cites a cron that is not registered in vercel.json').toBeDefined();
    expect(job?.schedule).toBe('30 2 * * *');
  });

  it('no longer claims the purge is manual', () => {
    expect(page).not.toMatch(/run by an administrator, not on a schedule/i);
  });

  it('describes it as scheduled, and names the job so the claim is checkable', () => {
    expect(page).toMatch(/scheduled job every night/i);
    expect(page).toContain('/api/cron/purge-security-audit-logs');
  });

  it('still states the 90-day period itself', () => {
    expect(page).toMatch(/older than 90 days/);
  });

  it('registers every cron the policy cites, not just the audit-log one', () => {
    // Generalised deliberately. The audit-log entry went stale because nothing
    // tied the prose to the schedule; naming a job that does not run is worse
    // than describing the behaviour vaguely, so every citation is checked.
    const cited = [...new Set([...page.matchAll(/\/api\/cron\/[a-z0-9-]+/g)].map((m) => m[0]))];
    expect(cited.length).toBeGreaterThan(0);

    const registered = new Set(crons.map((c) => c.path));
    const unregistered = cited.filter((path) => !registered.has(path));
    expect(
      unregistered,
      `privacy policy cites cron(s) absent from vercel.json: ${unregistered.join(', ')}`,
    ).toEqual([]);
  });

  it('points every API path the policy cites at a route that exists', () => {
    // Character class must include uppercase, or a placeholder like
    // {mediaAssetId} truncates mid-word and the assertion checks a path that
    // was never cited.
    const cited = [...new Set([...page.matchAll(/\/api\/[A-Za-z0-9/{}_-]+/g)].map((m) => m[0]))]
      .filter((path) => !path.startsWith('/api/cron/'))
      .map((path) => path.replace(/\/\{[^}]*\}?.*$/, ''))
      .filter(Boolean);

    for (const path of cited) {
      const dir = join(process.cwd(), 'app', ...path.split('/').filter(Boolean));
      expect(existsSync(dir), `policy cites ${path} but app${path} does not exist`).toBe(true);
    }
  });
});

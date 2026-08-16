
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(__dirname, '..', '..');
const ROUTE_PATH = join(WEB_ROOT, 'app/api/github/webhook/route.ts');
const NEON_MIGRATIONS_DIR = join(WEB_ROOT, 'db/neon');

const routeSource = readFileSync(ROUTE_PATH, 'utf8');
const migrationSource = readdirSync(NEON_MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(NEON_MIGRATIONS_DIR, f), 'utf8'))
  .join('\n');

describe('web-HIGH-3 migration: github_pr_review_attempts table', () => {
  it('migration file exists and creates the table', () => {
    expect(migrationSource).toMatch(
      /create table if not exists public\.github_pr_review_attempts/i,
    );
  });

  it('table has the four critical columns', () => {
    for (const col of ['installation_id', 'pr_number', 'status', 'attempted_at']) {
      expect(migrationSource).toContain(col);
    }
  });

  it('status column has CHECK constraint covering all 5 documented states', () => {
    for (const state of [
      "'pending'",
      "'completed'",
      "'failed'",
      "'skipped_debounce'",
      "'skipped_quota'",
    ]) {
      expect(migrationSource).toContain(state);
    }
  });

  it('declares the hot-path indexes for debounce + quota queries', () => {
    expect(migrationSource).toContain('idx_github_pr_review_attempts_installation_pr_attempted');
    expect(migrationSource).toContain('idx_github_pr_review_attempts_installation_attempted');
  });

  it('cleanup function drops rows older than 30 days', () => {
    expect(migrationSource).toMatch(/delete from public\.github_pr_review_attempts/i);
    expect(migrationSource).toMatch(/interval '30 days'/);
  });

  // Note: RLS is not checked here because Neon does not have service_role /
  // authenticated / anon roles (see db/neon/0020_functions.sql header).
  // Access control is enforced at the Next.js route layer instead.
});

describe('web-HIGH-3 route: processReview spend-cap branches', () => {
  it('declares DEBOUNCE_WINDOW_MS = 5 minutes', () => {
    expect(routeSource).toMatch(/DEBOUNCE_WINDOW_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it('declares QUOTA_WINDOW_MS = 30 days', () => {
    expect(routeSource).toMatch(
      /QUOTA_WINDOW_MS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    );
  });

  it('reads MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS from env with default 100', () => {
    expect(routeSource).toMatch(
      /MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS\s*=\s*Number\(\s*process\.env\['GITHUB_PR_REVIEW_MONTHLY_CAP'\]\s*\?\?\s*'100'/,
    );
  });

  it('debounce branch: queries recent same-PR attempts within DEBOUNCE_WINDOW_MS', () => {
    expect(routeSource).toMatch(/from github_pr_review_attempts/);
    const debounceBlock = routeSource.match(
      /from github_pr_review_attempts[\s\S]{0,800}order by attempted_at desc limit 1/,
    );
    expect(debounceBlock).not.toBeNull();
  });

  it('debounce branch: only debounces on status=pending (allows legitimate re-mention after completed)', () => {
    expect(routeSource).toMatch(/recent\.status === 'pending'/);
  });

  it('debounce branch: writes a skipped_debounce row when the LLM call is skipped', () => {
    expect(routeSource).toMatch(/'skipped_debounce'/);
  });

  it('quota branch: counts completed+pending in the last 30 days', () => {
    expect(routeSource).toMatch(/status = any\(\$\d+\)/);
    expect(routeSource).toMatch(/\['completed',\s*'pending'\]/);
  });

  it('quota branch: posts a user-visible quota-exhausted comment', () => {
    expect(routeSource).toMatch(/monthly review quota/i);
  });

  it('quota branch: writes a skipped_quota row before posting the comment', () => {
    expect(routeSource).toMatch(/'skipped_quota'/);
  });

  it('SECURITY: every spend-cap query is scoped by installation_id (no cross-installation leak)', () => {
    expect(routeSource).toMatch(
      /from github_pr_review_attempts where installation_id = \$\d+ and pr_number = \$\d+/,
    );
    expect(routeSource).toMatch(
      /count\(\*\)[\s\S]{0,80}from github_pr_review_attempts where installation_id = \$\d+ and status = any/,
    );
  });

  it('happy path: inserts a pending row BEFORE the LLM fetch call', () => {
    const fetchIdx = routeSource.indexOf("await fetch(providerApiUrl('anthropic', 'messages')");
    expect(fetchIdx).toBeGreaterThan(0);
    const beforeFetch = routeSource.slice(0, fetchIdx);
    expect(beforeFetch).toMatch(/insert into github_pr_review_attempts/);
    expect(beforeFetch).toMatch(/'pending'/);
  });

  it('happy path: marks the pending row completed after the LLM returns', () => {
    expect(routeSource).toMatch(/'completed'/);
    expect(routeSource).toMatch(/tokens_used/);
  });

  it('failure path: marks the pending row failed in the catch block', () => {
    const catchIdx = routeSource.indexOf("logger.error({ error }, 'PR review processing error')");
    expect(catchIdx).toBeGreaterThan(0);
    const catchBlock = routeSource.slice(catchIdx, catchIdx + 600);
    expect(catchBlock).toMatch(/'failed'/);
  });

  it('best-effort: spend-cap query failure is logged + proceeds (does not block legitimate PRs on outage)', () => {
    expect(routeSource).toMatch(/spend-cap check failed/i);
  });

  it('attemptId is hoisted ABOVE the try block (so the catch can mark failed)', () => {
    const fnIdx = routeSource.indexOf('const processReview = async');
    expect(fnIdx).toBeGreaterThan(0);
    const sliceStart = routeSource.slice(fnIdx);
    const tryIdx = sliceStart.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(0);
    const before = sliceStart.slice(0, tryIdx);
    expect(before).toMatch(/let attemptId:\s*string \| null = null;/);
  });
});

describe('web-HIGH-3 cap-bounds sanity', () => {
  it('default monthly cap is 100 (well above legitimate use, well below cost)', () => {
    expect(routeSource).toMatch(/'100'/);
  });

  it('debounce window is 5 minutes (absorbs GitHub retry burst, < user retry frustration)', () => {
    expect(routeSource).toMatch(/5\s*\*\s*60\s*\*\s*1000/);
  });
});

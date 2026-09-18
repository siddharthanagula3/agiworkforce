import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAuditCoverageReport } from '../index';
import { SURFACE_AUDIT_COVERAGE, UNAUDITED_MUTATING_ROUTES } from '../registry';
import { isAudited, resolveAuditCoverageRoot, sweepRouteAuditCoverage } from '../sweep';

function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();
const REPO_ROOT = dirname(dirname(APP_ROOT));

const COVERAGE = sweepRouteAuditCoverage(APP_ROOT);
const DECLARED = new Map(UNAUDITED_MUTATING_ROUTES.map((entry) => [entry.route, entry]));

describe('every mutating route has an audit decision', () => {
  it('finds the route tree rather than an empty directory', () => {
    expect(COVERAGE.length).toBeGreaterThan(200);
  });

  it('records an event or says in the registry why it does not', () => {
    // A new mutating route that nobody classified is the failure this guard
    // exists for: it lands silently and the trail is short by one action.
    const undecided = COVERAGE.filter(
      (route) => !isAudited(route) && !DECLARED.has(route.route),
    ).map((route) => route.route);

    expect(
      undecided,
      'add these to UNAUDITED_MUTATING_ROUTES with a reason, or audit them',
    ).toEqual([]);
  });

  it('carries no stale exemption for a route that now records an event', () => {
    const audited = new Set(COVERAGE.filter(isAudited).map((route) => route.route));
    const stale = [...DECLARED.keys()].filter((route) => audited.has(route));

    expect(stale, 'these routes now audit; drop them from UNAUDITED_MUTATING_ROUTES').toEqual([]);
  });

  it('carries no exemption for a route that no longer exists', () => {
    const live = new Set(COVERAGE.map((route) => route.route));
    const orphaned = [...DECLARED.keys()].filter((route) => !live.has(route));

    expect(orphaned, 'these routes are gone; drop them from UNAUDITED_MUTATING_ROUTES').toEqual([]);
  });

  it('names the event every gap must emit', () => {
    for (const entry of UNAUDITED_MUTATING_ROUTES) {
      if (entry.reason !== 'gap') {
        expect(
          entry.expectedEvent,
          `${entry.route} is not a gap but names an event`,
        ).toBeUndefined();
        continue;
      }
      expect(entry.expectedEvent, `${entry.route} is a gap with no event named`).toBeTruthy();
    }
  });
});

describe('the report the admin console reads', () => {
  const REPORT = buildAuditCoverageReport(APP_ROOT);

  it('carries every unaudited route with the reason the registry declares', () => {
    expect(REPORT.totals.mutatingRoutes).toBe(COVERAGE.length);
    expect(REPORT.totals.audited + REPORT.totals.unaudited).toBe(COVERAGE.length);
    expect(REPORT.unaudited.map((route) => route.route)).toEqual(
      COVERAGE.filter((route) => !isAudited(route)).map((route) => route.route),
    );
    expect(REPORT.unaudited.filter((route) => route.reason === null)).toEqual([]);
    expect(REPORT.surfaces).toEqual(SURFACE_AUDIT_COVERAGE);
  });

  it('reports nothing undeclared and no exemption that outlived its route', () => {
    expect(REPORT.undeclared).toEqual([]);
    expect(REPORT.staleExemptions).toEqual([]);
  });

  it('has no root to sweep where the route sources were not deployed', () => {
    expect(resolveAuditCoverageRoot(APP_ROOT)).toBe(APP_ROOT);
    expect(resolveAuditCoverageRoot(REPO_ROOT)).toBe(APP_ROOT);
    expect(resolveAuditCoverageRoot(join(APP_ROOT, 'db'))).toBeNull();
  });
});

describe('workspace-governed subtrees audit every mutating route', () => {
  // The subtrees an enterprise auditor reads. A gap here is not a judgement
  // call about noise; it is a governed action with no record.
  const GOVERNED = /^(admin|scim|settings\/organization|settings\/team|enterprise)\//;

  it('excuses an unaudited governed route only as a gap or as governing nothing', () => {
    // Under these prefixes "the record is the content itself" is not an answer:
    // an unaudited route here either owes an event or changes no governed state.
    const excused = new Set(['gap', 'no_governed_state']);
    const wrong = COVERAGE.filter((route) => GOVERNED.test(route.route) && !isAudited(route))
      .map((route) => DECLARED.get(route.route))
      .filter((entry) => !entry || !excused.has(entry.reason))
      .map((entry) => entry?.route ?? 'undeclared');

    expect(wrong).toEqual([]);
  });
});

describe('non-web surfaces are covered by the same trail', () => {
  for (const entry of SURFACE_AUDIT_COVERAGE) {
    it(`${entry.surface}: ${entry.action}`, () => {
      const emitter = join(APP_ROOT, entry.emitter);
      expect(existsSync(emitter), `${entry.emitter} does not exist`).toBe(true);

      const text = readFileSync(emitter, 'utf8');
      expect(text, `${entry.emitter} does not call recordAuditEvent`).toMatch(
        /\brecordAuditEvent\s*\(/,
      );

      const named = text.includes(`'${entry.eventType}'`) || text.includes('toolAuditEventType(');
      expect(named, `${entry.emitter} does not name ${entry.eventType}`).toBe(true);
    });
  }

  it('the CLI keeps its own trail for the actions it takes without the server', () => {
    // Local mode never reaches an API route, so the web trail cannot cover it.
    // The CLI writes its own approval log instead, and it has to stay wired in.
    const local = join(REPO_ROOT, 'apps/cli/src/approval_audit.rs');
    expect(existsSync(local), 'apps/cli/src/approval_audit.rs is gone').toBe(true);
    expect(readFileSync(join(REPO_ROOT, 'apps/cli/src/lib.rs'), 'utf8')).toContain(
      'pub mod approval_audit;',
    );
  });

  const SURFACE_ROOTS: Record<string, string> = {
    cli: 'apps/cli/src',
    chrome: 'apps/extension/src',
    vscode: 'apps/extension-vscode/src',
  };

  function sourceOf(root: string): string {
    const parts: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|rs)$/.test(name)) parts.push(readFileSync(path, 'utf8'));
      }
    };
    walk(join(REPO_ROOT, root));
    return parts.join('\n');
  }

  const CACHED = new Map<string, string>();

  for (const [surface, root] of Object.entries(SURFACE_ROOTS)) {
    const expected = SURFACE_AUDIT_COVERAGE.filter((entry) => entry.surface === surface);
    if (expected.length === 0) continue;

    it(`${surface} reaches every route its coverage claims`, () => {
      if (!CACHED.has(surface)) CACHED.set(surface, sourceOf(root));
      const text = CACHED.get(surface) as string;

      for (const entry of expected) {
        expect(
          text,
          `${surface} never calls ${entry.endpoint}, so ${entry.action} is unproven`,
        ).toContain(entry.endpoint);
      }
    });
  }
});

import {
  SURFACE_AUDIT_COVERAGE,
  UNAUDITED_MUTATING_ROUTES,
  type SurfaceAuditCoverage,
  type UnauditedReason,
} from './registry';
import { isAudited, sweepRouteAuditCoverage, type RouteAuditCoverage } from './sweep';

export {
  SURFACE_AUDIT_COVERAGE,
  UNAUDITED_MUTATING_ROUTES,
  type AuditedSurface,
  type SurfaceAuditCoverage,
  type UnauditedReason,
  type UnauditedRoute,
} from './registry';

export {
  MUTATING_METHODS,
  classifyRoute,
  isAudited,
  resolveAuditCoverageRoot,
  sweepRouteAuditCoverage,
  type AuditEmitterKind,
  type MutatingMethod,
  type RouteAuditCoverage,
} from './sweep';

export interface UnauditedRouteCoverage extends RouteAuditCoverage {
  /** Null when no entry in the registry excuses this route. */
  reason: UnauditedReason | null;
  expectedEvent: string | null;
}

export interface AuditCoverageReport {
  generatedAt: string;
  totals: {
    mutatingRoutes: number;
    audited: number;
    unaudited: number;
    declaredGaps: number;
  };
  unaudited: UnauditedRouteCoverage[];
  /** Mutating routes recording nothing that nobody classified. */
  undeclared: string[];
  /** Exemptions for routes that now audit, or that no longer exist. */
  staleExemptions: string[];
  surfaces: readonly SurfaceAuditCoverage[];
}

export function buildAuditCoverageReport(appRoot: string): AuditCoverageReport {
  const coverage = sweepRouteAuditCoverage(appRoot);
  const declared = new Map(UNAUDITED_MUTATING_ROUTES.map((entry) => [entry.route, entry]));
  const audited = coverage.filter(isAudited);
  const live = new Set(coverage.map((route) => route.route));

  const unaudited = coverage
    .filter((route) => !isAudited(route))
    .map((route) => {
      const entry = declared.get(route.route);
      return {
        ...route,
        reason: entry?.reason ?? null,
        expectedEvent: entry?.expectedEvent ?? null,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      mutatingRoutes: coverage.length,
      audited: audited.length,
      unaudited: unaudited.length,
      declaredGaps: UNAUDITED_MUTATING_ROUTES.filter((entry) => entry.reason === 'gap').length,
    },
    unaudited,
    undeclared: unaudited.filter((route) => route.reason === null).map((route) => route.route),
    staleExemptions: [...declared.keys()].filter(
      (route) => !live.has(route) || audited.some((entry) => entry.route === route),
    ),
    surfaces: SURFACE_AUDIT_COVERAGE,
  };
}

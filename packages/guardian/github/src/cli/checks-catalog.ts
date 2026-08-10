/**
 * Curated repository-owned checks the Guardian runs as its fast deterministic
 * baseline. These reuse the repo's existing `check:*` scripts as first-class
 * analyzers instead of introducing parallel tooling.
 *
 * Selection criteria: static analysis only (no builds, no network), completes
 * in seconds, and guards a product invariant with a clear impact statement.
 * Expensive lanes (semgrep, clippy, full tests) stay in ci.yml; the Guardian
 * reads their results rather than re-running them.
 */
import type { adapters } from '@agiworkforce/guardian-core';

export type CatalogEntry = adapters.RepoCheckSpec & {
  /** Category check-run this scanner's findings roll up into. */
  group: 'security' | 'correctness' | 'architecture' | 'technical-debt';
};

export const FAST_CHECKS: CatalogEntry[] = [
  {
    script: 'check:secrets',
    category: 'security',
    severity: 'critical',
    impact: 'A committed credential is exposed to everyone with repository read access.',
    group: 'security',
  },
  {
    script: 'check:hardcoded-endpoints',
    category: 'security',
    severity: 'medium',
    impact:
      'Hardcoded API endpoints bypass environment routing and can leak traffic to the wrong trust boundary.',
    group: 'security',
  },
  {
    script: 'check:db-isolation',
    category: 'security',
    severity: 'high',
    impact: 'A tenant-isolation gap lets one tenant read or write another tenant’s rows.',
    group: 'security',
  },
  {
    script: 'check:model-catalog',
    category: 'correctness',
    severity: 'high',
    impact:
      'Model IDs or capabilities drifting from the canonical registry break routing and billing.',
    group: 'correctness',
  },
  {
    script: 'check:llm-failures',
    category: 'correctness',
    severity: 'medium',
    impact:
      'Unvalidated LLM/tool inputs, fake tests, or production stubs violate the LLM failure taxonomy.',
    group: 'correctness',
  },
  {
    script: 'check:boundaries',
    category: 'architecture',
    severity: 'medium',
    impact: 'A forbidden cross-surface import couples packages that must stay independent.',
    group: 'architecture',
  },
  {
    script: 'check:generated-artifacts',
    category: 'correctness',
    severity: 'medium',
    impact: 'Generated artifacts that do not match their source ship stale behavior.',
    group: 'correctness',
  },
  {
    script: 'check:agent-context',
    category: 'documentation',
    severity: 'low',
    impact: 'Agent-context drift misleads every automated contributor that reads it.',
    group: 'technical-debt',
  },
];

/**
 * Heavy checks reserved for scheduled deep audits: they run real test suites
 * or full-graph analysis and take minutes, not seconds.
 */
export const DEEP_CHECKS: CatalogEntry[] = [
  {
    script: 'check:trust-boundaries',
    category: 'privacy',
    severity: 'high',
    impact:
      'A trust-boundary violation can silently route Local-mode data to BYOK or managed cloud.',
    group: 'security',
  },
  {
    script: 'check:knip:production',
    category: 'technical-debt',
    severity: 'low',
    impact: 'Unused files, exports, and dependencies accumulate as dead surface area.',
    group: 'technical-debt',
  },
];

/** Per-check wall-clock budget. A check that exceeds it is scanner-failed. */
export const CHECK_TIMEOUT_MS = 300_000;
/** Deep-audit checks get a larger budget. */
export const DEEP_CHECK_TIMEOUT_MS = 900_000;

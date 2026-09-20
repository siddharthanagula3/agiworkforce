import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  contextSource,
  type ContextAuthorship,
  type ContextSourceClass,
} from '@agiworkforce/context';
import {
  CLOSED_ORGANIZATION_CONTEXT_POLICY,
  OPEN_ORGANIZATION_CONTEXT_POLICY,
  resolveContext,
  type ContextActor,
  type ContextCandidate,
  type ContextExclusionReason,
  type ContextSourceLoader,
  type OrganizationContextPolicy,
} from '@agiworkforce/context-engine';

/**
 * Retrieval and assembly corpora, graded against the engine the product runs.
 * Nothing here reaches a model or a network: the fixtures are the loaders.
 */

export const CONTEXT_SUITES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'context-suites',
);

export interface ContextEvalSourceRow {
  readonly sourceClass: ContextSourceClass;
  readonly locator: string;
  readonly text: string;
  readonly authoredBy?: ContextAuthorship;
  readonly ownerUserId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly capturedAt?: string;
  readonly budgetChars?: number;
  readonly freshnessMs?: number;
  readonly dropStale?: boolean;
}

export interface ContextEvalExpectation {
  /** Source ids the turn must carry. */
  readonly includes?: readonly string[];
  /** Source ids the turn must never carry. A miss here is a leak, not a score. */
  readonly excludes?: readonly string[];
  /** The classes the resolved items appear in, in order, each named once. */
  readonly order?: readonly ContextSourceClass[];
  /** Why a source was left out, by source id. */
  readonly excludedFor?: Readonly<Record<string, ContextExclusionReason>>;
  /** Substrings every included text must be free of. */
  readonly neverMentions?: readonly string[];
}

export interface ContextEvalCase {
  readonly id: string;
  readonly risk: 'low' | 'high';
  readonly isolation?: boolean;
  readonly actor: ContextActor;
  readonly policy?: 'open' | 'closed' | Partial<OrganizationContextPolicy>;
  readonly temporaryChat?: boolean;
  readonly disabledToggles?: readonly string[];
  readonly sources: readonly ContextEvalSourceRow[];
  readonly expect: ContextEvalExpectation;
}

export interface ContextEvalSuite {
  readonly suite: string;
  readonly version: number;
  readonly priority: 'P0' | 'P1';
  readonly passThreshold: number;
  readonly provenance: string;
  readonly measures: string;
  readonly cases: readonly ContextEvalCase[];
}

export interface ContextEvalResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly checks: number;
  readonly satisfied: number;
  readonly failures: readonly string[];
}

export interface ContextSuiteResult {
  readonly suite: string;
  readonly version: number;
  readonly priority: 'P0' | 'P1';
  readonly passThreshold: number;
  readonly score: number;
  readonly completeness: number;
  readonly results: readonly ContextEvalResult[];
}

const DEFAULT_BUDGET_CHARS = 4000;

export function loadContextSuites(dir: string = CONTEXT_SUITES_DIR): readonly ContextEvalSuite[] {
  const suites = fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as ContextEvalSuite);
  if (suites.length === 0) {
    throw new Error(`no context corpus in ${dir}; this harness is measuring nothing`);
  }
  return suites;
}

function policyOf(evalCase: ContextEvalCase): OrganizationContextPolicy {
  if (evalCase.policy === undefined || evalCase.policy === 'open') {
    return OPEN_ORGANIZATION_CONTEXT_POLICY;
  }
  if (evalCase.policy === 'closed') return CLOSED_ORGANIZATION_CONTEXT_POLICY;
  return { ...OPEN_ORGANIZATION_CONTEXT_POLICY, ...evalCase.policy };
}

function candidateOf(row: ContextEvalSourceRow): ContextCandidate {
  return {
    source: contextSource({
      sourceClass: row.sourceClass,
      locator: row.locator,
      authoredBy: row.authoredBy,
      ownerUserId: row.ownerUserId,
      organizationId: row.organizationId,
      projectId: row.projectId,
      capturedAt: row.capturedAt,
    }),
    text: row.text,
    capturedAt: row.capturedAt,
  };
}

/** One loader per class, holding the fixture rows that class would have loaded. */
export function loadersFor(rows: readonly ContextEvalSourceRow[]): readonly ContextSourceLoader[] {
  const byClass = new Map<ContextSourceClass, ContextEvalSourceRow[]>();
  for (const row of rows) {
    const existing = byClass.get(row.sourceClass);
    if (existing) existing.push(row);
    else byClass.set(row.sourceClass, [row]);
  }
  return [...byClass.entries()].map(([sourceClass, classRows]) => {
    const [first] = classRows;
    const loader: ContextSourceLoader = {
      sourceClass,
      budgetChars: first?.budgetChars ?? DEFAULT_BUDGET_CHARS,
      freshnessMs: first?.freshnessMs,
      dropStale: first?.dropStale,
      load: () => classRows.map(candidateOf),
    };
    return loader;
  });
}

function orderedClasses(sourceIds: readonly string[]): ContextSourceClass[] {
  const seen: ContextSourceClass[] = [];
  for (const id of sourceIds) {
    const sourceClass = id.slice(0, id.indexOf(':')) as ContextSourceClass;
    if (seen.length === 0 || seen[seen.length - 1] !== sourceClass) seen.push(sourceClass);
  }
  return seen;
}

export async function runContextCase(evalCase: ContextEvalCase): Promise<ContextEvalResult> {
  const resolution = await resolveContext({
    turnId: evalCase.id,
    actor: evalCase.actor,
    policy: policyOf(evalCase),
    loaders: loadersFor(evalCase.sources),
    temporaryChat: evalCase.temporaryChat,
    disabledToggles: evalCase.disabledToggles,
    nowMs: Date.parse('2026-09-20T00:00:00.000Z'),
  });

  const included = resolution.items.map((item) => item.source.id);
  const failures: string[] = [];
  let checks = 0;
  let satisfied = 0;

  const record = (ok: boolean, failure: string): void => {
    checks += 1;
    if (ok) satisfied += 1;
    else failures.push(failure);
  };

  for (const id of evalCase.expect.includes ?? []) {
    record(included.includes(id), `${id} was not carried into the turn`);
  }
  for (const id of evalCase.expect.excludes ?? []) {
    record(!included.includes(id), `${id} reached the turn and must never be retrievable here`);
  }
  if (evalCase.expect.order) {
    const observed = orderedClasses(included);
    record(
      observed.join(' > ') === evalCase.expect.order.join(' > '),
      `assembled ${observed.join(' > ')}, expected ${evalCase.expect.order.join(' > ')}`,
    );
  }
  for (const [id, reason] of Object.entries(evalCase.expect.excludedFor ?? {})) {
    const entry = resolution.manifest.entries.find((candidate) =>
      candidate.excludedSourceIds.includes(id),
    );
    const counted = entry?.excluded.some((count) => count.reason === reason) ?? false;
    record(counted, `${id} was not excluded for ${reason}`);
  }
  for (const needle of evalCase.expect.neverMentions ?? []) {
    record(
      !resolution.items.some((item) => item.text.includes(needle)),
      `an included source still carries ${JSON.stringify(needle)}`,
    );
  }

  if (checks === 0) {
    failures.push('the case asserts nothing');
  }

  return {
    caseId: evalCase.id,
    passed: checks > 0 && failures.length === 0,
    checks,
    satisfied,
    failures,
  };
}

export async function runContextSuite(suite: ContextEvalSuite): Promise<ContextSuiteResult> {
  const results: ContextEvalResult[] = [];
  for (const evalCase of suite.cases) results.push(await runContextCase(evalCase));

  const passed = results.filter((result) => result.passed).length;
  const completeness =
    results.reduce((total, result) => total + result.satisfied / Math.max(result.checks, 1), 0) /
    Math.max(results.length, 1);

  return {
    suite: suite.suite,
    version: suite.version,
    priority: suite.priority,
    passThreshold: suite.passThreshold,
    score: results.length === 0 ? 0 : passed / results.length,
    completeness,
    results,
  };
}

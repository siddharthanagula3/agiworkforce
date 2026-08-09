/**
 * Corpus loading and validation.
 *
 * The corpora are data files, so they are parsed as untrusted input: a typo in
 * a check kind, a duplicated id, or a row with no assertions would otherwise
 * turn into a silently-passing row, and a corpus that cannot fail is worse than
 * no corpus because it stops the next person looking.
 *
 * @module evals/dataset
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  Check,
  EvalCase,
  EvalDataset,
  ExpectedBehaviour,
  RiskLabel,
  SuiteName,
} from './types';

const SUITES: readonly SuiteName[] = ['golden', 'refusal', 'jailbreak'];
const RISKS: readonly RiskLabel[] = ['low', 'high'];
const BEHAVIOURS: readonly ExpectedBehaviour[] = ['answer', 'refusal', 'safe-completion'];
const CHECK_KINDS = [
  'includesAny',
  'includesAll',
  'excludesAll',
  'matches',
  'refuses',
  'maxWords',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function readStringArray(value: unknown, where: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(where, 'values must be a non-empty array of strings');
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      fail(where, 'values must be a non-empty array of strings');
    }
  }
  return value as readonly string[];
}

function parseCheck(raw: unknown, where: string): Check {
  if (!isRecord(raw)) fail(where, 'check must be an object');
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(CHECK_KINDS as readonly string[]).includes(kind)) {
    fail(where, `unknown check kind ${JSON.stringify(kind)}`);
  }

  switch (kind) {
    case 'includesAny':
      return { kind, values: readStringArray(raw['values'], where) };
    case 'includesAll':
      return { kind, values: readStringArray(raw['values'], where) };
    case 'excludesAll':
      return { kind, values: readStringArray(raw['values'], where) };
    case 'matches': {
      const pattern = raw['pattern'];
      if (typeof pattern !== 'string' || pattern.length === 0) {
        fail(where, 'matches requires a non-empty pattern');
      }
      try {
        new RegExp(pattern, 'i');
      } catch (error) {
        fail(where, `pattern is not a valid regex: ${(error as Error).message}`);
      }
      return { kind, pattern };
    }
    case 'refuses':
      return { kind };
    default: {
      const limit = raw['limit'];
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
        fail(where, 'maxWords requires a positive integer limit');
      }
      return { kind: 'maxWords', limit };
    }
  }
}

function parseCase(raw: unknown, suite: SuiteName, index: number): EvalCase {
  const where = `${suite}.cases[${index}]`;
  if (!isRecord(raw)) fail(where, 'case must be an object');

  const id = raw['id'];
  if (typeof id !== 'string' || !id.startsWith(`${suite}/`)) {
    fail(where, `id must be a string starting with "${suite}/"`);
  }
  const family = raw['family'];
  if (typeof family !== 'string' || family.trim().length === 0) {
    fail(where, 'family must be a non-empty string');
  }
  const risk = raw['risk'];
  if (typeof risk !== 'string' || !(RISKS as readonly string[]).includes(risk)) {
    fail(where, `risk must be one of ${RISKS.join(', ')}`);
  }
  const expected = raw['expected'];
  if (typeof expected !== 'string' || !(BEHAVIOURS as readonly string[]).includes(expected)) {
    fail(where, `expected must be one of ${BEHAVIOURS.join(', ')}`);
  }
  const prompt = raw['prompt'];
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    fail(where, 'prompt must be a non-empty string');
  }
  const rawChecks = raw['checks'];
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    fail(where, 'case must declare at least one check');
  }
  const notes = raw['notes'];
  if (notes !== undefined && typeof notes !== 'string') {
    fail(where, 'notes must be a string when present');
  }

  const evalCase: EvalCase = {
    id,
    family,
    risk: risk as RiskLabel,
    expected: expected as ExpectedBehaviour,
    prompt,
    checks: rawChecks.map((check, checkIndex) =>
      parseCheck(check, `${where}.checks[${checkIndex}]`),
    ),
  };
  return notes === undefined ? evalCase : { ...evalCase, notes };
}

/** Validate a parsed corpus file. Throws on the first structural problem. */
export function parseDataset(raw: unknown): EvalDataset {
  if (!isRecord(raw)) fail('dataset', 'dataset must be an object');

  const suite = raw['suite'];
  if (typeof suite !== 'string' || !(SUITES as readonly string[]).includes(suite)) {
    fail('dataset', `suite must be one of ${SUITES.join(', ')}`);
  }
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail(suite, 'version must be a positive integer');
  }
  const passThreshold = raw['passThreshold'];
  if (typeof passThreshold !== 'number' || passThreshold <= 0 || passThreshold > 1) {
    fail(suite, 'passThreshold must be in (0, 1]');
  }
  const rawCases = raw['cases'];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    fail(suite, 'cases must be a non-empty array');
  }

  const suiteName = suite as SuiteName;
  const cases = rawCases.map((entry, index) => parseCase(entry, suiteName, index));

  const seen = new Set<string>();
  for (const entry of cases) {
    if (seen.has(entry.id)) fail(suiteName, `duplicate case id ${entry.id}`);
    seen.add(entry.id);
  }

  return { suite: suiteName, version, passThreshold, cases };
}

/** Read and validate one committed corpus file. */
export function loadDataset(suite: SuiteName): EvalDataset {
  const path = fileURLToPath(new URL(`../datasets/${suite}.json`, import.meta.url));
  const dataset = parseDataset(JSON.parse(readFileSync(path, 'utf8')));
  if (dataset.suite !== suite) {
    fail(suite, `file declares suite ${dataset.suite}`);
  }
  return dataset;
}

/** Read and validate every committed corpus, in a stable order. */
export function loadAllDatasets(): readonly EvalDataset[] {
  return SUITES.map((suite) => loadDataset(suite));
}

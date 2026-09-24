/**
 * The platform's own safety floor for managed generation, read out of the
 * code that implements it rather than out of a description of it.
 *
 * Three questions, each answered from a source of truth that does not mention
 * moderation, so a control that is deleted shows up as a missing answer and
 * not as a shorter list of subjects:
 *
 *   1. The policy vocabulary: the categories the classifier declares and the
 *      rules that carry them. A category with no rule is a policy area the
 *      product claims and does not enforce.
 *   2. Admission: the functions that create a managed generation job. Every
 *      module that reaches one has to classify the prompt first.
 *   3. Delivery: the modules that stamp AI-generated provenance onto a stored
 *      media asset. Every one of them has to screen the bytes it stores.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CLASSIFIER_FILE = 'apps/web/lib/moderation/text-classifier.ts';
export const MODERATION_INDEX_FILE = 'apps/web/lib/moderation/index.ts';
export const BASELINE_FILE = 'scripts/config/managed-safety-floor-baseline.json';

export const API_ROOT = 'apps/web/app/api';
export const SERVICES_ROOT = 'apps/web/lib/services';

/** Creating one of these is how a prompt becomes a provider request. */
export const JOB_CREATORS = ['createImageGenerationJob', 'createVideoGenerationJob'];

export const PROMPT_GATE = 'moderateManagedPrompt';
export const OUTPUT_GATE = 'moderateGeneratedMedia';

/** The stamp that says a stored asset came out of a model. */
export const PROVENANCE_STAMP = 'buildAiGeneratedProvenance';

/** Writing one of these is how bytes enter the library. */
export const ASSET_WRITES = [
  'insertMediaAsset',
  'insertMediaAssetsAtomically',
  'upsertVideoMediaAsset',
];

export function read(repoRoot, relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isScannable(name) {
  return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name);
}

export function walk(repoRoot, relativeRoot) {
  const absolute = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absolute)) return [];
  const found = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const next = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...walk(repoRoot, next));
      continue;
    }
    if (isScannable(entry.name)) found.push(next);
  }
  return found;
}

/** A call, not a mention: an import line or a comment must not count as one. */
function callIndex(source, name) {
  const match = new RegExp(`\\b${name}\\s*\\(`).exec(source);
  return match ? match.index : -1;
}

export function declaredCategories(classifier) {
  const match = /export type ModerationCategory =([\s\S]*?);/.exec(classifier);
  if (!match) return null;
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]).sort();
}

export function ruleCategories(classifier) {
  const start = classifier.indexOf('const RULES');
  if (start === -1) return null;
  // Past the type annotation: `ModerationRule[]` carries a bracket pair of its
  // own, and opening on it reads an empty table as the whole rule set.
  const assignment = classifier.indexOf('=', start);
  if (assignment === -1) return null;
  const open = classifier.indexOf('[', assignment);
  if (open === -1) return null;
  let depth = 0;
  let end = open;
  for (; end < classifier.length; end += 1) {
    const character = classifier[end];
    if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const table = classifier.slice(open, end + 1);
  const rules = [...table.matchAll(/id:\s*'([^']+)',\s*category:\s*'([a-z_]+)'/g)].map((entry) => ({
    id: entry[1],
    category: entry[2],
  }));
  return rules.length > 0 ? rules : null;
}

export function auditVocabulary({ declared, rules }) {
  const problems = [];
  if (declared === null) {
    problems.push(`${CLASSIFIER_FILE} no longer declares ModerationCategory in a readable shape`);
    return problems;
  }
  if (rules === null) {
    problems.push(`${CLASSIFIER_FILE} no longer carries a readable rule table`);
    return problems;
  }
  const carried = new Set(rules.map((rule) => rule.category));
  for (const category of declared) {
    if (!carried.has(category)) {
      problems.push(
        `the classifier declares the category ${category} and no rule carries it, so that policy area is claimed and not enforced`,
      );
    }
  }
  for (const rule of rules) {
    if (!declared.includes(rule.category)) {
      problems.push(`rule ${rule.id} carries the category ${rule.category}, which is not declared`);
    }
  }
  return problems;
}

/**
 * Modules that turn a request into a managed generation. Selected by the job
 * creators they call, which know nothing about moderation.
 */
export function admissionSubjects(repoRoot) {
  const subjects = [];
  for (const file of walk(repoRoot, API_ROOT)) {
    const source = read(repoRoot, file);
    if (source === null) continue;
    const creators = JOB_CREATORS.filter((creator) => callIndex(source, creator) >= 0);
    if (creators.length === 0) continue;
    const gate = callIndex(source, PROMPT_GATE);
    const firstCreator = Math.min(...creators.map((creator) => callIndex(source, creator)));
    subjects.push({
      file,
      creators: creators.sort(),
      gated: gate >= 0,
      gatedBeforeDispatch: gate >= 0 && gate < firstCreator,
    });
  }
  return subjects.sort((left, right) => left.file.localeCompare(right.file));
}

/**
 * Modules that store bytes as an AI-generated asset. Selected by the
 * provenance stamp and the asset write, which also know nothing about
 * moderation.
 */
export function deliverySubjects(repoRoot) {
  const subjects = [];
  for (const root of [API_ROOT, SERVICES_ROOT]) {
    for (const file of walk(repoRoot, root)) {
      const source = read(repoRoot, file);
      if (source === null) continue;
      if (callIndex(source, PROVENANCE_STAMP) < 0) continue;
      const writes = ASSET_WRITES.filter((write) => callIndex(source, write) >= 0);
      if (writes.length === 0) continue;
      subjects.push({ file, writes: writes.sort(), screened: callIndex(source, OUTPUT_GATE) >= 0 });
    }
  }
  return subjects.sort((left, right) => left.file.localeCompare(right.file));
}

export function auditBaseline(open, baseline) {
  const recorded = new Map(Object.entries(baseline?.unscreened ?? {}));
  return {
    missingReason: [...recorded.entries()]
      .filter(([, entry]) => !entry?.reason || !entry?.fixIn)
      .map(([key]) => key)
      .sort(),
    grown: open.filter((key) => !recorded.has(key)).sort(),
    fixed: [...recorded.keys()].filter((key) => !open.includes(key)).sort(),
  };
}

export function audit(repoRoot, baseline) {
  const classifier = read(repoRoot, CLASSIFIER_FILE);
  const problems = [];
  if (classifier === null) {
    return {
      problems: [`${CLASSIFIER_FILE} is missing`],
      admission: [],
      delivery: [],
      baseline: null,
    };
  }
  problems.push(
    ...auditVocabulary({
      declared: declaredCategories(classifier),
      rules: ruleCategories(classifier),
    }),
  );

  const admission = admissionSubjects(repoRoot);
  if (admission.length === 0) {
    problems.push(
      `no module under ${API_ROOT} creates a managed generation job; the creators moved and this check is measuring nothing`,
    );
  }
  for (const subject of admission) {
    if (!subject.gated) {
      problems.push(
        `${subject.file} calls ${subject.creators.join(' and ')} without classifying the prompt through ${PROMPT_GATE}`,
      );
      continue;
    }
    if (!subject.gatedBeforeDispatch) {
      problems.push(
        `${subject.file} classifies the prompt after it has already created the job, so a refused prompt is charged for and dispatched`,
      );
    }
  }

  const delivery = deliverySubjects(repoRoot);
  if (delivery.length === 0) {
    problems.push(
      'no module stores an asset stamped with AI-generated provenance; the stamp moved and this check is measuring nothing',
    );
  }
  const open = delivery.filter((subject) => !subject.screened).map((subject) => subject.file);
  const compared = auditBaseline(open, baseline);
  for (const key of compared.missingReason) {
    problems.push(`the baseline entry for ${key} needs a reason and the file that fixes it`);
  }
  for (const key of compared.grown) {
    problems.push(
      `${key} stores generated media without screening the bytes through ${OUTPUT_GATE}`,
    );
  }

  return { problems, admission, delivery, baseline: compared };
}

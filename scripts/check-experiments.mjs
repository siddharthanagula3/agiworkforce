#!/usr/bin/env node

/**
 * Every experiment is declared once, with the question it asks, who is never in
 * it, and what was decided.
 *
 * Four rules are not style. An experiment is assigned by one flag split, so
 * nobody is in two arms. Its exposure event is its own, so a subject counted as
 * exposed actually met the variation. It names the administrator control it
 * varies, so a workspace that turned that feature off is not in the test. And
 * it may not run on price, entitlement, safety behaviour or consent, which are
 * not questions to answer by coin toss on half the population.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readVocabulary } from './check-feature-registry.mjs';

export const REGISTRY_PATH = 'packages/contracts/types/src/experiment-registry.json';
export const REGISTRY_MODULE = 'packages/contracts/types/src/experiment-registry.ts';
export const DOMAIN_REGISTRY = 'packages/contracts/types/src/domain-registry.json';
export const WORKSPACE_CONTROLS = 'packages/contracts/types/src/enterprise/workspace-controls.ts';
export const READER_MODULE = 'apps/web/lib/feature-flags/experiments.ts';

const EXPERIMENT_ID = /^[a-z][a-z0-9_]*$/;
const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const SHORTEST_ANSWER = 20;
const LEAST_ARMS = 2;

/**
 * Words that name something a person agreed to. An experiment that varies this
 * is asking whether a different wording gets more consent, which is not a
 * question this product is allowed to ask.
 */
const CONSENT_WORDS = /consent|terms_of|privacy_polic|agreement|opt_in|opt_out/i;

function read(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

function readJson(repoRoot, relativePath) {
  const raw = read(repoRoot, relativePath);
  return raw === null ? null : JSON.parse(raw);
}

function isSentence(value) {
  return typeof value === 'string' && value.trim().length >= SHORTEST_ANSWER;
}

function checkOne({ repoRoot, id, definition, vocabularies, events, errors }) {
  const say = (message) => errors.push(`${REGISTRY_PATH}: "${id}" ${message}`);

  if (!EXPERIMENT_ID.test(id)) say('is not an experiment id, so no flag key can carry it');
  for (const [field, label] of [
    ['hypothesis', 'the question it is asking'],
    ['population', 'who is eligible'],
    ['primaryMetric', 'the one number that decides it'],
  ]) {
    if (!isSentence(definition[field])) say(`states no ${field}: ${label} is missing`);
  }
  if (typeof definition.owner !== 'string' || !existsSync(path.join(repoRoot, definition.owner))) {
    say(`is owned by ${JSON.stringify(definition.owner)}, which is not a path in this repository`);
  }
  if (!Array.isArray(definition.exclusions)) {
    say('lists no exclusions, so nothing says who is never assigned to it');
  }
  if (!Array.isArray(definition.guardrails) || definition.guardrails.length === 0) {
    say('names no guardrail, so nothing would stop it once it is doing harm');
  }

  const variants = definition.variants;
  if (!Array.isArray(variants) || variants.length < LEAST_ARMS) {
    say(`declares fewer than ${LEAST_ARMS} arms, which is not a comparison`);
  } else {
    if (variants[0] !== vocabularies.control) {
      say(
        `does not begin with the "${vocabularies.control}" arm, so nothing says what it is against`,
      );
    }
    if (new Set(variants).size !== variants.length) say('declares the same arm twice');
    if (variants.includes('off')) {
      say('declares an "off" arm; off is the kill switch every flag carries, not a result column');
    }
  }

  if (!vocabularies.assignmentKeys.includes(definition.assignmentKey)) {
    say(
      `is bucketed by ${JSON.stringify(definition.assignmentKey)}, which is not a subject the flag ` +
        'evaluator can bucket, so its assignment would not be stable',
    );
  }
  if (!vocabularies.results.includes(definition.result)) {
    say(`records the result ${JSON.stringify(definition.result)}, which is not a result`);
  }
  if (!vocabularies.decisions.includes(definition.decision)) {
    say(`records the decision ${JSON.stringify(definition.decision)}, which is not a decision`);
  }

  if (!vocabularies.domains.includes(definition.domain)) {
    say(`is in the domain ${JSON.stringify(definition.domain)}, which no domain registry names`);
  } else if (vocabularies.forbiddenDomains.includes(definition.domain)) {
    say(
      `varies the ${definition.domain} domain. Price, entitlement, safety behaviour and consent ` +
        'are not decided by which half of the population somebody landed in.',
    );
  }
  if (definition.policy !== null && !vocabularies.policies.includes(definition.policy)) {
    say(
      `names the workspace control ${JSON.stringify(definition.policy)}, which does not exist, so ` +
        'an administrator who turned that feature off would still be in the test',
    );
  }

  if (!EVENT_NAME.test(definition.exposureEvent ?? '')) {
    say('has no exposure event, so nothing separates being assigned from meeting the variation');
  } else if (events.has(definition.exposureEvent)) {
    say(
      `shares the exposure event "${definition.exposureEvent}" with "${events.get(definition.exposureEvent)}", ` +
        'so neither experiment can count its own exposures',
    );
  } else {
    events.set(definition.exposureEvent, id);
  }
  for (const [field, value] of [
    ['exposureEvent', definition.exposureEvent],
    ['primaryMetric', definition.primaryMetric],
  ]) {
    if (typeof value === 'string' && CONSENT_WORDS.test(value)) {
      say(`measures ${field} ${JSON.stringify(value)}, which varies what a person agreed to`);
    }
  }

  const start = Date.parse(definition.startAt ?? '');
  const end = Date.parse(definition.endAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    say('does not say when it starts and ends, so it runs until somebody notices');
    return;
  }
  if (end <= start) say('ends before it starts');
  if (end > Date.now() && definition.decision !== 'pending') {
    say(`is still running and already records the decision "${definition.decision}"`);
  }
  if (end <= Date.now() && (definition.result === 'pending' || definition.decision === 'pending')) {
    say(
      `ended on ${definition.endAt} with no result and no decision, which is how a finished test ` +
        'becomes a permanent split nobody remembers taking',
    );
  }
}

export function checkExperiments(repoRoot) {
  const errors = [];
  const module = read(repoRoot, REGISTRY_MODULE);
  const domains = readJson(repoRoot, DOMAIN_REGISTRY);
  const controls = read(repoRoot, WORKSPACE_CONTROLS);
  if (module === null || domains === null || controls === null) {
    errors.push(
      `${REGISTRY_MODULE}, ${DOMAIN_REGISTRY} and ${WORKSPACE_CONTROLS} must all be readable; the ` +
        'experiment vocabulary is resolved against them.',
    );
    return { errors, experiments: 0 };
  }
  if (read(repoRoot, READER_MODULE) === null) {
    errors.push(
      `${READER_MODULE}: the one module that turns an experiment into a flag key is gone, so an ` +
        'experiment would be assigned by whatever each caller invented.',
    );
  }

  const vocabularies = {
    assignmentKeys: readVocabulary(module, 'EXPERIMENT_ASSIGNMENT_KEYS') ?? [],
    results: readVocabulary(module, 'EXPERIMENT_RESULTS') ?? [],
    decisions: readVocabulary(module, 'EXPERIMENT_DECISIONS') ?? [],
    forbiddenDomains: readVocabulary(module, 'EXPERIMENT_FORBIDDEN_DOMAINS') ?? [],
    control: /EXPERIMENT_CONTROL_VARIANT = '([^']+)'/.exec(module)?.[1] ?? null,
    domains: (domains.domains ?? []).map((domain) => domain.name),
    policies: readVocabulary(controls, 'WORKSPACE_FEATURES') ?? [],
  };
  for (const [name, members] of Object.entries(vocabularies)) {
    if (name === 'control' ? members !== null : members.length > 0) continue;
    errors.push(`${REGISTRY_MODULE}: ${name} is empty, so nothing about an experiment is checked.`);
  }
  if (vocabularies.forbiddenDomains.length > 0) {
    for (const domain of vocabularies.forbiddenDomains) {
      if (vocabularies.domains.includes(domain)) continue;
      errors.push(
        `${REGISTRY_MODULE}: EXPERIMENT_FORBIDDEN_DOMAINS names "${domain}", which ${DOMAIN_REGISTRY} ` +
          'does not, so that refusal would never fire.',
      );
    }
  }

  const registry = readJson(repoRoot, REGISTRY_PATH);
  if (registry === null) {
    errors.push(`${REGISTRY_PATH}: the experiment registry is gone; no experiment is declared.`);
    return { errors, experiments: 0 };
  }
  const experiments = registry.experiments ?? {};
  const events = new Map();
  for (const [id, definition] of Object.entries(experiments)) {
    checkOne({ repoRoot, id, definition, vocabularies, events, errors });
  }
  return { errors, experiments: Object.keys(experiments).length };
}

function main() {
  const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
  const { errors, experiments } = checkExperiments(repoRoot);
  if (errors.length > 0) {
    console.error('Experiment check failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `Experiment check passed (${experiments} declared experiments, each with one assignment flag, ` +
      'its own exposure event, a guardrail and a decision).',
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();

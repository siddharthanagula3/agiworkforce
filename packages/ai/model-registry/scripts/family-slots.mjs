#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

import { FAMILY_CATALOG_DIR, loadFamilySnapshot } from './compile.mjs';
import {
  FAMILY_CATALOG_FILE,
  applyPromotion,
  applyRollback,
  buildPromotion,
  evaluateFamily,
} from './families.mjs';
import { LIFECYCLE_STAGE, stageAtOrAfter, stageTransitionRejection } from './lifecycle-stages.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_FILE = path.join(FAMILY_CATALOG_DIR, FAMILY_CATALOG_FILE);
const CURATION_FILE = path.join(FAMILY_CATALOG_DIR, 'models.curation.json');
const RETIRED_FILE = path.join(FAMILY_CATALOG_DIR, 'retired-models.json');
const PROBES_FILE = path.join(FAMILY_CATALOG_DIR, 'probes.json');
const ANSWERED_PROBE_OUTCOME = 'answered';
const EVALUATION_FLOOR_STAGE = LIFECYCLE_STAGE.evaluated;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function attentionFor(decision, family, policy) {
  const notes = [];
  if (policy.blockedLifecycles.includes(decision.activeLifecycle)) {
    notes.push(`active model is ${decision.activeLifecycle}`);
  }
  if (
    decision.activeLifecycle === policy.previewLifecycle &&
    family.lifecyclePolicy === policy.stableLifecycle
  ) {
    notes.push('preview model occupies a stable slot');
  }
  return notes;
}

function report(decisions, familyCatalog) {
  const { policy, families } = familyCatalog;
  let promotions = 0;
  let blocked = 0;
  for (const decision of decisions) {
    const family = families[decision.familyId];
    const attention = attentionFor(decision, family, policy);
    const header = `${decision.familyId} → ${decision.active} (gen ${decision.activeGeneration}, ${decision.activeLifecycle}, ${family.lifecyclePolicy} slot)`;
    if (decision.promotable) promotions += 1;
    if (decision.evaluations.length === 0 && attention.length === 0) {
      console.log(`  ${header}`);
      continue;
    }
    console.log(`  ${header}`);
    for (const note of attention) console.log(`      attention: ${note}`);
    for (const evaluation of decision.evaluations) {
      const verdict = evaluation.eligible ? 'PROMOTABLE' : 'blocked';
      if (!evaluation.eligible) blocked += 1;
      console.log(
        `      candidate ${evaluation.modelKey} (gen ${evaluation.generation}, ${evaluation.lifecycle}): ${verdict}`,
      );
      for (const entry of evaluation.gates) {
        if (evaluation.eligible && entry.passed) continue;
        console.log(`        ${entry.passed ? 'pass' : 'FAIL'} ${entry.id}: ${entry.detail}`);
      }
    }
  }
  return { promotions, blocked };
}

function runGate(label, command, args) {
  process.stdout.write(`[families] gate ${label} … `);
  try {
    execFileSync(command, args, { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    console.log('pass');
    return { passed: true, detail: `${label} passed` };
  } catch (error) {
    console.log('FAIL');
    const output = String(error.stdout ?? error.stderr ?? '').trim();
    return { passed: false, detail: output.split('\n').slice(-12).join('\n') };
  }
}

function testFiles() {
  const dir = path.join(PACKAGE_ROOT, 'tests');
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.test.mjs'))
    .map((entry) => path.join('tests', entry));
}

function verifyRegistry() {
  const compiled = runGate('registryValidation', process.execPath, ['scripts/compile.mjs']);
  if (!compiled.passed) return compiled;
  return runGate('registrySuite', process.execPath, ['--test', ...testFiles()]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function writeJson(file, value) {
  const config = (await prettier.resolveConfig(file)) ?? {};
  fs.writeFileSync(
    file,
    await prettier.format(JSON.stringify(value), { ...config, parser: 'json', filepath: file }),
  );
}

/**
 * Every authored file this tool touches moves together or not at all. A
 * lifecycle stage that advanced while the slot it justifies was reverted would
 * be a claim about a promotion that did not happen.
 */
async function commitEdits(edits) {
  const previous = edits.map(({ file }) => [file, fs.readFileSync(file, 'utf8')]);
  for (const { file, value } of edits) await writeJson(file, value);
  const verdict = verifyRegistry();
  if (!verdict.passed) {
    for (const [file, text] of previous) fs.writeFileSync(file, text);
    execFileSync(process.execPath, ['scripts/compile.mjs'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    console.error('[families] ✗ gate failed; authored catalog reverted and registry regenerated.');
    console.error(verdict.detail);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/**
 * A promotion claims two things about a model: that it was measured, and that
 * it answers. Both are recorded elsewhere, so both are checked here rather than
 * assumed. Evaluation is the stage floor, sourced scores being what the stage
 * stands for; the probe record is the second, because a model can be scored on
 * a page and still be unreachable from this account.
 */
export function lifecycleRefusals(modelKey, curation, probeFile, target) {
  const model = curation.models[modelKey];
  if (!model) return [`${modelKey} is not in the curation catalog`];
  const stage = model.lifecycle?.stage;
  const refusals = [];
  if (!stageAtOrAfter(stage, EVALUATION_FLOOR_STAGE)) {
    refusals.push(
      `${modelKey} is at lifecycle stage ${stage} and has not passed ${EVALUATION_FLOOR_STAGE}`,
    );
  }
  const transition = stageTransitionRejection(modelKey, stage, target);
  if (transition) refusals.push(transition);
  if (probeFile?.probes?.[modelKey]?.outcome !== ANSWERED_PROBE_OUTCOME) {
    refusals.push(
      `${modelKey} has no answered probe in ${path.relative(PACKAGE_ROOT, PROBES_FILE)}; run \`pnpm probe:models\` first`,
    );
  }
  return refusals;
}

function readProbeFile() {
  return fs.existsSync(PROBES_FILE) ? readJson(PROBES_FILE) : { probes: {} };
}

export function stagedModel(model, stage, stagedOn, source) {
  return { ...model, lifecycle: { stage, stagedOn, source } };
}

function evaluateAll() {
  const { familyCatalog, snapshot } = loadFamilySnapshot();
  const decisions = Object.entries(familyCatalog.families).map(([familyId, family]) =>
    evaluateFamily(familyId, family, snapshot, familyCatalog.policy),
  );
  return { familyCatalog, snapshot, decisions };
}

function evaluate(args) {
  const { familyCatalog, decisions } = evaluateAll();
  console.log(`[families] ${decisions.length} family slot(s)`);
  const { promotions, blocked } = report(decisions, familyCatalog);
  console.log(
    `[families] ${promotions} promotion(s) available, ${blocked} candidate(s) held by policy`,
  );
  if (args.includes('--strict') && promotions > 0) {
    console.error(
      '[families] ✗ --strict: an eligible promotion is pending. Run `promote --apply`.',
    );
    process.exitCode = 1;
  }
}

async function promote(args) {
  const { familyCatalog, snapshot, decisions } = evaluateAll();
  const only = argValue(args, '--slot');
  const reason = argValue(args, '--reason');
  const apply = args.includes('--apply');
  const now = today();

  const targets = decisions.filter(
    (decision) => decision.promotable && (only === undefined || decision.familyId === only),
  );
  if (targets.length === 0) {
    console.log('[families] no eligible promotion');
    return;
  }

  const curation = readJson(CURATION_FILE);
  const probeFile = readProbeFile();
  const refusals = targets.flatMap((decision) =>
    lifecycleRefusals(decision.promotable.modelKey, curation, probeFile, LIFECYCLE_STAGE.promoted),
  );
  if (refusals.length > 0) {
    for (const refusal of refusals) console.error(`[families] ✗ ${refusal}`);
    process.exitCode = 1;
    return;
  }

  const next = { ...familyCatalog, families: { ...familyCatalog.families } };
  const nextCuration = { ...curation, models: { ...curation.models } };
  for (const decision of targets) {
    const family = next.families[decision.familyId];
    const promotion = buildPromotion(
      decision.promotable,
      snapshot,
      familyCatalog.policy,
      reason ??
        `automatic family upgrade from ${family.active.modelKey} to ${decision.promotable.modelKey}`,
      now,
    );
    next.families[decision.familyId] = applyPromotion(family, promotion, familyCatalog.policy);
    nextCuration.models[promotion.modelKey] = stagedModel(
      nextCuration.models[promotion.modelKey],
      LIFECYCLE_STAGE.promoted,
      now,
      `${path.relative(PACKAGE_ROOT, CATALOG_FILE)}#${decision.familyId}`,
    );
    console.log(
      `[families] ${apply ? 'promote' : 'would promote'} ${decision.familyId}: ${family.active.modelKey} → ${promotion.modelKey}`,
    );
  }
  if (!apply) {
    console.log('[families] dry run, pass --apply to write and verify');
    return;
  }
  if (
    await commitEdits([
      { file: CATALOG_FILE, value: next },
      { file: CURATION_FILE, value: nextCuration },
    ])
  ) {
    console.log(`[families] ✓ ${targets.length} promotion(s) applied and verified`);
  }
}

async function rollback(args) {
  const { familyCatalog } = loadFamilySnapshot();
  const only = argValue(args, '--slot');
  const reason = argValue(args, '--reason');
  const apply = args.includes('--apply');
  if (!only) {
    console.error('[families] rollback requires --slot <familyId>');
    process.exitCode = 1;
    return;
  }
  const family = familyCatalog.families[only];
  if (!family) {
    console.error(`[families] unknown family slot ${only}`);
    process.exitCode = 1;
    return;
  }
  if (!family.previous) {
    console.error(`[families] ${only} has no previous model to roll back to`);
    process.exitCode = 1;
    return;
  }
  const rolled = applyRollback(
    family,
    reason ?? `rollback from ${family.active.modelKey} to ${family.previous.modelKey}`,
    today(),
    familyCatalog.policy,
  );
  console.log(
    `[families] ${apply ? 'roll back' : 'would roll back'} ${only}: ${family.active.modelKey} → ${rolled.active.modelKey}`,
  );
  if (!apply) {
    console.log('[families] dry run, pass --apply to write and verify');
    return;
  }
  const next = { ...familyCatalog, families: { ...familyCatalog.families, [only]: rolled } };
  if (await commitEdits([{ file: CATALOG_FILE, value: next }])) {
    console.log(`[families] ✓ ${only} rolled back and verified`);
  }
}

function status() {
  const { familyCatalog } = loadFamilySnapshot();
  for (const [familyId, family] of Object.entries(familyCatalog.families)) {
    const chain = family.fallbackChain.length > 0 ? family.fallbackChain.join(' → ') : 'none';
    console.log(
      `${familyId}\n  active   ${family.active.modelKey} (gen ${family.active.generation}, ${family.active.lifecycle}) since ${family.active.promotedAt}\n  previous ${family.previous?.modelKey ?? 'none'}\n  fallback ${chain}\n  reason   ${family.active.promotionReason}`,
    );
  }
}

/**
 * Retirement in two deliberate moves. `--model <key>` deprecates: the model
 * stays in the catalog, still resolvable, and announces that it is going away.
 * `--remove` then takes it out of the roster and into retired-models.json,
 * which is what makes reintroducing the id fail. A model may not skip the
 * announcement: the transition table refuses removal from any other stage.
 */
async function retire(args) {
  const modelKey = argValue(args, '--model');
  const remove = args.includes('--remove');
  const apply = args.includes('--apply');
  const now = today();
  if (!modelKey) {
    console.error('[families] retire requires --model <modelKey>');
    process.exitCode = 1;
    return;
  }

  const curation = readJson(CURATION_FILE);
  const model = curation.models[modelKey];
  const target = remove ? LIFECYCLE_STAGE.removed : LIFECYCLE_STAGE.deprecated;
  if (!model) {
    console.error(`[families] unknown model ${modelKey}`);
    process.exitCode = 1;
    return;
  }
  const refusal = stageTransitionRejection(modelKey, model.lifecycle?.stage, target);
  if (refusal) {
    console.error(`[families] ✗ ${refusal}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[families] ${apply ? 'retire' : 'would retire'} ${modelKey}: ${model.lifecycle?.stage} → ${target}`,
  );
  if (!apply) {
    console.log('[families] dry run, pass --apply to write and verify');
    return;
  }

  const edits = [];
  if (remove) {
    const nextModels = { ...curation.models };
    delete nextModels[modelKey];
    const retired = readJson(RETIRED_FILE);
    const retiredIds = [...new Set([...retired.retiredModelIds, modelKey])];
    edits.push({ file: CURATION_FILE, value: { ...curation, models: nextModels } });
    edits.push({ file: RETIRED_FILE, value: { ...retired, retiredModelIds: retiredIds } });
  } else {
    const source = `${path.relative(PACKAGE_ROOT, CURATION_FILE)}#${modelKey}.deprecation_date`;
    const deprecated = stagedModel(
      { ...model, deprecated: true, deprecation_date: model.deprecation_date ?? now },
      target,
      now,
      source,
    );
    edits.push({
      file: CURATION_FILE,
      value: { ...curation, models: { ...curation.models, [modelKey]: deprecated } },
    });
  }

  if (await commitEdits(edits)) {
    console.log(`[families] ✓ ${modelKey} is ${target} and verified`);
  }
}

const COMMANDS = { evaluate, promote, rollback, retire, status };

async function main() {
  const args = process.argv.slice(2);
  const command = COMMANDS[args[0]] ?? evaluate;
  await command(args);
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error('[families] fatal:', error);
    process.exitCode = 1;
  });
}

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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_FILE = path.join(FAMILY_CATALOG_DIR, FAMILY_CATALOG_FILE);

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

async function writeCatalog(catalog) {
  const config = (await prettier.resolveConfig(CATALOG_FILE)) ?? {};
  const text = await prettier.format(JSON.stringify(catalog), {
    ...config,
    parser: 'json',
    filepath: CATALOG_FILE,
  });
  fs.writeFileSync(CATALOG_FILE, text);
}

async function commitCatalog(nextCatalog, previousText) {
  await writeCatalog(nextCatalog);
  const verdict = verifyRegistry();
  if (!verdict.passed) {
    fs.writeFileSync(CATALOG_FILE, previousText);
    execFileSync(process.execPath, ['scripts/compile.mjs'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    console.error('[families] ✗ gate failed; family catalog reverted and registry regenerated.');
    console.error(verdict.detail);
    process.exitCode = 1;
    return false;
  }
  return true;
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

  const previousText = fs.readFileSync(CATALOG_FILE, 'utf8');
  const next = { ...familyCatalog, families: { ...familyCatalog.families } };
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
    console.log(
      `[families] ${apply ? 'promote' : 'would promote'} ${decision.familyId}: ${family.active.modelKey} → ${promotion.modelKey}`,
    );
  }
  if (!apply) {
    console.log('[families] dry run, pass --apply to write and verify');
    return;
  }
  if (await commitCatalog(next, previousText)) {
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
  const previousText = fs.readFileSync(CATALOG_FILE, 'utf8');
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
  if (await commitCatalog(next, previousText)) {
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

const COMMANDS = { evaluate, promote, rollback, status };

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

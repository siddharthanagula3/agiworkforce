#!/usr/bin/env -S pnpm exec tsx
/**
 * The staged-release command: verify, advance a channel, roll back.
 *
 * Run through tsx, because the contract it enforces is the TypeScript module
 * beside it rather than a second copy of the rules. A model registry rollback
 * is delegated to `model-registry/scripts/family-slots.mjs`, which owns the
 * family slot and its fallback chain; this tool only records the channel.
 */

import { execFileSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

import {
  applyRecord,
  currentRelease,
  effectiveSlotCandidates,
  planAdvance,
  planRollback,
  probeBindingProblems,
  recordsFor,
  releaseLedgerProblems,
  slotBindingProblems,
} from './release-ledger';
import { spliceSlotCandidates, spliceTopLevelObject } from './json-splice.mjs';
import { malformedPromptReleaseIds } from './prompt-release';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../../..');
const REGISTRY_PACKAGE = path.join(REPO_ROOT, 'packages/ai/model-registry');
const CATALOG_DIR = path.join(REGISTRY_PACKAGE, 'catalog');
const ROUTING_POLICIES_FILE = path.join(CATALOG_DIR, 'routing-policies.json');
const PROBES_FILE = path.join(CATALOG_DIR, 'probes.json');
const REGISTRY_FILE = path.join(REGISTRY_PACKAGE, 'generated/registry.json');
const FAMILY_SLOTS_SCRIPT = path.join(REGISTRY_PACKAGE, 'scripts/family-slots.mjs');
const ROUTING_POLICY_ID = 'auto';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * A splice, not a re-serialization: only the ledger block and the staged slots
 * are rewritten, and prettier formats what was inserted.
 */
export async function writeRelease(file, ledger, slots) {
  let text = spliceTopLevelObject(
    fs.readFileSync(file, 'utf8'),
    'release',
    ledger,
    'schemaVersion',
  );
  for (const [slotId, candidates] of Object.entries(slots ?? {})) {
    text = spliceSlotCandidates(text, slotId, candidates);
  }
  const config = (await prettier.resolveConfig(file)) ?? {};
  fs.writeFileSync(
    file,
    await prettier.format(text, { ...config, parser: 'json', filepath: file }),
  );
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function declaredSlotCandidates(policies) {
  const declared = {};
  for (const [slotId, slot] of Object.entries(policies.auto?.slots ?? {})) {
    const candidates = {};
    if (slot.canary !== undefined) candidates.canary = slot.canary;
    if (slot.shadow !== undefined) candidates.shadow = slot.shadow;
    if (Object.keys(candidates).length > 0) declared[slotId] = candidates;
  }
  return declared;
}

function loadLedger(policies) {
  const release = policies.release;
  if (release === undefined) {
    throw new Error(`${ROUTING_POLICIES_FILE} declares no release ledger`);
  }
  return release;
}

function familySlotProblems(ledger) {
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  const families = readJson(REGISTRY_FILE).families ?? {};
  return ledger.records
    .filter((record) => record.artifact === 'model_registry' && families[record.id] === undefined)
    .map(
      (record) =>
        `release record v${record.version} names ${record.id}, which is not a family slot`,
    );
}

function verify(args = []) {
  const policies = readJson(ROUTING_POLICIES_FILE);
  const ledger = loadLedger(policies);
  const probes = readJson(argValue(args, '--probes') ?? PROBES_FILE).probes ?? {};
  const problems = [
    ...releaseLedgerProblems(ledger),
    ...malformedPromptReleaseIds(ledger),
    ...slotBindingProblems(ledger, declaredSlotCandidates(policies)),
    ...probeBindingProblems(ledger, probes),
    ...familySlotProblems(ledger),
  ];
  for (const problem of problems) console.log(`FAIL ${problem}`);
  console.log(
    `[release] policy version ${ledger.policyVersion}, ${ledger.records.length} record(s): ${
      problems.length === 0 ? 'every channel is justified by the evidence beside it' : 'see above'
    }`,
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}

function ledgerKeys(ledger) {
  const seen = new Map();
  for (const record of ledger.records) {
    seen.set(`${record.artifact}:${record.id}`, { artifact: record.artifact, id: record.id });
  }
  return [...seen.values()];
}

function status() {
  const ledger = loadLedger(readJson(ROUTING_POLICIES_FILE));
  console.log(`[release] policy version ${ledger.policyVersion}`);
  for (const { artifact, id } of ledgerKeys(ledger)) {
    const record = currentRelease(ledger, artifact, id);
    const rollback = planRollback(ledger, artifact, id, today());
    console.log(
      `${artifact}:${id}\n  channel  ${record.channel} since ${record.effectiveOn} (v${record.version})\n  rollback ${
        rollback.to === null ? 'none recorded' : `${rollback.to.channel} (v${rollback.to.version})`
      }\n  reason   ${record.reason}`,
    );
  }
}

/**
 * The CI stage. It asks whether each internal artifact could advance and each
 * released one could roll back, and writes nothing either way.
 */
function drill(args) {
  const ledger = loadLedger(readJson(ROUTING_POLICIES_FILE));
  const quality = qualityFrom(args);
  const failures = [];
  const keys = ledgerKeys(ledger);
  const internal = keys.filter(
    ({ artifact, id }) => currentRelease(ledger, artifact, id).channel === 'internal',
  );
  if (args.includes('--require-quality') && quality === undefined && internal.length > 0) {
    failures.push(
      `${internal.length} artifact(s) wait on internal and no eval quality signal was offered`,
    );
  }
  for (const { artifact, id } of keys) {
    const record = currentRelease(ledger, artifact, id);
    if (record.channel === 'internal') {
      const plan = planAdvance(ledger, {
        artifact,
        id,
        channel: 'canary',
        effectiveOn: today(),
        reason: `canary drill for ${artifact}:${id}`,
        slots: record.slots,
        quality,
      });
      if (plan.record === null) {
        failures.push(`${artifact}:${id} cannot advance to canary: ${plan.refusals.join('; ')}`);
      } else {
        console.log(
          `[release] ${artifact}:${id} internal to canary is legal as v${plan.record.version}`,
        );
      }
    }
    const back = planRollback(ledger, artifact, id, today());
    if (back.record !== null) {
      console.log(
        `[release] ${artifact}:${id} rolls back to v${back.to.version} (${back.to.channel}) in one command`,
      );
    } else if (recordsFor(ledger, artifact, id).length > 1) {
      failures.push(`${artifact}:${id} has a history but no rollback: ${back.refusals.join('; ')}`);
    } else {
      console.log(`[release] ${artifact}:${id} is at its first release; nothing to roll back to`);
    }
  }
  if (args.includes('--families')) failures.push(...familyRollbackDrill());
  for (const failure of failures) console.log(`FAIL ${failure}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

/**
 * The model registry half. family-slots.mjs owns the slot and its fallback
 * chain, so the drill asks it to plan the rollback rather than reimplementing.
 */
function familyRollbackDrill() {
  if (!fs.existsSync(REGISTRY_FILE)) return ['no generated registry to read family slots from'];
  const families = readJson(REGISTRY_FILE).families ?? {};
  const rollable = Object.entries(families).filter(([, family]) => family.previousModelKey);
  if (rollable.length === 0) {
    console.log('[release] no family slot has a previous model; nothing to drill');
    return [];
  }
  const failures = [];
  for (const [familyId] of rollable) {
    try {
      const output = execFileSync(
        process.execPath,
        [FAMILY_SLOTS_SCRIPT, 'rollback', '--slot', familyId],
        { cwd: REGISTRY_PACKAGE, encoding: 'utf8' },
      );
      if (!output.includes('would roll back')) {
        failures.push(`${familyId} rollback planned nothing: ${output.trim()}`);
      } else {
        console.log(`[release] ${output.split('\n')[0]}`);
      }
    } catch (error) {
      failures.push(`${familyId} rollback failed: ${String(error.stdout ?? error.message).trim()}`);
    }
  }
  return failures;
}

function qualityFrom(args) {
  const commit = argValue(args, '--quality-commit');
  if (commit === undefined) return undefined;
  return {
    gate: argValue(args, '--quality-gate') ?? 'evals/promotion-gate',
    commit,
    verdict: argValue(args, '--quality-verdict') ?? 'held',
    measuredOn: argValue(args, '--quality-on') ?? today(),
  };
}

/**
 * `--slot-canary <slotId>=<modelKey>:<fraction>` and
 * `--slot-shadow <slotId>=<modelKey>:<dailyRequestCap>`, repeatable.
 */
export function slotsFrom(args) {
  const slots = {};
  for (const [index, arg] of args.entries()) {
    const kind = arg === '--slot-canary' ? 'canary' : arg === '--slot-shadow' ? 'shadow' : null;
    if (kind === null) continue;
    const raw = args[index + 1] ?? '';
    const [slotId, rest] = raw.split('=');
    const [modelKey, value] = (rest ?? '').split(':');
    if (!slotId || !modelKey || value === undefined) {
      throw new Error(`${arg} expects <slotId>=<modelKey>:<value>, got ${raw}`);
    }
    slots[slotId] = {
      ...slots[slotId],
      [kind]:
        kind === 'canary'
          ? { modelKey, trafficFraction: Number.parseFloat(value) }
          : { modelKey, dailyRequestCap: Number.parseInt(value, 10) },
    };
  }
  return Object.keys(slots).length === 0 ? undefined : slots;
}

/**
 * A slot the new record drops has to be cleared from the policy: that is what
 * makes a rollback pull a live canary rather than only record that it was.
 */
function slotsToWrite(ledger, record) {
  const staged = { ...effectiveSlotCandidates(ledger), ...(record.slots ?? {}) };
  return Object.fromEntries(Object.keys(staged).map((slotId) => [slotId, record.slots?.[slotId]]));
}

async function commit(ledger, record, apply) {
  if (!apply) {
    console.log('[release] dry run, pass --apply to write');
    return;
  }
  await writeRelease(
    ROUTING_POLICIES_FILE,
    applyRecord(ledger, record),
    slotsToWrite(ledger, record),
  );
  console.log(
    `[release] wrote v${record.version} to ${path.relative(REPO_ROOT, ROUTING_POLICIES_FILE)}; run \`pnpm sync:models\` and the registry tests before committing`,
  );
}

async function advance(args) {
  const ledger = loadLedger(readJson(ROUTING_POLICIES_FILE));
  const artifact = argValue(args, '--artifact') ?? 'routing_policy';
  const id = argValue(args, '--id') ?? ROUTING_POLICY_ID;
  const channel = argValue(args, '--channel');
  const reason = argValue(args, '--reason');
  if (!channel || !reason) {
    console.error('usage: advance --channel <internal|canary|stable> --reason <why> [--apply]');
    process.exitCode = 2;
    return;
  }
  const plan = planAdvance(ledger, {
    artifact,
    id,
    channel,
    effectiveOn: argValue(args, '--on') ?? today(),
    reason,
    slots: slotsFrom(args),
    quality: qualityFrom(args),
  });
  if (plan.record === null) {
    for (const refusal of plan.refusals) console.error(`[release] ✗ ${refusal}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[release] ${artifact}:${id} → ${channel} as v${plan.record.version}`);
  await commit(ledger, plan.record, args.includes('--apply'));
}

async function rollback(args) {
  const ledger = loadLedger(readJson(ROUTING_POLICIES_FILE));
  const artifact = argValue(args, '--artifact') ?? 'routing_policy';
  const id = argValue(args, '--id') ?? ROUTING_POLICY_ID;
  const apply = args.includes('--apply');
  const plan = planRollback(
    ledger,
    artifact,
    id,
    argValue(args, '--on') ?? today(),
    argValue(args, '--reason'),
  );
  if (plan.record === null) {
    for (const refusal of plan.refusals) console.error(`[release] ✗ ${refusal}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[release] ${artifact}:${id} v${plan.from.version} (${plan.from.channel}) → v${plan.to.version} (${plan.to.channel}) as v${plan.record.version}`,
  );
  if (artifact === 'model_registry') {
    const slotArgs = ['rollback', '--slot', id, ...(apply ? ['--apply'] : [])];
    console.log(`[release] delegating the family slot to family-slots.mjs ${slotArgs.join(' ')}`);
    execFileSync(process.execPath, [FAMILY_SLOTS_SCRIPT, ...slotArgs], {
      cwd: REGISTRY_PACKAGE,
      stdio: 'inherit',
    });
  }
  await commit(ledger, plan.record, apply);
}

const COMMANDS = { verify, status, drill, advance, rollback };

async function main() {
  const args = process.argv.slice(2);
  const command = COMMANDS[args[0]] ?? verify;
  await command(args);
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error('[release] fatal:', error);
    process.exitCode = 1;
  });
}

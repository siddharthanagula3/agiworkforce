#!/usr/bin/env node
/**
 * A guard nothing runs is a green check that measures nothing. This enumerates
 * every scripts/check-*.mjs and asks the one question the chain cannot answer
 * about itself: does anything execute it.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = 'scripts/config/guard-inventory.json';
export const ROOT_CHAIN = 'check:llm-operability';
const WORKFLOW_DIR = '.github/workflows';
const MIN_REASON = 60;
const MIN_OWED = 30;

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

export function guardFiles(root) {
  const dir = path.join(root, 'scripts');
  return fs
    .readdirSync(dir)
    .filter((name) => /^check-.*\.mjs$/.test(name) && !name.endsWith('.test.mjs'))
    .sort();
}

/**
 * A chain entry may itself be a chain, so the closure is taken over the script
 * bodies rather than over the one line.
 */
export function chainClosure(scripts, entries) {
  const seen = new Set();
  const queue = [...entries];
  const bodies = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || typeof scripts[name] !== 'string') continue;
    seen.add(name);
    const body = scripts[name];
    bodies.push(body);
    for (const match of body.matchAll(/(?:pnpm|npm run|yarn)\s+([a-zA-Z0-9][a-zA-Z0-9:_-]*)/g)) {
      queue.push(match[1]);
    }
  }
  return { names: seen, commands: bodies.join('\n') };
}

/**
 * Only the body of a `run:` step counts. A guard named in a `paths:` trigger is
 * a reason to start the job, not a command the job executes.
 */
export function workflowCommands(root) {
  const dir = path.join(root, WORKFLOW_DIR);
  if (!fs.existsSync(dir)) return '';
  const blocks = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const lines = read(root, path.join(WORKFLOW_DIR, name)).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\s*)-?\s*run:\s*(.*)$/.exec(lines[index]);
      if (match === null) continue;
      const indent = match[1].length;
      blocks.push(match[2]);
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next];
        if (line.trim().length === 0) continue;
        if (line.search(/\S/) <= indent) break;
        blocks.push(line);
        index = next;
      }
    }
  }
  return blocks.join('\n');
}

function scriptNamesFor(scripts, file) {
  return Object.keys(scripts).filter((name) => scripts[name].includes(`scripts/${file}`));
}

export function inventory(root) {
  const manifest = JSON.parse(read(root, 'package.json'));
  const scripts = manifest.scripts ?? {};
  const chain = chainClosure(scripts, [ROOT_CHAIN]);
  const workflows = workflowCommands(root);
  const fromWorkflows = chainClosure(
    scripts,
    [...workflows.matchAll(/(?:pnpm|npm run|yarn)\s+([a-zA-Z0-9][a-zA-Z0-9:_-]*)/g)].map(
      (match) => match[1],
    ),
  );

  return guardFiles(root).map((file) => {
    const names = scriptNamesFor(scripts, file);
    const inChain =
      chain.commands.includes(`scripts/${file}`) || names.some((name) => chain.names.has(name));
    const inWorkflow =
      workflows.includes(`scripts/${file}`) ||
      fromWorkflows.commands.includes(`scripts/${file}`) ||
      names.some((name) => workflows.includes(name) || fromWorkflows.names.has(name));
    const selfTest = fs.existsSync(path.join(root, 'scripts', file.replace(/\.mjs$/, '.test.mjs')));
    const selfTestRun =
      !selfTest ||
      [chain, fromWorkflows].some((closure) =>
        [...closure.names].some((name) =>
          (scripts[name] ?? '').includes(file.replace(/\.mjs$/, '.test.mjs')),
        ),
      ) ||
      workflows.includes(file.replace(/\.mjs$/, '.test.mjs'));
    return { file, names, inChain, inWorkflow, selfTest, selfTestRun };
  });
}

export function loadBaseline(root) {
  const absolute = path.join(root, BASELINE_PATH);
  if (!fs.existsSync(absolute)) return { unwired: [] };
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

export function checkGuardInventory(root = REPO_ROOT) {
  const guards = inventory(root);
  const baseline = loadBaseline(root);
  const declared = new Map((baseline.unwired ?? []).map((entry) => [entry.guard, entry]));
  const failures = [];

  for (const guard of guards) {
    const wired = guard.inChain || guard.inWorkflow;
    const entry = declared.get(guard.file);
    if (wired) {
      if (entry !== undefined) {
        failures.push(
          `${guard.file} runs now; drop its entry from ${BASELINE_PATH} so the next unwired guard is visible`,
        );
      }
      continue;
    }
    if (entry === undefined) {
      failures.push(
        `${guard.file} is in neither ${ROOT_CHAIN} nor any workflow step, so nothing it checks is ever checked`,
      );
      continue;
    }
    if ((entry.reason ?? '').trim().length < MIN_REASON) {
      failures.push(`${BASELINE_PATH}: ${guard.file} needs a reason, not a name`);
    }
    if ((entry.owed ?? '').trim().length < MIN_OWED) {
      failures.push(`${BASELINE_PATH}: ${guard.file} needs the work that removes it`);
    }
  }

  const files = new Set(guards.map((guard) => guard.file));
  for (const entry of baseline.unwired ?? []) {
    if (!files.has(entry.guard)) {
      failures.push(`${BASELINE_PATH}: ${entry.guard} is no longer a guard in the tree`);
    }
  }

  for (const guard of guards) {
    if (declared.has(guard.file)) continue;
    if (!guard.selfTestRun) {
      failures.push(
        `${guard.file} ships a self-test that nothing runs, so the guard may already be broken`,
      );
    }
  }

  return { guards, failures };
}

const UNWIRED_REASON =
  'The guard exists and passes, but no chain and no workflow step executes it, so it is a green check that measures nothing. This is an oversight, not a decision.';

function owedLine(file) {
  const name = file.replace(/^check-/, '').replace(/\.mjs$/, '');
  return (
    `Add "check:${name}": "node --test scripts/check-${name}.test.mjs && node scripts/check-${name}.mjs" ` +
    `to the root manifest and "pnpm check:${name}" to check:llm-operability, then delete this entry.`
  );
}

/**
 * Other lanes wire and add guards while this one runs, so the list is written
 * from the tree rather than by hand. Reasons already recorded are kept.
 */
function writeBaseline(root) {
  const previous = new Map((loadBaseline(root).unwired ?? []).map((entry) => [entry.guard, entry]));
  const unwired = inventory(root)
    .filter((guard) => !guard.inChain && !guard.inWorkflow)
    .map((guard) => ({
      guard: guard.file,
      reason: previous.get(guard.file)?.reason ?? UNWIRED_REASON,
      owed: previous.get(guard.file)?.owed ?? owedLine(guard.file),
    }));
  fs.writeFileSync(
    path.join(root, BASELINE_PATH),
    JSON.stringify(
      {
        _description:
          'Guards that nothing executes. Every entry names why and the line that removes it. ' +
          'The guard refuses an undeclared unwired guard, and refuses an entry for a guard that ' +
          'has since been wired, so this list only shrinks.',
        unwired,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `check-guard-inventory: ${BASELINE_PATH} written, ${unwired.length} unwired guard(s).`,
  );
}

function main() {
  if (process.argv.includes('--write-baseline')) {
    writeBaseline(process.cwd());
    return;
  }
  const { guards, failures } = checkGuardInventory(process.cwd());
  const wired = guards.filter((guard) => guard.inChain || guard.inWorkflow).length;
  if (failures.length > 0) {
    console.error('Guards that measure nothing:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} finding(s).`);
    process.exit(1);
  }
  console.log(
    `check-guard-inventory: ${guards.length} guard(s), ${wired} wired, ` +
      `${guards.length - wired} declared unwired, ` +
      `${guards.filter((guard) => guard.selfTest).length} with a self-test.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

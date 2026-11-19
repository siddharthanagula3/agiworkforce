import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { EXCLUSIVE, concurrencyFrom, parseChain, runChain, summarize } from './run-guard-chain.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = path.join(ROOT, 'scripts/run-guard-chain.mjs');
const CHAIN_SCRIPT = 'check:llm-operability';
const WRAPPER = /^node scripts\/run-guard-chain\.mjs "([^"]+)"$/;
const WRITES =
  /\b(?:writeFileSync|appendFileSync|mkdirSync|rmSync|cpSync|copyFileSync|renameSync|unlinkSync)\b/;
const OWN_DIRECTORY = /\b(?:tmpdir|mkdtemp|mkdtempSync|makeTempDir|TMPDIR|RUNNER_TEMP)\b/;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function repositoryChain() {
  const match = WRAPPER.exec(manifest.scripts[CHAIN_SCRIPT]);
  assert.ok(match, `${CHAIN_SCRIPT} must hand its whole chain to the runner as one argument`);
  return parseChain(match[1]);
}

function recorder(outcomes = {}) {
  const calls = [];
  let active = 0;
  let peak = 0;
  const beside = new Map();
  const run = async (command) => {
    active += 1;
    peak = Math.max(peak, active);
    beside.set(command, Math.max(beside.get(command) ?? 0, active));
    await delay(2);
    const attempt = calls.filter((call) => call === command).length;
    calls.push(command);
    const planned = outcomes[command];
    const code = Array.isArray(planned) ? (planned[attempt] ?? planned.at(-1)) : (planned ?? 0);
    beside.set(command, Math.max(beside.get(command), active));
    active -= 1;
    return { command, code, ms: 2, output: `${command} output` };
  };
  return { run, calls, beside, peak: () => peak };
}

test('the repository chain is one runner call over every guard, with none repeated', () => {
  const entries = repositoryChain();
  assert.ok(entries.length > 200, `only ${entries.length} guards`);
  for (const entry of EXCLUSIVE) assert.ok(entries.includes(entry), `${entry} left the chain`);
});

test('a step that is not a pnpm script, an empty step or a repeat is refused', () => {
  for (const chain of [
    '',
    'pnpm check:a &&',
    'pnpm check:a && rm -rf .',
    'pnpm check:a; echo done',
    'pnpm check:a $(id)',
    'pnpm --filter ../escape check:a',
    'pnpm check:a && pnpm check:a',
  ]) {
    assert.throws(() => parseChain(chain), chain);
  }
  assert.deepEqual(parseChain('pnpm check:a && pnpm --filter @scope/pkg check:b'), [
    'pnpm check:a',
    'pnpm --filter @scope/pkg check:b',
  ]);
});

test('concurrency defaults to at most four and rejects anything but a small whole number', () => {
  assert.equal(concurrencyFrom(undefined, 16), 4);
  assert.equal(concurrencyFrom('', 2), 2);
  assert.equal(concurrencyFrom('1', 16), 1);
  assert.equal(concurrencyFrom('8', 2), 8);
  for (const value of ['0', '-1', '2.5', 'many', '17']) {
    assert.throws(() => concurrencyFrom(value, 8), value);
  }
});

test('exclusive guards run first, in chain order, with nothing beside them', async () => {
  const [first, second] = [...EXCLUSIVE];
  const entries = ['pnpm check:a', second, 'pnpm check:b', first, 'pnpm check:c', 'pnpm check:d'];
  const fake = recorder();
  const result = await runChain({ entries, concurrency: 3, run: fake.run, log: () => {} });
  assert.deepEqual(result, { total: 6, failed: [], recovered: [] });
  assert.deepEqual(fake.calls.slice(0, 2), [second, first]);
  assert.equal(fake.beside.get(first), 1);
  assert.equal(fake.beside.get(second), 1);
  assert.ok(fake.peak() > 1 && fake.peak() <= 3, `peak ${fake.peak()}`);
  assert.deepEqual([...fake.calls].sort(), [...entries].sort());
});

test('every failing guard is reported, not only the first', async () => {
  const entries = ['pnpm check:a', 'pnpm check:b', 'pnpm check:c', 'pnpm check:d'];
  const fake = recorder({ 'pnpm check:b': 1, 'pnpm check:d': 3 });
  const lines = [];
  const result = await runChain({
    entries,
    concurrency: 2,
    run: fake.run,
    log: (line) => lines.push(line),
  });
  assert.deepEqual(result.failed, ['pnpm check:b', 'pnpm check:d']);
  assert.deepEqual(result.recovered, []);
  assert.ok(fake.calls.includes('pnpm check:c'));
  assert.ok(lines.some((line) => line.startsWith('FAIL pnpm check:b')));
  assert.ok(lines.includes('pnpm check:b output'));
  assert.deepEqual(summarize(result), [
    'Guard chain failed: 2 of 4 guard(s).',
    '  pnpm check:b',
    '  pnpm check:d',
  ]);
});

test('a guard that fails beside others passes only if it then passes alone', async () => {
  const entries = ['pnpm check:a', 'pnpm check:b', 'pnpm check:c'];
  const fake = recorder({ 'pnpm check:a': [1, 0], 'pnpm check:c': [1, 1] });
  const result = await runChain({ entries, concurrency: 3, run: fake.run, log: () => {} });
  assert.deepEqual(result.failed, ['pnpm check:c']);
  assert.deepEqual(result.recovered, ['pnpm check:a']);
  assert.deepEqual(fake.calls.slice(-2), ['pnpm check:a', 'pnpm check:c']);
  assert.match(summarize(result)[0], /failed beside other guards and passed alone: pnpm check:a/);
});

test('one at a time is the plain chain without stopping: a failure is final', async () => {
  const entries = ['pnpm check:a', 'pnpm check:b', 'pnpm check:c'];
  const fake = recorder({ 'pnpm check:a': [1, 0] });
  const result = await runChain({ entries, concurrency: 1, run: fake.run, log: () => {} });
  assert.deepEqual(result.failed, ['pnpm check:a']);
  assert.deepEqual(fake.calls, entries);
  assert.equal(fake.peak(), 1);
});

test('an exclusive guard that fails is not run again', async () => {
  const [exclusive] = [...EXCLUSIVE];
  const fake = recorder({ [exclusive]: [1, 0] });
  const result = await runChain({
    entries: [exclusive, 'pnpm check:a'],
    concurrency: 4,
    run: fake.run,
    log: () => {},
  });
  assert.deepEqual(result.failed, [exclusive]);
  assert.equal(fake.calls.filter((call) => call === exclusive).length, 1);
});

function ownTests(entry) {
  const name = entry.replace(/^pnpm /, '');
  const definition = manifest.scripts[name] ?? '';
  return [...definition.matchAll(/(scripts\/[\w./-]+\.test\.[cm]js)/g)].map((match) => match[1]);
}

test('a guard whose own tests rewrite the checkout is held out of the concurrent pass', () => {
  const unsafe = [];
  for (const entry of repositoryChain()) {
    if (EXCLUSIVE.has(entry)) continue;
    for (const file of ownTests(entry)) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (WRITES.test(source) && !OWN_DIRECTORY.test(source)) unsafe.push(`${entry} (${file})`);
    }
  }
  assert.deepEqual(
    unsafe,
    [],
    'these tests write files without a directory of their own; add the guard to EXCLUSIVE',
  );
});

test('the command line runs every step, prints failures and exits non-zero', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-chain-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'guard-chain-fixture',
      private: true,
      scripts: {
        'check:pass': 'node -e "console.log(\'first ran\')"',
        'check:fail': 'node -e "console.error(\'broken here\'); process.exit(3)"',
        'check:after': 'node -e "console.log(\'after ran\')"',
      },
    }),
  );
  const invoke = (chain, concurrency) =>
    spawnSync(process.execPath, [RUNNER, chain], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, AGI_GUARD_CONCURRENCY: concurrency },
      timeout: 120_000,
    });

  const red = invoke('pnpm check:pass && pnpm check:fail && pnpm check:after', '2');
  assert.equal(red.status, 1, red.stdout + red.stderr);
  for (const text of ['first ran', 'broken here', 'after ran', 'Guard chain failed: 1 of 3']) {
    assert.ok(red.stdout.includes(text), `${text}\n${red.stdout}`);
  }

  const green = invoke('pnpm check:pass && pnpm check:after', '1');
  assert.equal(green.status, 0, green.stdout + green.stderr);
  assert.ok(green.stdout.includes('Guard chain passed: 2 guard(s).'));

  const refused = invoke('pnpm check:pass && echo unsafe', '1');
  assert.equal(refused.status, 2);
  assert.ok(!refused.stdout.includes('first ran'));
});

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function until(condition, limitMs) {
  const deadline = Date.now() + limitMs;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'timed out waiting');
    await delay(25);
  }
}

test('a cancelled run stops the whole process tree of a guard and starts no other', async (t) => {
  const lateMs = 3000;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-chain-stop-'));
  const started = path.join(directory, 'started');
  const late = path.join(directory, 'late');
  fs.writeFileSync(
    path.join(directory, 'slow.mjs'),
    [
      "import { spawn } from 'node:child_process';",
      "spawn(process.execPath, ['worker.mjs'], { stdio: 'inherit' });",
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'worker.mjs'),
    [
      "import fs from 'node:fs';",
      "fs.writeFileSync('started', String(process.pid));",
      "const lateMs = Number(process.env['GUARD_FIXTURE_LATE_MS']);",
      "setTimeout(() => fs.writeFileSync('late', 'written'), lateMs);",
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'guard-chain-stop-fixture',
      private: true,
      scripts: {
        'check:slow': 'node slow.mjs',
        'check:after': 'node -e "console.log(\'after ran\')"',
      },
    }),
  );

  const runner = spawn(process.execPath, [RUNNER, 'pnpm check:slow && pnpm check:after'], {
    cwd: directory,
    env: { ...process.env, AGI_GUARD_CONCURRENCY: '1', GUARD_FIXTURE_LATE_MS: String(lateMs) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let worker;
  t.after(() => {
    runner.kill('SIGKILL');
    if (worker !== undefined && isAlive(worker)) process.kill(worker, 'SIGKILL');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let output = '';
  runner.stdout.on('data', (chunk) => (output += chunk));
  runner.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => runner.once('exit', (code) => resolve(code)));

  await until(() => fs.existsSync(started) && fs.readFileSync(started, 'utf8') !== '', 60_000);
  worker = Number(fs.readFileSync(started, 'utf8'));
  assert.ok(isAlive(worker), 'the guard should be running before the cancel');

  runner.kill('SIGTERM');
  assert.equal(await exited, 143, output);
  await until(() => !isAlive(worker), 5000);
  await delay(lateMs + 500);
  assert.ok(!fs.existsSync(late), 'the guard kept working after the runner exited');
  assert.ok(!output.includes('after ran'), output);
  assert.match(output, /Guard chain cancelled by SIGTERM\./);
});

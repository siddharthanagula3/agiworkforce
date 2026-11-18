#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import console from 'node:console';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ENTRY = /^pnpm (?:--filter @[\w.-]+\/[\w.-]+ )?[\w:.-]+$/;

// These run one at a time before the concurrent pass. Each either runs cargo
// or has a test suite that rewrites tracked files in place and restores them,
// so a guard reading the checkout beside it would read something that is not
// the commit. run-guard-chain.test.mjs fails when a guard that writes this way
// is missing from the list.
export const EXCLUSIVE = new Set([
  'pnpm check:protocol-types',
  'pnpm check:cross-version-matrix',
  'pnpm check:script-tests',
  'pnpm check:rust-fmt',
]);

const MAX_CONCURRENCY = 16;
const DEFAULT_CONCURRENCY = 4;
const OUTPUT_LIMIT = 4 * 1024 * 1024;

export function parseChain(text) {
  const entries = String(text ?? '')
    .split('&&')
    .map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry === '')) {
    throw new Error('The guard chain is empty or has an empty step.');
  }
  for (const entry of entries) {
    if (!ENTRY.test(entry)) {
      throw new Error(`Refusing a guard chain step that is not a pnpm script: ${entry}`);
    }
  }
  const repeated = entries.filter((entry, index) => entries.indexOf(entry) !== index);
  if (repeated.length > 0) {
    throw new Error(`The guard chain repeats: ${[...new Set(repeated)].join(', ')}`);
  }
  return entries;
}

export function concurrencyFrom(value, cores = availableParallelism()) {
  if (value === undefined || value === '') {
    return Math.max(1, Math.min(DEFAULT_CONCURRENCY, cores));
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CONCURRENCY) {
    throw new Error(`AGI_GUARD_CONCURRENCY must be a whole number from 1 to ${MAX_CONCURRENCY}.`);
  }
  return parsed;
}

const running = new Set();

function runCommand(command) {
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    let size = 0;
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(child);
    const collect = (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      while (size > OUTPUT_LIMIT && chunks.length > 1) size -= chunks.shift().length;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const finish = (code, extra = '') => {
      running.delete(child);
      resolve({
        command,
        code,
        ms: Date.now() - started,
        output: Buffer.concat(chunks).toString('utf8') + extra,
      });
    };
    child.on('error', (error) => finish(1, `\n${error.message}\n`));
    child.on('close', (code, signal) => finish(code ?? 1, signal ? `\nended by ${signal}\n` : ''));
  });
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export async function runChain({
  entries,
  concurrency,
  run = runCommand,
  log = (line) => process.stdout.write(`${line}\n`),
}) {
  const report = (result) => {
    log(`${result.code === 0 ? 'ok  ' : 'FAIL'} ${result.command} (${seconds(result.ms)})`);
    const output = result.output.trimEnd();
    if (output) log(output);
  };

  const failed = [];
  const recovered = [];
  const alone = entries.filter((entry) => EXCLUSIVE.has(entry));
  const together = entries.filter((entry) => !EXCLUSIVE.has(entry));

  for (const entry of alone) {
    const result = await run(entry);
    report(result);
    if (result.code !== 0) failed.push(entry);
  }

  const retry = [];
  let next = 0;
  const worker = async () => {
    while (next < together.length) {
      const entry = together[next];
      next += 1;
      const result = await run(entry);
      report(result);
      if (result.code !== 0) retry.push(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, together.length) }, worker));

  const order = new Map(entries.map((entry, index) => [entry, index]));
  retry.sort((a, b) => order.get(a) - order.get(b));
  for (const entry of concurrency > 1 ? retry : []) {
    log(`Running ${entry} again with nothing beside it.`);
    const result = await run(entry);
    report(result);
    if (result.code === 0) recovered.push(entry);
    else failed.push(entry);
  }
  if (concurrency === 1) failed.push(...retry);

  failed.sort((a, b) => order.get(a) - order.get(b));
  return { total: entries.length, failed, recovered };
}

export function summarize({ total, failed, recovered }) {
  const lines = [];
  if (recovered.length > 0) {
    lines.push(
      `${recovered.length} guard(s) failed beside other guards and passed alone: ${recovered.join(', ')}`,
    );
  }
  if (failed.length === 0) {
    lines.push(`Guard chain passed: ${total} guard(s).`);
  } else {
    lines.push(`Guard chain failed: ${failed.length} of ${total} guard(s).`);
    for (const entry of failed) lines.push(`  ${entry}`);
  }
  return lines;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('usage: run-guard-chain.mjs "<pnpm script> && <pnpm script> ..."');
    process.exit(2);
  }
  let entries;
  let concurrency;
  try {
    entries = parseChain(args[0]);
    concurrency = concurrencyFrom(process.env['AGI_GUARD_CONCURRENCY']);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      for (const child of running) child.kill(signal);
      process.exit(130);
    });
  }
  console.log(`Running ${entries.length} guard(s), ${concurrency} at a time.`);
  const result = await runChain({ entries, concurrency });
  for (const line of summarize(result)) console.log(line);
  process.exit(result.failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

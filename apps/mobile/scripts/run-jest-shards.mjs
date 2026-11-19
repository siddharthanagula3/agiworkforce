#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// One in-band jest process keeps every loaded module graph until it exits, so the
// whole suite in one process runs out of heap. Each shard is its own process.
export const TEST_FILES_PER_PROCESS = 120;

export function shardCount(testFileCount, filesPerProcess = TEST_FILES_PER_PROCESS) {
  if (!Number.isInteger(testFileCount) || testFileCount < 0) {
    throw new Error(`test file count must be a non-negative integer, got ${testFileCount}`);
  }
  if (!Number.isInteger(filesPerProcess) || filesPerProcess <= 0) {
    throw new Error(`files per process must be a positive integer, got ${filesPerProcess}`);
  }
  return Math.max(1, Math.ceil(testFileCount / filesPerProcess));
}

export function countListedTests(listOutput) {
  return listOutput.split('\n').filter((line) => line.trim().length > 0).length;
}

export function jestRuns(forwardedArgs, testFileCount) {
  const base = ['--runInBand', '--forceExit'];
  if (forwardedArgs.length > 0) return [[...base, ...forwardedArgs]];
  const shards = shardCount(testFileCount);
  return Array.from({ length: shards }, (_, index) => [...base, `--shard=${index + 1}/${shards}`]);
}

function main() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const jestBin = createRequire(import.meta.url).resolve('jest/bin/jest');
  const forwardedArgs = process.argv.slice(2);
  let testFileCount = 0;
  if (forwardedArgs.length === 0) {
    const listed = spawnSync(process.execPath, [jestBin, '--listTests'], {
      cwd: appRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (listed.status !== 0) {
      process.stderr.write(listed.stderr ?? '');
      process.exit(listed.status ?? 1);
    }
    testFileCount = countListedTests(listed.stdout);
    if (testFileCount === 0) {
      process.stderr.write('jest listed no test files\n');
      process.exit(1);
    }
  }
  const runs = jestRuns(forwardedArgs, testFileCount);
  const failed = [];
  runs.forEach((args, index) => {
    if (runs.length > 1) {
      process.stdout.write(
        `\njest process ${index + 1} of ${runs.length} (${testFileCount} test files in all)\n`,
      );
    }
    const result = spawnSync(process.execPath, [jestBin, ...args], {
      cwd: appRoot,
      stdio: 'inherit',
    });
    if (result.status !== 0)
      failed.push({ run: index + 1, status: result.status, signal: result.signal });
  });
  if (failed.length > 0) {
    for (const failure of failed) {
      process.stderr.write(
        `jest process ${failure.run} of ${runs.length} failed (exit ${failure.status ?? 'none'}${failure.signal ? `, signal ${failure.signal}` : ''})\n`,
      );
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

/**
 * Runs a model's code against a case's unit tests in a sandboxed temp dir.
 *
 * The child is a fresh Node process under the permission model: it may read
 * only its own temp dir, may not write, spawn processes or start workers, and
 * a preloaded resolve hook refuses every networking and process module. The
 * environment is emptied and the run is killed at its timeout.
 *
 * @module evals/code-exec
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const OUTPUT_TAIL_CHARS = 400;
const ERROR_LINE = /\b[A-Za-z]*Error\b|ERR_[A-Z_]+/u;

const SANDBOX_GUARD = `import { registerHooks } from 'node:module';
const blocked = new Set(['net', 'http', 'https', 'http2', 'tls', 'dgram', 'dns', 'child_process', 'worker_threads', 'cluster', 'inspector']);
registerHooks({
  resolve(specifier, context, next) {
    if (blocked.has(specifier.replace(/^node:/, ''))) throw new Error('sandbox: ' + specifier + ' is not available');
    return next(specifier, context);
  },
});
globalThis.fetch = () => { throw new Error('sandbox: network is not available'); };
`;

const CODE_FENCE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/gu;
const JAVASCRIPT_FENCES = new Set(['', 'js', 'javascript', 'mjs', 'node']);

export function extractCode(text: string): string | null {
  const blocks = [...text.matchAll(CODE_FENCE)]
    .filter((match) => JAVASCRIPT_FENCES.has((match[1] ?? '').toLowerCase()))
    .map((match) => match[2] ?? '');
  if (blocks.length > 0) return blocks.at(-1)!;
  return text.includes('```') ? null : text.trim().length > 0 ? text : null;
}

export interface CodeRunResult {
  readonly passed: boolean;
  readonly detail: string;
}

export interface CodeRunOptions {
  readonly module: string;
  readonly tests: string;
  readonly timeoutMs?: number;
}

export async function runCodeTests(code: string, options: CodeRunOptions): Promise<CodeRunResult> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'agi-evals-code-')));
  try {
    await writeFile(join(dir, 'sandbox-guard.mjs'), SANDBOX_GUARD);
    await writeFile(join(dir, options.module), code);
    await writeFile(join(dir, 'tests.mjs'), options.tests);
    return await new Promise<CodeRunResult>((resolve) => {
      execFile(
        process.execPath,
        ['--permission', `--allow-fs-read=${dir}`, '--import', './sandbox-guard.mjs', 'tests.mjs'],
        {
          cwd: dir,
          env: {},
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          killSignal: 'SIGKILL',
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ passed: true, detail: 'tests passed' });
            return;
          }
          const reason = error.killed
            ? 'timed out'
            : `exited ${String(error.code ?? 'abnormally')}`;
          const output = `${stderr}${stdout}`.trim();
          const firstError = output.split('\n').find((line) => ERROR_LINE.test(line));
          const summary = (firstError ?? output).trim().slice(0, OUTPUT_TAIL_CHARS);
          resolve({ passed: false, detail: summary.length > 0 ? `${reason}: ${summary}` : reason });
        },
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import {
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_OUTPUT_BYTES,
  SHELL_TIMEOUT_DEFAULT_MS,
  SHELL_TIMEOUT_MAX_MS,
  ShellCommandRefused,
  evaluateShellPolicy,
  findControlCharacter,
  parseCommandLine,
  type ShellPolicy,
  type ShellPolicyVerdict,
  type ShellRunResult,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { PathRefused, resolveWithinRoot } from './pathGuard';

export interface ShellStreamChunk {
  runId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface RunShellCommandInput {
  /**
   * Chosen by the caller, because a run has to be cancellable and followable
   * before it finishes, and a value returned with the result arrives too late
   * for both.
   */
  runId: string;
  root: WorkspaceRoot;
  relativePath: string;
  command: string;
  timeoutMs?: number;
  policy: ShellPolicy;
  /** Asked once per run for anything the policy does not already allow. */
  approve: (verdict: ShellPolicyVerdict, command: string, cwd: string) => Promise<boolean>;
  emit: (chunk: ShellStreamChunk) => void;
}

const KILL_GRACE_MS = 2_000;

const running = new Map<string, ChildProcessWithoutNullStreams>();

/**
 * The PATH a login shell would have.
 *
 * An app launched from Finder inherits `/usr/bin:/bin:/usr/sbin:/sbin` and
 * nothing else, so every tool installed by Homebrew, mise, nvm or cargo is
 * missing and the user sees "command not found" for a program that plainly
 * exists in their terminal. The login shell is asked once for its PATH and the
 * answer is cached; the command itself still runs with no shell at all.
 */
let cachedLoginPath: string | null | undefined;

function loginPath(): Promise<string | null> {
  if (cachedLoginPath !== undefined) return Promise.resolve(cachedLoginPath);
  if (process.platform === 'win32') {
    cachedLoginPath = null;
    return Promise.resolve(null);
  }
  const shell = process.env['SHELL'] ?? '/bin/zsh';
  return new Promise((resolve) => {
    execFile(
      shell,
      ['-ilc', 'command -p printf %s "$PATH"'],
      { timeout: 5_000, windowsHide: true },
      (error, stdout) => {
        const value = error ? null : stdout.trim();
        cachedLoginPath = value && value.includes('/') ? value : null;
        resolve(cachedLoginPath);
      },
    );
  });
}

/**
 * The child's environment, minus the variables that describe this process.
 *
 * `ELECTRON_RUN_AS_NODE` and its siblings change how a spawned Electron or
 * Node binary starts, and inheriting them makes a child behave differently
 * under the app than it does in a terminal.
 */
function childEnvironment(pathValue: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ELECTRON_')) continue;
    env[key] = value;
  }
  if (pathValue) env['PATH'] = pathValue;
  return env;
}

function boundedTimeout(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return SHELL_TIMEOUT_DEFAULT_MS;
  }
  return Math.min(Math.round(requested), SHELL_TIMEOUT_MAX_MS);
}

async function resolveWorkingDirectory(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<{ absolute: string; relative: string }> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const stat = await fs.stat(resolved.absolute);
  if (!stat.isDirectory()) {
    throw new PathRefused('outside-workspace', 'A command runs in a folder, not in a file.');
  }
  return { absolute: resolved.absolute, relative: resolved.relative };
}

export function cancelShellRun(runId: string): boolean {
  const child = running.get(runId);
  if (!child) return false;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (running.has(runId)) child.kill('SIGKILL');
  }, KILL_GRACE_MS).unref?.();
  return true;
}

export function cancelAllShellRuns(): void {
  for (const runId of [...running.keys()]) cancelShellRun(runId);
}

/**
 * Runs one command inside an approved workspace folder.
 *
 * There is no shell: the command line is split into argv here and spawned
 * directly, so a semicolon is an argument rather than a second command and the
 * program named in the approval prompt is the only program that starts.
 */
export async function runShellCommand(input: RunShellCommandInput): Promise<ShellRunResult> {
  const command = input.command.trim();
  if (command.length === 0 || command.length > MAX_SHELL_COMMAND_LENGTH) {
    throw new ShellCommandRefused('too-long', 'That command is empty or too long to run.');
  }

  const control = findControlCharacter(command);
  if (control) {
    throw new ShellCommandRefused(
      'control-characters',
      `Local commands run without a shell, so "${control}" cannot be used. Run one program at a time; pipes, redirects and variables are not available here.`,
    );
  }

  const argv = parseCommandLine(command);
  if (!argv) {
    throw new ShellCommandRefused(
      'unparseable',
      'That command has an unclosed quote, so it could not be read.',
    );
  }

  const verdict = evaluateShellPolicy(input.policy, command);
  if (verdict.decision === 'deny') {
    throw new ShellCommandRefused(
      verdict.reason,
      verdict.message ?? `${verdict.program} is not allowed to run here.`,
    );
  }

  const cwd = await resolveWorkingDirectory(input.root, input.relativePath);

  if (verdict.decision === 'ask') {
    const approved = await input.approve(verdict, command, cwd.absolute);
    if (!approved) {
      throw new ShellCommandRefused('not-listed', `Running ${verdict.program} was not approved.`);
    }
  }

  const [program, ...args] = argv as [string, ...string[]];
  const timeoutMs = boundedTimeout(input.timeoutMs);
  const runId = input.runId;
  if (running.has(runId)) {
    throw new ShellCommandRefused('not-listed', 'That command is already running.');
  }
  const startedAtMs = Date.now();
  const env = childEnvironment(await loginPath());

  return new Promise<ShellRunResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(program, args, {
        cwd: cwd.absolute,
        env,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    running.set(runId, child);

    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      cancelShellRun(runId);
    }, timeoutMs);
    timer.unref?.();

    const collect = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
      if (truncated) return;
      bytes += data.byteLength;
      if (bytes > MAX_SHELL_OUTPUT_BYTES) {
        truncated = true;
        cancelShellRun(runId);
        return;
      }
      const text = data.toString('utf8');
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      input.emit({ runId, stream, chunk: text });
    };

    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(runId);
      resolve({
        runId,
        command,
        program: verdict.program,
        cwd: cwd.relative,
        exitCode,
        signal,
        stdout,
        stderr,
        truncated,
        timedOut,
        durationMs: Date.now() - startedAtMs,
      });
    };

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(runId);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(
          new ShellCommandRefused(
            'unparseable',
            `${program} was not found on this Mac. Install it, or run the command from a folder where it exists.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on('close', (code, signal) => finish(code, signal));
  });
}

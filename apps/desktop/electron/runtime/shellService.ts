import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BACKGROUND_SHELL_COLUMNS,
  BACKGROUND_SHELL_FIRST_OUTPUT_MS,
  BACKGROUND_SHELL_READ_SETTLE_MS,
  BACKGROUND_SHELL_ROWS,
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_INPUT_LENGTH,
  MAX_SHELL_OUTPUT_BYTES,
  SHELL_TIMEOUT_DEFAULT_MS,
  SHELL_TIMEOUT_MAX_MS,
  ShellCommandRefused,
  evaluateShellPolicy,
  findControlCharacter,
  parseCommandLine,
  type ShellPolicy,
  type ShellPolicyVerdict,
  type BackgroundCommandRun,
  type BackgroundShellOutput,
  type ShellRunResult,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { PathRefused, resolveWithinRoot } from './pathGuard';
import {
  findExecutable,
  planSandboxedSpawn,
  seatbeltToolchainRoots,
  type SandboxNetwork,
  type ShellSandbox,
} from './shellSandbox';

export interface ShellStreamChunk {
  runId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface ShellApprovalRequest {
  verdict: ShellPolicyVerdict;
  command: string;
  cwd: string;
  sandboxed: boolean;
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
  sandbox: ShellSandbox;
  network: SandboxNetwork;
  /**
   * Asked once per run for anything the policy does not already allow, and for
   * every run when no sandbox is available, allow-listed or not.
   */
  approve: (request: ShellApprovalRequest) => Promise<boolean>;
  emit: (chunk: ShellStreamChunk) => void;
  /**
   * Set by the server once the turn carries untrusted content. It asks even
   * for an allow-listed program: the folder grant was given before anything
   * in this turn could have steered the command.
   */
  review?: string;
}

const KILL_GRACE_MS = 2_000;

interface RunningCommand {
  child: ChildProcessWithoutNullStreams;
  command: string;
  rootName: string;
  startedAtMs: number;
}

const running = new Map<string, RunningCommand>();

interface BackgroundCommand {
  child: ChildProcessWithoutNullStreams;
  command: string;
  program: string;
  rootId: string;
  rootName: string;
  startedAtMs: number;
  terminal: boolean;
  unread: string[];
  unreadBytes: number;
  truncated: boolean;
  exited: boolean;
  exitCode: number | null;
  scratchDirectory: string | null;
}

const background = new Map<string, BackgroundCommand>();

const TERMINAL_SIZE = `stty rows ${BACKGROUND_SHELL_ROWS} cols ${BACKGROUND_SHELL_COLUMNS} 2>/dev/null; exec "$@"`;
const TERMINAL_FEED =
  'exec /usr/bin/script -q /dev/null /bin/sh -c "$0" agi-terminal "$@" < <(exec /bin/cat 2>/dev/null)';

export interface ShellInputApprovalRequest {
  program: string;
  input: string;
}

export function listShellRuns(): BackgroundCommandRun[] {
  const live = [...background.entries()].filter(([, run]) => !run.exited);
  return [...running.entries(), ...live].map(([runId, run]) => ({
    runId,
    command: run.command,
    rootName: run.rootName,
    startedAtMs: run.startedAtMs,
  }));
}

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

function missingProgram(program: string): ShellCommandRefused {
  return new ShellCommandRefused(
    'unparseable',
    `${program} was not found on this Mac. Install it, or run the command from a folder where it exists.`,
  );
}

function removeScratch(directory: string | null): void {
  if (!directory) return;
  fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
}

export function cancelShellRun(runId: string): boolean {
  const started = background.get(runId);
  if (started) {
    void stopProcessTree(started);
    return true;
  }
  const child = running.get(runId)?.child;
  if (!child) return false;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (running.has(runId)) child.kill('SIGKILL');
  }, KILL_GRACE_MS).unref?.();
  return true;
}

export function cancelAllShellRuns(): void {
  for (const runId of [...running.keys(), ...background.keys()]) cancelShellRun(runId);
}

/**
 * Runs one command inside an approved workspace folder.
 *
 * There is no shell: the command line is split into argv here and spawned
 * directly, so a semicolon is an argument rather than a second command and the
 * program named in the approval prompt is the only program that starts.
 */
interface PreparedCommand {
  command: string;
  verdict: ShellPolicyVerdict;
  program: string;
  cwd: { absolute: string; relative: string };
  env: NodeJS.ProcessEnv;
  spawnCommand: string;
  spawnArgs: string[];
  scratchDirectory: string | null;
  sandboxed: boolean;
}

async function prepareShellCommand(
  input: RunShellCommandInput,
  terminal: boolean,
): Promise<PreparedCommand> {
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

  const sandbox = input.sandbox;
  const sandboxed = sandbox.backend !== 'none';
  if (verdict.decision === 'ask' || !sandboxed || input.review !== undefined) {
    const approved = await input.approve({ verdict, command, cwd: cwd.absolute, sandboxed });
    if (!approved) {
      throw sandboxed
        ? new ShellCommandRefused('not-listed', `Running ${verdict.program} was not approved.`)
        : new ShellCommandRefused(
            'sandbox-unavailable',
            `${verdict.program} did not run. This computer has no sandbox for local commands, and running it without one was not approved.`,
          );
    }
  }

  const [program, ...args] = argv as [string, ...string[]];
  if (running.has(input.runId) || background.has(input.runId)) {
    throw new ShellCommandRefused('not-listed', 'That command is already running.');
  }
  const env = childEnvironment(await loginPath());

  let spawnCommand = program;
  let spawnArgs = args;
  let scratchDirectory: string | null = null;
  if (sandbox.backend !== 'none') {
    const executable = await findExecutable(program, env['PATH'], cwd.absolute);
    if (!executable) throw missingProgram(program);
    scratchDirectory = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'agi-shell-scratch-')),
    );
    try {
      const planned = planSandboxedSpawn({
        sandbox,
        program: executable,
        args,
        cwd: cwd.absolute,
        writableRoots: [await fs.realpath(input.root.path), scratchDirectory],
        readableRoots:
          sandbox.backend === 'seatbelt'
            ? await seatbeltToolchainRoots(env['PATH'], executable)
            : [],
        network: input.network,
        terminal,
      });
      spawnCommand = planned.command;
      spawnArgs = planned.args;
    } catch (error) {
      removeScratch(scratchDirectory);
      throw error;
    }
    env['TMPDIR'] = scratchDirectory;
  }
  return {
    command,
    verdict,
    program,
    cwd,
    env,
    spawnCommand,
    spawnArgs,
    scratchDirectory,
    sandboxed,
  };
}

export async function runShellCommand(input: RunShellCommandInput): Promise<ShellRunResult> {
  const {
    command,
    verdict,
    program,
    cwd,
    env,
    spawnCommand,
    spawnArgs,
    scratchDirectory,
    sandboxed,
  } = await prepareShellCommand(input, false);
  const timeoutMs = boundedTimeout(input.timeoutMs);
  const runId = input.runId;
  const startedAtMs = Date.now();

  return new Promise<ShellRunResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(spawnCommand, spawnArgs, {
        cwd: cwd.absolute,
        env,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      removeScratch(scratchDirectory);
      reject(error);
      return;
    }

    running.set(runId, { child, command, rootName: input.root.name, startedAtMs });

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
      removeScratch(scratchDirectory);
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
      removeScratch(scratchDirectory);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(
          sandboxed
            ? new ShellCommandRefused(
                'sandbox-unavailable',
                'The command sandbox could not be started, so the command did not run.',
              )
            : missingProgram(program),
        );
        return;
      }
      reject(error);
    });

    child.on('close', (code, signal) => finish(code, signal));
  });
}

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const CSI_SEQUENCE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g');
const OSC_SEQUENCE = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g');
const OTHER_ESCAPE = new RegExp(`${ESC}[@-Z\\\\-_]`, 'g');

export function terminalText(raw: string): string {
  const stripped = raw
    .replace(OSC_SEQUENCE, '')
    .replace(CSI_SEQUENCE, '')
    .replace(OTHER_ESCAPE, '');
  return stripped
    .split('\n')
    .map((line) => {
      const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
      const redrawn = trimmed.slice(trimmed.lastIndexOf('\r') + 1);
      let text = '';
      for (const character of redrawn) {
        if (character === '\b') text = text.slice(0, -1);
        else text += character;
      }
      return text;
    })
    .join('\n');
}

function collectBackground(
  run: BackgroundCommand,
  runId: string,
  emit: RunShellCommandInput['emit'],
) {
  return (stream: 'stdout' | 'stderr') => (data: Buffer) => {
    const text = data.toString('utf8');
    run.unread.push(text);
    run.unreadBytes += data.byteLength;
    while (run.unreadBytes > MAX_SHELL_OUTPUT_BYTES && run.unread.length > 1) {
      const dropped = run.unread.shift() ?? '';
      run.unreadBytes -= Buffer.byteLength(dropped, 'utf8');
      run.truncated = true;
    }
    emit({ runId, stream, chunk: text });
  };
}

function settle(run: BackgroundCommand, ms: number): Promise<void> {
  if (run.exited) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      run.child.off('close', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    run.child.once('close', done);
  });
}

function takeOutput(runId: string, run: BackgroundCommand): BackgroundShellOutput {
  const raw = run.unread.join('');
  run.unread = [];
  run.unreadBytes = 0;
  const truncated = run.truncated;
  run.truncated = false;
  if (run.exited) background.delete(runId);
  return {
    runId,
    command: run.command,
    program: run.program,
    output: terminalText(raw),
    running: !run.exited,
    exitCode: run.exitCode,
    truncated,
    terminal: run.terminal,
  };
}

async function descendantPids(pid: number): Promise<number[]> {
  const found: number[] = [];
  let frontier = [pid];
  while (frontier.length > 0) {
    const next = (await Promise.all(frontier.map(childPids))).flat();
    found.push(...next);
    frontier = next;
  }
  return found;
}

function childPids(pid: number): Promise<number[]> {
  return new Promise((resolve) => {
    execFile('/usr/bin/pgrep', ['-P', String(pid)], { timeout: 2_000 }, (_error, stdout) => {
      resolve(
        stdout
          .split('\n')
          .map((line) => Number.parseInt(line.trim(), 10))
          .filter((value) => Number.isInteger(value) && value > 0),
      );
    });
  });
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      return;
    }
  }
}

async function stopProcessTree(run: BackgroundCommand): Promise<void> {
  const pid = run.child.pid;
  if (run.exited || pid === undefined) return;
  const descendants = (await descendantPids(pid)).reverse();
  for (const descendant of descendants) signalProcessGroup(descendant, 'SIGTERM');
  run.child.stdin.end();
  run.child.kill('SIGTERM');
  setTimeout(() => {
    if (run.exited) return;
    for (const descendant of descendants) signalProcessGroup(descendant, 'SIGKILL');
    run.child.kill('SIGKILL');
  }, KILL_GRACE_MS).unref?.();
}

function requireBackgroundRun(runId: string, rootId: string): BackgroundCommand {
  const run = background.get(runId);
  if (!run || run.rootId !== rootId) {
    throw new ShellCommandRefused(
      'not-listed',
      'No command started with that runId is running in this folder.',
    );
  }
  return run;
}

export async function startBackgroundCommand(
  input: RunShellCommandInput,
): Promise<BackgroundShellOutput> {
  const terminal = process.platform === 'darwin';
  const prepared = await prepareShellCommand(input, terminal);
  const env: NodeJS.ProcessEnv = {
    ...prepared.env,
    TERM: 'xterm-256color',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    COLUMNS: String(BACKGROUND_SHELL_COLUMNS),
    LINES: String(BACKGROUND_SHELL_ROWS),
  };

  let child: ChildProcessWithoutNullStreams;
  try {
    child = terminal
      ? spawn(
          '/bin/bash',
          ['-c', TERMINAL_FEED, TERMINAL_SIZE, prepared.spawnCommand, ...prepared.spawnArgs],
          { cwd: prepared.cwd.absolute, env, shell: false, windowsHide: true },
        )
      : spawn(prepared.spawnCommand, prepared.spawnArgs, {
          cwd: prepared.cwd.absolute,
          env,
          shell: false,
          windowsHide: true,
        });
  } catch (error) {
    removeScratch(prepared.scratchDirectory);
    throw error;
  }
  child.stdin.on('error', () => undefined);

  const run: BackgroundCommand = {
    child,
    command: prepared.command,
    program: prepared.verdict.program,
    rootId: input.root.id,
    rootName: input.root.name,
    startedAtMs: Date.now(),
    terminal,
    unread: [],
    unreadBytes: 0,
    truncated: false,
    exited: false,
    exitCode: null,
    scratchDirectory: prepared.scratchDirectory,
  };
  background.set(input.runId, run);

  const finish = (code: number | null) => {
    run.exited = true;
    run.exitCode = code;
    run.child.stdin.end();
    removeScratch(run.scratchDirectory);
  };
  const collect = collectBackground(run, input.runId, input.emit);
  run.child.stdout.on('data', collect('stdout'));
  run.child.stderr.on('data', collect('stderr'));
  run.child.on('error', (error) => {
    run.unread.push(`\n${error.message}\n`);
    finish(null);
  });
  run.child.on('close', (code) => finish(code));

  await settle(run, BACKGROUND_SHELL_FIRST_OUTPUT_MS);
  return takeOutput(input.runId, run);
}

export async function readBackgroundCommand(
  runId: string,
  rootId: string,
  typed: string | undefined,
  approve: (request: ShellInputApprovalRequest) => Promise<boolean>,
): Promise<BackgroundShellOutput> {
  const run = requireBackgroundRun(runId, rootId);
  if (typed !== undefined && typed !== '') {
    if (run.exited) {
      throw new ShellCommandRefused('not-listed', `${run.program} has already stopped.`);
    }
    if (typed.length > MAX_SHELL_INPUT_LENGTH) {
      throw new ShellCommandRefused('too-long', 'That input is too long to type.');
    }
    if (!(await approve({ program: run.program, input: typed }))) {
      throw new ShellCommandRefused('not-listed', `Typing into ${run.program} was not approved.`);
    }
    await new Promise<void>((resolve) => {
      run.child.stdin.write(typed, () => resolve());
    });
    await settle(run, BACKGROUND_SHELL_READ_SETTLE_MS);
  }
  return takeOutput(runId, run);
}

export async function stopBackgroundCommand(
  runId: string,
  rootId: string,
): Promise<BackgroundShellOutput> {
  const run = requireBackgroundRun(runId, rootId);
  await stopProcessTree(run);
  await settle(run, KILL_GRACE_MS);
  return takeOutput(runId, run);
}

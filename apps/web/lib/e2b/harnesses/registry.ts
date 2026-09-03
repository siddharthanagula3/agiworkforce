import { createCodexStreamParser } from './codex-stream-parser';
import { createMessageStreamParser } from './message-stream-parser';
import { createResultJsonParser } from './result-json-parser';
import { createTextParser } from './text-parser';
import { joinCommand, quoteArgument } from './shell';
import type { HarnessRunner } from './types';

const CLAUDE = {
  binary: 'claude',
  skipPermissions: '--dangerously-skip-permissions',
  outputFormat: '--output-format stream-json',
  verbose: '--verbose',
  maxTurns: '--max-turns',
  resume: '--resume',
  prompt: '-p',
} as const;

const CODEX = {
  binary: 'codex',
  exec: 'exec',
  resume: 'resume',
  // `exec` has no `--full-auto`/`--ask-for-approval`; `exec resume` has no
  // `--sandbox` at all (codex-cli 0.147.0, verified live in the template).
  sandboxWorkspaceWrite: '--sandbox workspace-write',
  bypassApprovalsAndSandbox: '--dangerously-bypass-approvals-and-sandbox',
  skipGitRepoCheck: '--skip-git-repo-check',
  json: '--json',
} as const;

const AMP = {
  binary: 'amp',
  threadsContinue: 'threads continue',
  allowAll: '--dangerously-allow-all',
  streamJson: '--stream-json',
  streamJsonThinking: '--stream-json-thinking',
  execute: '-x',
} as const;

const OPENCODE = {
  binary: 'opencode',
  run: 'run',
} as const;

const DROID = {
  binary: 'droid',
  exec: 'exec',
  auto: '--auto low',
  outputFormat: '--output-format json',
  sessionId: '--session-id',
} as const;

const GROK = {
  binary: 'grok',
  alwaysApprove: '--always-approve',
  prompt: '-p',
} as const;

const claudeRunner: HarnessRunner = {
  runtimeId: 'claude',
  binary: CLAUDE.binary,
  supportsResume: true,
  buildCommand: (request) =>
    joinCommand([
      CLAUDE.binary,
      CLAUDE.skipPermissions,
      CLAUDE.outputFormat,
      CLAUDE.verbose,
      `${CLAUDE.maxTurns} ${request.maxTurns}`,
      request.resumeSessionId ? `${CLAUDE.resume} ${quoteArgument(request.resumeSessionId)}` : null,
      CLAUDE.prompt,
      quoteArgument(request.prompt),
    ]),
  createParser: () => createMessageStreamParser({ emitThinking: true }),
};

const codexRunner: HarnessRunner = {
  runtimeId: 'codex',
  binary: CODEX.binary,
  supportsResume: true,
  buildCommand: (request) =>
    joinCommand([
      CODEX.binary,
      CODEX.exec,
      request.resumeSessionId ? `${CODEX.resume} ${quoteArgument(request.resumeSessionId)}` : null,
      request.resumeSessionId ? CODEX.bypassApprovalsAndSandbox : CODEX.sandboxWorkspaceWrite,
      CODEX.skipGitRepoCheck,
      request.resumeSessionId ? null : CODEX.json,
      quoteArgument(request.prompt),
    ]),
  createParser: (request) =>
    request.resumeSessionId ? createTextParser() : createCodexStreamParser(),
};

const ampRunner: HarnessRunner = {
  runtimeId: 'amp',
  binary: AMP.binary,
  supportsResume: true,
  buildCommand: (request) =>
    joinCommand([
      AMP.binary,
      request.resumeSessionId
        ? `${AMP.threadsContinue} ${quoteArgument(request.resumeSessionId)}`
        : null,
      AMP.allowAll,
      AMP.streamJson,
      AMP.streamJsonThinking,
      AMP.execute,
      quoteArgument(request.prompt),
    ]),
  createParser: () => createMessageStreamParser({ emitThinking: true }),
};

const droidRunner: HarnessRunner = {
  runtimeId: 'droid',
  binary: DROID.binary,
  supportsResume: true,
  buildCommand: (request) =>
    joinCommand([
      DROID.binary,
      DROID.exec,
      DROID.auto,
      DROID.outputFormat,
      request.resumeSessionId
        ? `${DROID.sessionId} ${quoteArgument(request.resumeSessionId)}`
        : null,
      quoteArgument(request.prompt),
    ]),
  createParser: () => createResultJsonParser(),
};

const opencodeRunner: HarnessRunner = {
  runtimeId: 'opencode',
  binary: OPENCODE.binary,
  supportsResume: false,
  buildCommand: (request) =>
    joinCommand([OPENCODE.binary, OPENCODE.run, quoteArgument(request.prompt)]),
  createParser: () => createTextParser(),
};

const grokRunner: HarnessRunner = {
  runtimeId: 'grok',
  binary: GROK.binary,
  supportsResume: false,
  buildCommand: (request) =>
    joinCommand([GROK.binary, GROK.alwaysApprove, GROK.prompt, quoteArgument(request.prompt)]),
  createParser: () => createTextParser(),
};

const HARNESS_RUNNERS: readonly HarnessRunner[] = [
  claudeRunner,
  codexRunner,
  ampRunner,
  droidRunner,
  opencodeRunner,
  grokRunner,
];

const RUNNERS_BY_RUNTIME: ReadonlyMap<string, HarnessRunner> = new Map(
  HARNESS_RUNNERS.map((runner) => [runner.runtimeId, runner]),
);

export function selectHarnessRunner(runtimeId: string | null | undefined): HarnessRunner | null {
  if (!runtimeId) return null;
  return RUNNERS_BY_RUNTIME.get(runtimeId.trim()) ?? null;
}

export function harnessRuntimeIds(): readonly string[] {
  return HARNESS_RUNNERS.map((runner) => runner.runtimeId);
}

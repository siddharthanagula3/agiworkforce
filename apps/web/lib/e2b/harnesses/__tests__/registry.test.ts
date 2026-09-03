import { describe, expect, it } from 'vitest';

import { HARNESS_MAX_TURNS } from '../budget';
import { harnessRuntimeIds, selectHarnessRunner } from '../registry';
import type { HarnessRunRequest } from '../types';

const WORKSPACE = '/home/user/project';
const PROMPT = 'Fix the failing auth test';
const TIMEOUT_MS = 540_000;

function request(overrides: Partial<HarnessRunRequest> = {}): HarnessRunRequest {
  return {
    prompt: PROMPT,
    workspacePath: WORKSPACE,
    maxTurns: HARNESS_MAX_TURNS,
    timeoutMs: TIMEOUT_MS,
    ...overrides,
  };
}

function commandFor(runtimeId: string, overrides: Partial<HarnessRunRequest> = {}): string {
  const runner = selectHarnessRunner(runtimeId);
  if (!runner) throw new Error(`Expected a runner for ${runtimeId}`);
  return runner.buildCommand(request(overrides));
}

describe('harness runner selection', () => {
  it('covers every coding harness the catalogue offers a CLI for', () => {
    expect([...harnessRuntimeIds()].sort()).toEqual([
      'amp',
      'claude',
      'codex',
      'droid',
      'grok',
      'opencode',
    ]);
  });

  it('has no runner for a plain image, an unknown id or no id at all', () => {
    expect(selectHarnessRunner('code-interpreter-v1')).toBeNull();
    expect(selectHarnessRunner('k3s')).toBeNull();
    expect(selectHarnessRunner('openclaw')).toBeNull();
    expect(selectHarnessRunner('nonsense')).toBeNull();
    expect(selectHarnessRunner(null)).toBeNull();
  });
});

describe('harness start commands', () => {
  it('builds the documented headless invocation for each harness', () => {
    expect(commandFor('claude')).toBe(
      `claude --dangerously-skip-permissions --output-format stream-json --verbose --max-turns ${HARNESS_MAX_TURNS} -p '${PROMPT}'`,
    );
    expect(commandFor('codex')).toBe(
      `codex exec --full-auto --skip-git-repo-check --json '${PROMPT}'`,
    );
    expect(commandFor('amp')).toBe(
      `amp --dangerously-allow-all --stream-json --stream-json-thinking -x '${PROMPT}'`,
    );
    expect(commandFor('droid')).toBe(`droid exec --auto low --output-format json '${PROMPT}'`);
    expect(commandFor('opencode')).toBe(`opencode run '${PROMPT}'`);
    expect(commandFor('grok')).toBe(`grok --always-approve -p '${PROMPT}'`);
  });

  it('declares the per-run turn budget once, on the harness that documents the flag', () => {
    expect(commandFor('claude').match(/--max-turns/g)).toHaveLength(1);
    for (const runtimeId of ['codex', 'amp', 'droid', 'opencode', 'grok']) {
      expect(commandFor(runtimeId)).not.toContain('--max-turns');
    }
  });

  it('quotes a prompt that carries a single quote', () => {
    expect(commandFor('grok', { prompt: "don't break it" })).toBe(
      `grok --always-approve -p 'don'"'"'t break it'`,
    );
  });
});

describe('harness resume', () => {
  it('resumes only the harnesses whose docs describe it', () => {
    const resuming = harnessRuntimeIds().filter(
      (runtimeId) => selectHarnessRunner(runtimeId)?.supportsResume,
    );
    expect([...resuming].sort()).toEqual(['amp', 'claude', 'codex', 'droid']);
  });

  it('passes the stored session id in each harness own resume syntax', () => {
    expect(commandFor('claude', { resumeSessionId: 'session-1' })).toContain(
      "--resume 'session-1'",
    );
    expect(commandFor('amp', { resumeSessionId: 'T-1' })).toContain("threads continue 'T-1'");
    expect(commandFor('droid', { resumeSessionId: 'droid-1' })).toContain("--session-id 'droid-1'");
    expect(commandFor('codex', { resumeSessionId: 'thread-1' })).toBe(
      `codex exec resume 'thread-1' --full-auto --skip-git-repo-check '${PROMPT}'`,
    );
  });

  it('reads a resumed codex turn as text, because resume rejects the json flag', () => {
    const runner = selectHarnessRunner('codex');
    const resumed = runner?.createParser(request({ resumeSessionId: 'thread-1' }));
    const fresh = runner?.createParser(request());

    expect(
      resumed
        ?.push('{"type":"thread.started","thread_id":"thread-1"}', 'stdout')
        .map((event) => event.type),
    ).toEqual(['text-delta']);
    expect(
      fresh
        ?.push('{"type":"thread.started","thread_id":"thread-1"}', 'stdout')
        .map((event) => event.type),
    ).toEqual(['lifecycle']);
  });

  it('ignores a stored session id for a harness with no documented resume', () => {
    expect(commandFor('opencode', { resumeSessionId: 'session-1' })).toBe(
      `opencode run '${PROMPT}'`,
    );
    expect(commandFor('grok', { resumeSessionId: 'session-1' })).toBe(
      `grok --always-approve -p '${PROMPT}'`,
    );
  });
});

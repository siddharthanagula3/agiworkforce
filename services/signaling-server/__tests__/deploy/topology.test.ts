import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from '../../src/constants.js';
import { readTomlTables, tomlTable } from './toml-tables.js';

const root = path.resolve(import.meta.dirname, '../../../..');
const tables = readTomlTables(path.join(root, 'services/signaling-server/fly.toml'));
const workflow = parse(
  readFileSync(path.join(root, '.github/workflows/deploy-signaling-server.yml'), 'utf8'),
);
const step = workflow.jobs['deploy-fly'].steps.find(
  (candidate: { name?: string }) => candidate.name === 'Deploy to Fly.io',
);

function deployment(
  before: unknown,
  after: unknown,
  listFailure: boolean | 'after' = false,
  listDelay = false,
) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'relay-topology-'));
  try {
    const service = path.join(temporary, 'services/signaling-server');
    const bin = path.join(temporary, 'bin');
    mkdirSync(path.join(service, 'scripts'), { recursive: true });
    mkdirSync(bin);
    const guard = path.join(root, 'services/signaling-server/scripts/check-fly-machines.mjs');
    if (existsSync(guard)) {
      writeFileSync(path.join(service, 'scripts/check-fly-machines.mjs'), readFileSync(guard));
    }
    writeFileSync(path.join(temporary, 'before.json'), JSON.stringify(before));
    writeFileSync(path.join(temporary, 'after.json'), JSON.stringify(after));
    writeFileSync(
      path.join(bin, 'flyctl'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const deployed = fs.existsSync('deployed.json');
if (args[0] === 'machine' && args[1] === 'list') {
  if (JSON.stringify(args) !== JSON.stringify(['machine','list','--config','services/signaling-server/fly.toml','--json'])) process.exit(3);
  setTimeout(() => {
    fs.writeFileSync(1, fs.readFileSync(deployed ? 'after.json' : 'before.json', 'utf8'));
    if (process.env.LIST_FAILURE === 'yes' || (process.env.LIST_FAILURE === 'after' && deployed)) process.exit(2);
  }, process.env.LIST_DELAY === 'yes' ? 100 : 0);
} else if (args[0] === 'deploy') fs.writeFileSync('deployed.json', JSON.stringify(args));
else process.exit(3);
`,
      { mode: 0o755 },
    );
    let succeeded = true;
    try {
      execFileSync('/bin/bash', ['-eu', '-c', step.run], {
        cwd: temporary,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env['PATH']}`,
          CANDIDATE_SHA: 'a'.repeat(40),
          LIST_FAILURE: listFailure === 'after' ? 'after' : listFailure ? 'yes' : 'no',
          LIST_DELAY: listDelay ? 'yes' : 'no',
        },
        stdio: 'pipe',
      });
    } catch {
      succeeded = false;
    }
    let deployed: string[] | null = null;
    try {
      deployed = JSON.parse(readFileSync(path.join(temporary, 'deployed.json'), 'utf8'));
    } catch {
      deployed = null;
    }
    return { succeeded, deployed };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const machine = (id: string, state = 'started') => ({ id, state });

describe('one serving relay process', () => {
  it('serializes both production targets without cancelling an active deployment', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    const fly = workflow.jobs['deploy-fly'].concurrency;
    const railway = workflow.jobs['deploy-railway'].concurrency;
    expect(fly).toEqual({ group: 'signaling-production', 'cancel-in-progress': false });
    expect(railway).toEqual(fly);
  });

  it('keeps its only machine awake', () => {
    expect(tomlTable(tables, 'http_service').auto_stop_machines).toBe('off');
    expect(tomlTable(tables, 'http_service').min_machines_running).toBe('1');
  });
  it('routes only ready machines and permits a graceful rolling restart', () => {
    expect(tomlTable(tables, 'http_service.checks')).toMatchObject({
      path: '/ready',
      method: 'GET',
    });
    expect(tomlTable(tables, 'deploy').strategy).toBe('rolling');
    const runtime = tomlTable(tables, '');
    expect(runtime.kill_signal).toBe('SIGTERM');
    expect(Number(runtime.kill_timeout) * 1000).toBeGreaterThan(GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  });
  it('uses one memory declaration', () => {
    expect(tomlTable(tables, 'vm').memory_mb).toBe('1024');
    expect(tomlTable(tables, 'vm').memory).toBeUndefined();
  });
  it.each([[], [machine('one')], [machine('one', 'stopped')]].map((value) => [value]))(
    'permits a first or single-machine deploy: %j',
    (before) => {
      const result = deployment(before, [machine('one')]);
      expect(result.succeeded).toBe(true);
      expect(result.deployed).toContain('--ha=false');
    },
  );
  it.each(
    [
      [machine('one'), machine('two')],
      [machine('one'), machine('two', 'stopped')],
      {},
      null,
      [machine('one', 'unknown')],
    ].map((value) => [value]),
  )('refuses unsafe or invalid inventory before deployment: %j', (before) => {
    expect(deployment(before, [machine('one')])).toEqual({ succeeded: false, deployed: null });
  });
  it('waits for delayed machine-list output before admitting a safe deployment', () => {
    expect(deployment([machine('one')], [machine('one')], false, true).succeeded).toBe(true);
  });
  it('fails a post-deploy inventory request even if the CLI emits a plausible list', () => {
    const result = deployment([machine('one')], [machine('one')], 'after');
    expect(result.succeeded).toBe(false);
    expect(result.deployed).not.toBeNull();
  });
  it('refuses a failed inventory request before deployment', () => {
    expect(deployment([], [machine('one')], true)).toEqual({ succeeded: false, deployed: null });
  });
  it.each(
    [[], [machine('one'), machine('two')], [machine('one', 'stopped')]].map((value) => [value]),
  )('fails the post-deploy gate on unsafe inventory: %j', (after) => {
    const result = deployment([machine('one')], after);
    expect(result.succeeded).toBe(false);
    expect(result.deployed).not.toBeNull();
  });
});

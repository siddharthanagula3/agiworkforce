import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PublicRuntimeContainers } from './containers.mjs';
import { assertNoUnrecordedResources, restoreOwnership } from './cleanup.mjs';
import { DATABASE_SOCKET, digest, PROOF_LABEL } from './proof.mjs';

function harness() {
  const value = Object.create(PublicRuntimeContainers.prototype);
  Object.assign(value, {
    runId: 'a'.repeat(24),
    imageId: 'app-image',
    postgresImageId: 'pg-image',
    names: new Map(),
    volumes: new Set(),
    proofs: [],
    proofBindings: new WeakMap(),
  });
  return value;
}

test('the isolated database uses the official image bootstrap socket directory', () => {
  assert.equal(DATABASE_SOCKET, '/var/run/postgresql');
});

test('startup diagnostics read bounded stdout and stderr from the recorded owner', async () => {
  const value = harness();
  value.names.set('database', { id: 'original', image: value.postgresImageId });
  value.inspect = async (id) => {
    assert.equal(id, 'original');
    return {
      Id: id,
      Image: value.postgresImageId,
      Config: { Labels: { [PROOF_LABEL]: value.runId } },
      State: { ExitCode: 1 },
    };
  };
  const calls = [];
  value.docker = async (args, options) => {
    calls.push({ args, options });
    return 'x'.repeat(40 * 1024) + '\nbootstrap stderr';
  };
  const error = await value.readinessError('database', 'Database stopped');
  assert.match(error.message, /^Database stopped \(exit 1\):/);
  assert.ok(error.message.endsWith('bootstrap stderr'));
  assert.ok(error.message.length < 33 * 1024);
  assert.deepEqual(calls, [
    {
      args: ['logs', '--tail', '80', 'original'],
      options: { includeStderr: true, timeout: 10_000, maxBuffer: 128 * 1024 },
    },
  ]);
});

test('startup diagnostics refuse unowned and replaced containers without reading their logs', async () => {
  const value = harness();
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return '';
  };
  await assert.rejects(value.readinessError('unknown', 'stopped'), /unowned/);
  value.names.set('database', { id: 'original', image: value.postgresImageId });
  for (const change of [
    { Id: 'replacement' },
    { Image: 'replacement-image' },
    { Config: { Labels: {} } },
  ]) {
    value.inspect = async () => ({
      Id: 'original',
      Image: value.postgresImageId,
      Config: { Labels: { [PROOF_LABEL]: value.runId } },
      ...change,
    });
    await assert.rejects(value.readinessError('database', 'stopped'), /ownership changed/);
  }
  assert.deepEqual(calls, []);
});

test('unavailable diagnostics retain the failing readiness result', async () => {
  const value = harness();
  value.names.set('database', { id: 'original', image: value.postgresImageId });
  value.inspect = async () => ({
    Id: 'original',
    Image: value.postgresImageId,
    Config: { Labels: { [PROOF_LABEL]: value.runId } },
    State: { ExitCode: 1 },
  });
  value.docker = async () => {
    throw new Error('logging failed');
  };
  const error = await value.readinessError('database', 'Database stopped');
  assert.equal(error.message, 'Database stopped (exit 1):\nStartup logs unavailable');
});

test('docker log collection includes both pipes while ordinary commands retain stdout only', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-docker-output-'));
  try {
    await writeFile(
      path.join(directory, 'docker'),
      '#!/bin/sh\nprintf "stdout\\n"\nprintf "stderr\\n" >&2\n',
      {
        mode: 0o700,
      },
    );
    const value = harness();
    const options = { env: { PATH: directory } };
    assert.equal(await value.docker(['logs'], options), 'stdout');
    assert.equal(
      await value.docker(['logs'], { ...options, includeStderr: true }),
      'stdout\n\nstderr',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed name collision never makes a foreign container eligible for cleanup', async () => {
  const value = harness();
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    throw new Error('name collision');
  };
  value.inspect = async () => ({ Id: 'foreign-id', Image: value.imageId, Config: { Labels: {} } });
  await assert.rejects(value.run('occupied', [value.imageId]), /name collision/);
  await value.removeContainer('occupied');
  assert.equal(value.names.size, 0);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ['run'],
  );
});

test('a failed first ledger write cannot create a container or volume', async () => {
  for (const operation of ['run', 'volume']) {
    const value = harness();
    const commands = [];
    value.persistOwnership = async () => {
      throw new Error('ledger could not be committed');
    };
    value.docker = async (args) => {
      commands.push(args);
      return '';
    };
    await assert.rejects(
      operation === 'run' ? value.run('first', [value.imageId]) : value.volume('first'),
      /ledger could not be committed/,
    );
    assert.ok(commands.every((args) => args[0] === 'volume' && args[1] === 'ls'));
  }
});

test('creation begins only after an empty run record has been committed', async () => {
  const value = harness();
  let committed = false;
  value.persistOwnership = async () => {
    assert.equal(value.volumes.size, 0);
    committed = true;
  };
  value.docker = async (args) => {
    if (args[1] === 'create') assert.equal(committed, true);
    if (args[1] === 'inspect') throw new Error('interrupted after creation');
    return '';
  };
  await assert.rejects(value.volume('first'), /interrupted after creation/);
  assert.equal(committed, true);
});

test('unrecorded proof-labelled resources make cleanup fail without name-only or label-only deletion', async () => {
  for (const resource of ['container', 'volume']) {
    const commands = [];
    const docker = async (args) => {
      commands.push(args);
      return (resource === 'container' && args[0] === 'ps') ||
        (resource === 'volume' && args[0] === 'volume')
        ? 'unrecorded-resource'
        : '';
    };
    await assert.rejects(assertNoUnrecordedResources(docker), /Unmatched proof-labelled/);
    assert.ok(
      commands.every((args) => args[0] === 'ps' || (args[0] === 'volume' && args[1] === 'ls')),
    );
    assert.ok(commands.every((args) => !args.includes('rm')));
  }
  await assert.doesNotReject(assertNoUnrecordedResources(async () => ''));
});

test('stop and removal recheck recorded container identity, image and ownership', async () => {
  for (const method of ['stopContainer', 'removeContainer']) {
    for (const change of [
      { Id: 'replacement' },
      { Image: 'replacement-image' },
      { Config: { Labels: {} } },
    ]) {
      const value = harness();
      value.names.set('owned', { id: 'original', image: value.imageId });
      value.inspect = async () => ({
        Id: 'original',
        Image: value.imageId,
        Config: { Labels: { [PROOF_LABEL]: value.runId } },
        ...change,
      });
      const calls = [];
      value.docker = async (args) => {
        calls.push(args);
        return '';
      };
      await assert.rejects(value[method]('owned'), /ownership|unverified/);
      assert.deepEqual(calls, []);
    }
  }
  const value = harness();
  value.names.set('owned', { id: 'original', image: value.imageId });
  value.inspect = async () => ({
    Id: 'original',
    Image: value.imageId,
    Config: { Labels: { [PROOF_LABEL]: value.runId } },
  });
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return '';
  };
  await value.removeContainer('owned');
  assert.deepEqual(calls, [['rm', '--force', 'original']]);
});

test('volumes cannot be reused or removed based only on their requested name', async () => {
  const value = harness();
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return args.includes('inspect')
      ? JSON.stringify([{ Name: 'occupied', Labels: {}, Driver: 'local', Options: {} }])
      : 'occupied';
  };
  await assert.rejects(value.volume('occupied'), /existing proof volume/);
  value.volumes.add('occupied');
  await assert.rejects(value.removeVolume('occupied'), /unowned volume/);
  assert.ok(calls.every((args) => !args.includes('rm') && !args.includes('create')));
});

test('an app-image launch explicitly disables inherited healthchecks', async () => {
  const value = harness();
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return 'created';
  };
  value.inspect = async () => ({
    Id: 'created',
    Name: '/app',
    Image: value.imageId,
    Config: { Labels: { [PROOF_LABEL]: value.runId } },
  });
  await value.run('app', [value.imageId, 'node', 'observer.mjs']);
  assert.ok(calls[0].includes('--no-healthcheck'));
});

test('lifecycle sealing refuses incomplete cleanup and caller-mutated proof metadata', async () => {
  const dirty = harness();
  dirty.docker = async (args) => (args[0] === 'ps' ? 'remaining-owned-resource' : '');
  await assert.rejects(dirty.close(), /teardown is incomplete/);
  const value = harness();
  value.docker = async () => '';
  const proof = { imageId: value.imageId, teardownComplete: false };
  value.proofs.push(proof);
  value.proofBindings.set(proof, { digest: digest(proof), expected: { imageId: value.imageId } });
  proof.imageId = 'caller-redefined-image';
  await assert.rejects(value.close(), /changed before lifecycle sealing/);
  assert.equal(proof.teardownComplete, false);
});

test('interrupted cleanup restores exact owners and rejects changed revisions or foreign names', () => {
  const value = harness();
  value.revision = 'b'.repeat(40);
  const record = {
    revision: value.revision,
    runId: value.runId,
    containers: [
      [
        `agi-public-${value.runId}-app-0`,
        { id: 'c'.repeat(64), image: `sha256:${'d'.repeat(64)}` },
      ],
    ],
    volumes: [`agi-public-${value.runId}-output-0`],
  };
  restoreOwnership(value, record);
  assert.equal(value.names.values().next().value.id, 'c'.repeat(64));
  assert.equal(value.volumes.size, 1);
  assert.throws(() => restoreOwnership(value, { ...record, revision: 'different' }), /Invalid/);
  assert.throws(
    () => restoreOwnership(value, { ...record, volumes: ['foreign-volume'] }),
    /unverified owner/,
  );
});

test('a crash after removal can clean an already-absent recorded ID without touching a replacement', async () => {
  const value = harness();
  value.names.set('old-name', { id: 'original', image: value.imageId });
  value.inspect = async () => {
    throw new Error('removed');
  };
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return '';
  };
  await value.removeContainer('old-name');
  assert.equal(value.names.size, 0);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ['ps'],
  );
});

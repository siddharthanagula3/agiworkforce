import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { PublicRuntimeContainers } from './containers.mjs';
import { assertNoUnrecordedResources, restoreOwnership } from './cleanup.mjs';
import { DATABASE_PREFIX, DATABASE_SOCKET, digest, PROOF_LABEL } from './proof.mjs';

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

test('case listeners keep same-origin middleware rewrites internal', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-listener-'));
  const value = harness();
  const applicationRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const { NextRequest } = applicationRequire('next/server');
  const { getRelativeURL } = applicationRequire('next/dist/shared/lib/router/utils/relativize-url');
  Object.assign(value, {
    directory,
    root: directory,
    database: `${DATABASE_PREFIX}${value.runId}`,
    prefix: 'owned',
    index: 0,
    activeCase: null,
    databaseCommand: async () => '{}',
    configurePeer: async () => {},
    volume: async (name) => name,
    removeContainer: async () => {},
    docker: async () => '0',
  });
  let applicationArguments;
  value.run = async (name, args) => {
    if (name.endsWith('-permissions-0')) return name;
    assert.ok(name.endsWith('-app-0'));
    applicationArguments = args;
    throw new Error('Captured application launch');
  };
  try {
    await assert.rejects(
      value.startCase({ path: '/', pattern: '/' }),
      /Captured application launch/,
    );
    const dockerfile = await readFile(
      new URL('../../apps/web/Dockerfile', import.meta.url),
      'utf8',
    );
    const imageHostnames = [...dockerfile.matchAll(/^ENV HOSTNAME=(\S+)$/gm)];
    assert.equal(imageHostnames.length, 1);
    const hostname =
      applicationArguments.find((argument) => argument.startsWith('HOSTNAME='))?.slice(9) ??
      imageHostnames[0][1];
    const initialURL = `http://${hostname}:3000/`;
    const request = new NextRequest(initialURL, { headers: { host: '127.0.0.1:3000' } });
    assert.equal(getRelativeURL(request.url, initialURL), '/');
    assert.equal(applicationArguments[applicationArguments.indexOf('--network') + 1], 'none');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('http observations retain entry headers and document classification after middleware mutates them', async () => {
  const source = await readFile(new URL('./observer.mjs', import.meta.url), 'utf8');
  const start = 'const originalEmit = http.Server.prototype.emit;';
  const end = 'await startPublicHttpBridge();';
  assert.equal(source.split(start).length, 2);
  assert.equal(source.split(end).length, 2);
  const events = [];
  const report = { documents: [] };
  const originalEmit = http.Server.prototype.emit;
  const server = http.createServer((request, response) => {
    request.headers['x-original'] = 'changed by middleware';
    request.headers['content-security-policy'] = 'generated nonce';
    request.headers['sec-fetch-dest'] = 'document';
    response.end('fixture');
  });
  try {
    runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)), {
      http,
      structuredClone,
      report,
      record: (kind, value) => events.push(JSON.parse(JSON.stringify({ kind, ...value }))),
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    for (const destination of ['document', 'style']) {
      await new Promise((resolve, reject) => {
        const request = http.get(
          {
            hostname: '127.0.0.1',
            port: server.address().port,
            path: `/${destination}`,
            agent: false,
            headers: { 'x-original': 'entry', 'sec-fetch-dest': destination },
          },
          (response) => {
            response.resume();
            response.once('end', resolve);
          },
        );
        request.once('error', reject);
        request.setTimeout(5000, () => request.destroy(new Error('HTTP fixture timed out')));
      });
    }
    assert.equal(report.documents.length, 1);
    assert.equal(report.documents[0].headers['x-original'], 'entry');
    assert.equal(report.documents[0].headers['content-security-policy'], undefined);
    assert.deepEqual(
      events
        .filter(({ kind }) => kind === 'response')
        .map(({ kind: _kind, status: _status, ...value }) => value),
      events.filter(({ kind }) => kind === 'request').map(({ kind: _kind, ...value }) => value),
    );
  } finally {
    http.Server.prototype.emit = originalEmit;
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test('a ready bootstrap child cannot stand in for the final postgres process', async () => {
  for (const command of ['bash', 'docker-entrypoi', 'sh', '']) {
    const value = harness();
    value.pgName = 'database';
    const calls = [];
    value.docker = async (args) => {
      calls.push(args);
      return command;
    };
    assert.equal(await value.postgresReady(), false);
    assert.deepEqual(calls, [['exec', 'database', 'cat', '/proc/1/comm']]);
  }
});

test('the final postgres process must accept the exact fixture connection', async () => {
  const value = harness();
  value.pgName = 'database';
  value.database = 'fixture';
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return args.includes('/proc/1/comm') ? 'postgres' : '';
  };
  assert.equal(await value.postgresReady(), true);
  assert.deepEqual(calls, [
    ['exec', 'database', 'cat', '/proc/1/comm'],
    ['exec', 'database', 'pg_isready', '-h', DATABASE_SOCKET, '-U', 'postgres', '-d', 'fixture'],
  ]);
  value.docker = async (args) => {
    if (args.includes('/proc/1/comm')) return 'postgres';
    throw new Error('server is not accepting connections');
  };
  await assert.rejects(value.postgresReady(), /not accepting connections/);
});

test('startup diagnostics read bounded stdout and stderr from the recorded owner', async () => {
  const value = harness();
  value.names.set('database', { id: 'original', image: value.postgresImageId });
  value.inspect = async (id, options) => {
    assert.equal(id, 'original');
    assert.deepEqual(options, { timeout: 10_000, maxBuffer: 128 * 1024 });
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

test('failed cases collect only bounded diagnostics from verified current resources', async () => {
  const value = harness();
  value.activeCase = 0;
  value.handleBindings = new WeakMap();
  value.revision = 'b'.repeat(40);
  value.buildId = 'build';
  const handle = { index: 0, state: { stateId: 'root' }, appName: 'app', relayName: 'relay' };
  value.handleBindings.set(handle, digest(handle.state));
  for (const name of ['app', 'relay'])
    value.names.set(name, { id: `${name}-id`, image: value.imageId });
  value.inspect = async (id, options) => {
    assert.deepEqual(options, { timeout: 10_000, maxBuffer: 128 * 1024 });
    return {
      Id: id,
      Image: value.imageId,
      Config: { Labels: { [PROOF_LABEL]: value.runId } },
      State: { ExitCode: 0 },
    };
  };
  const commands = [];
  value.docker = async (args, options) => {
    commands.push({ args, options });
    return args[0] === 'exec' ? 'request failure' : 'runtime failure';
  };
  const result = await value.caseFailureDiagnostics(handle);
  assert.equal(result.failureOnly, true);
  assert.equal(result.eventsTail, 'request failure');
  assert.equal(result.stateId, 'root');
  assert.equal(result.teardownComplete, undefined);
  assert.equal(result.proofs, undefined);
  assert.equal(commands.length, 3);
  const events = commands[2];
  assert.deepEqual(events.args.slice(0, 3), ['exec', 'app-id', 'node']);
  assert.match(events.args[4], /Buffer\.alloc\(Math\.min\(size,65536\)\)/);
  assert.deepEqual(events.options, { timeout: 10_000, maxBuffer: 128 * 1024 });
  assert.match(result.limits[0], /not a complete runtime receipt/);
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-event-tail-'));
  try {
    const filename = path.join(directory, 'events.jsonl');
    const script = events.args[4].replace("'/proof-output/events.jsonl'", JSON.stringify(filename));
    for (const size of [0, 20, 90 * 1024]) {
      const content = Buffer.alloc(size);
      for (let offset = 0; offset + 4 <= size; offset += 4) content.writeUInt32LE(offset, offset);
      const expected = content.subarray(Math.max(0, size - 65_536));
      if (size > 65_536) assert.notDeepEqual(expected, content.subarray(0, 65_536));
      await writeFile(filename, content);
      const { stdout } = await promisify(execFile)(process.execPath, ['-e', script], {
        ...events.options,
        encoding: 'buffer',
      });
      assert.deepEqual(stdout, expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  commands.length = 0;
  handle.state.stateId = 'mutated';
  await assert.rejects(value.caseFailureDiagnostics(handle), /case identity changed/);
  assert.deepEqual(commands, []);

  handle.state.stateId = 'root';
  for (const change of [
    { Id: 'replacement' },
    { Image: 'replacement-image' },
    { Config: { Labels: {} } },
  ]) {
    let inspected = 0;
    value.inspect = async (id) => ({
      Id: id,
      Image: value.imageId,
      Config: { Labels: { [PROOF_LABEL]: value.runId } },
      State: { ExitCode: 0 },
      ...(++inspected === 3 ? change : {}),
    });
    commands.length = 0;
    await assert.rejects(value.caseFailureDiagnostics(handle), /ownership changed before/);
    assert.equal(commands.length, 2);
    assert.ok(commands.every(({ args }) => args[0] === 'logs'));
  }
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

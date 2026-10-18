import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { PublicRuntimeContainers } from './containers.mjs';
import * as cleanup from './cleanup.mjs';
const { assertNoUnrecordedResources, restoreOwnership } = cleanup;
import { DATABASE_PREFIX, DATABASE_SOCKET, digest, PROOF_LABEL, PROOF_ORIGIN } from './proof.mjs';

function harness() {
  const value = Object.create(PublicRuntimeContainers.prototype);
  Object.assign(value, {
    runId: 'a'.repeat(24),
    producerPid: process.pid,
    imageId: 'app-image',
    postgresImageId: 'pg-image',
    names: new Map(),
    volumes: new Set(),
    proofs: [],
    proofBindings: new WeakMap(),
  });
  return value;
}

test('concurrent lifecycle writes preserve the ownership ledger and leave no temporary files', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-ledger-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const value = harness();
  value.revision = 'b'.repeat(40);
  value.lifecycleFile = path.join(directory, `${value.runId}.json`);
  const name = `agi-public-${value.runId}-app-0`;
  const owner = { id: 'c'.repeat(64), image: `sha256:${'d'.repeat(64)}` };
  value.names.set(name, owner);
  const writes = await Promise.allSettled(
    Array.from({ length: 32 }, () => value.persistOwnership()),
  );
  assert.equal(writes.filter((result) => result.status === 'fulfilled').length, 32);
  const record = JSON.parse(await readFile(value.lifecycleFile, 'utf8'));
  const recovered = harness();
  recovered.revision = value.revision;
  restoreOwnership(recovered, record);
  assert.deepEqual([...recovered.names], [[name, owner]]);
  assert.deepEqual(await readdir(directory), [`${value.runId}.json`]);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('ledger writes serialize and snapshot the latest owners when each write begins', async () => {
  const value = harness();
  const entered = deferred();
  const release = deferred();
  const records = [];
  let active = 0;
  value.writeOwnership = async () => {
    assert.equal(++active, 1);
    records.push([...value.names.keys()]);
    if (records.length === 1) {
      entered.resolve();
      await release.promise;
    }
    active--;
  };
  assert.equal(typeof PublicRuntimeContainers.prototype.writeOwnership, 'function');
  const first = value.persistOwnership();
  await entered.promise;
  const second = value.persistOwnership();
  value.names.set('latest', {});
  release.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(records, [[], ['latest']]);
});

test('close drains a pending creation once and refuses new resource mutations', async (t) => {
  const value = harness();
  const entered = deferred();
  const release = deferred();
  const removed = [];
  let present = false;
  value.docker = async (args) => {
    if (args[0] === 'run') {
      entered.resolve();
      await release.promise;
      present = true;
      return 'c'.repeat(64);
    }
    if (args[0] === 'inspect')
      return JSON.stringify([
        {
          Id: 'c'.repeat(64),
          Image: value.imageId,
          Name: '/late',
          Config: { Labels: { [PROOF_LABEL]: value.runId } },
        },
      ]);
    if (args[0] === 'rm') {
      removed.push(args.at(-1));
      present = false;
      return '';
    }
    if (args[0] === 'ps') return present ? 'late' : '';
    if (args[0] === 'volume') return '';
    throw new Error(`Unexpected Docker operation: ${args[0]}`);
  };
  t.after(() => release.resolve());
  const creation = value.run('late', [value.imageId]);
  await entered.promise;
  const firstClose = value.close();
  const secondClose = value.close();
  let closed = false;
  firstClose.then(
    () => {
      closed = true;
    },
    () => {
      closed = true;
    },
  );
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closed, false, 'close must wait for the already-started creation');
    await assert.rejects(value.run('too-late', [value.imageId]), /closing/);
    await assert.rejects(value.volume('too-late'), /closing/);
    assert.deepEqual(removed, []);
  } finally {
    release.resolve();
    await Promise.all([creation, firstClose, secondClose]);
  }
  assert.deepEqual(removed, ['c'.repeat(64)]);
  assert.equal(value.names.size, 0);
});

test(
  'fallback cleanup refuses a live producer and reads its final ledger only after native exit',
  { timeout: 10_000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-producer-'));
    const value = harness();
    value.revision = 'b'.repeat(40);
    const ledger = path.join(directory, `${value.runId}.json`);
    const finalName = `agi-public-${value.runId}-app-1`;
    const owner = { id: 'c'.repeat(64), image: `sha256:${'d'.repeat(64)}` };
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        String.raw`
    import { rename, writeFile } from 'node:fs/promises';
    const [ledger, revision, runId, name, owner] = process.argv.slice(1);
    const record = { revision, runId, producerPid: process.pid, containers: [], volumes: [] };
    const persist = async () => {
      await writeFile(ledger + '.pending', JSON.stringify(record));
      await rename(ledger + '.pending', ledger);
    };
    await persist();
    process.stdout.write('ready\n');
    process.stdin.once('data', async () => {
      record.containers.push([name, JSON.parse(owner)]);
      await persist();
      process.stdin.destroy();
    });
    process.stdin.resume();
  `,
        ledger,
        value.revision,
        value.runId,
        finalName,
        JSON.stringify(owner),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
      await rm(directory, { recursive: true, force: true });
    });
    assert.equal(String((await once(child.stdout, 'data'))[0]), 'ready\n');
    const calls = [];
    value.docker = async (args) => {
      calls.push(args);
      throw new Error('Unexpected Docker call');
    };
    await assert.rejects(cleanup.cleanupLedger(value, ledger, { timeoutMs: 0 }), /producer.*alive/);
    assert.deepEqual(calls, []);
    const pending = cleanup.cleanupLedger(value, ledger, { timeoutMs: 5_000 });
    value.close = async () => {
      calls.push(['close', [...value.names]]);
    };
    child.stdin.write('finish');
    await pending;
    assert.deepEqual(await exited, [0, null]);
    assert.deepEqual(calls, [['close', [[finalName, owner]]]]);
    await writeFile(
      ledger,
      JSON.stringify({
        revision: value.revision,
        runId: value.runId,
        producerPid: child.pid,
        containers: [[finalName, owner]],
        volumes: [],
      }),
    );
    value.close = PublicRuntimeContainers.prototype.close;
    const deletionCalls = [];
    value.docker = async (args) => {
      deletionCalls.push(args);
      if (args[0] === 'inspect')
        return JSON.stringify([
          {
            Id: owner.id,
            Image: 'foreign-image',
            Config: { Labels: { [PROOF_LABEL]: value.runId } },
          },
        ]);
      if (args[0] === 'ps') return owner.id;
      if (args[0] === 'volume') return '';
      throw new Error('Unexpected mutation');
    };
    await assert.rejects(cleanup.cleanupLedger(value, ledger, { timeoutMs: 0 }), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /unverified ownership/);
      return true;
    });
    assert.ok(deletionCalls.every((args) => !args.includes('rm')));
  },
);

test('fallback cleanup requires valid producer identity and refuses live or unknown liveness', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-owner-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const value = harness();
  value.revision = 'b'.repeat(40);
  const ledger = path.join(directory, `${value.runId}.json`);
  const calls = [];
  value.docker = async (args) => {
    calls.push(args);
    return '';
  };
  for (const producerPid of [undefined, null, 0, -1, '123', 1.5, process.pid]) {
    await writeFile(
      ledger,
      JSON.stringify({
        revision: value.revision,
        runId: value.runId,
        producerPid,
        containers: [],
        volumes: [],
      }),
    );
    await assert.rejects(cleanup.cleanupLedger(value, ledger, { timeoutMs: 0 }), /producer/);
  }
  await writeFile(
    ledger,
    JSON.stringify({
      revision: value.revision,
      runId: value.runId,
      producerPid: process.pid,
      containers: [],
      volumes: [],
    }),
  );
  const probe = t.mock.method(process, 'kill', (pid, signal) => {
    assert.equal(pid, process.pid);
    assert.equal(signal, 0);
    throw Object.assign(new Error('denied'), { code: 'EPERM' });
  });
  try {
    await assert.rejects(
      cleanup.cleanupLedger(value, ledger, { timeoutMs: 0 }),
      /liveness is unknown/,
    );
  } finally {
    probe.mock.restore();
  }
  assert.deepEqual(calls, []);
});

async function networkHarness(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'agi-proof-network-'));
  const value = harness();
  Object.assign(value, {
    root,
    revision: 'b'.repeat(40),
    image: 'fixture-app',
    postgresImage: 'fixture-postgres',
    imageId: `sha256:${'c'.repeat(64)}`,
    postgresImageId: `sha256:${'d'.repeat(64)}`,
    fixtures: {},
    database: `${DATABASE_PREFIX}${value.runId}`,
    prefix: `agi-public-${value.runId}`,
    lifecycleFile: path.join(root, 'lifecycle.json'),
    index: 0,
    activeCase: null,
    handleBindings: new WeakMap(),
    configurePeer: async () => {},
  });
  t.after(async () => {
    if (value.directory) await rm(value.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });
  const containers = new Map();
  const volumes = new Map();
  const calls = [];
  const engine = { containers, volumes, calls, onExec: null, onInspect: null };
  const find = (id) =>
    [...containers.values()].find((entry) => entry.Id === id || entry.Name === `/${id}`);
  const all = (args, flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));
  const one = (args, flag, fallback) => all(args, flag)[0] ?? fallback;
  const bytes = (text) =>
    text ? Number.parseInt(text, 10) * (text.endsWith('g') ? 1024 ** 3 : 1024 ** 2) : 0;
  let created = 0;
  value.docker = async (args) => {
    calls.push([...args]);
    if (args[0] === 'image') {
      return JSON.stringify([
        {
          Id: args[2] === value.image ? value.imageId : value.postgresImageId,
          Config: {
            Labels: { 'org.agi.public-proof.revision': value.revision },
            Env: ['NODE_ENV=production'],
          },
        },
      ]);
    }
    if (args[0] === 'volume') {
      const name = args.at(-1);
      if (args[1] === 'ls') return [...volumes.keys()].join('\n');
      if (args[1] === 'create') {
        volumes.set(name, {
          Name: name,
          Labels: { [PROOF_LABEL]: value.runId },
          Driver: 'local',
          Options: {},
        });
        return name;
      }
      if (args[1] === 'inspect') {
        if (!volumes.has(name)) throw new Error('No such volume');
        return JSON.stringify([volumes.get(name)]);
      }
      if (args[1] === 'rm') {
        if (
          [...containers.values()].some((entry) =>
            entry.Mounts.some((mount) => mount.Type === 'volume' && mount.Name === name),
          )
        )
          throw new Error('Volume is in use');
        volumes.delete(name);
        return name;
      }
    }
    if (args[0] === 'run') {
      const imageIndex = args.findIndex((arg) =>
        [value.imageId, value.postgresImageId].includes(arg),
      );
      assert.ok(imageIndex > 0);
      const flags = args.slice(0, imageIndex);
      const name = one(flags, '--name');
      assert.ok(!containers.has(name));
      const id = (++created).toString(16).padStart(64, '0');
      const networkMode = one(flags, '--network', 'default');
      const joined = networkMode.startsWith('container:') ? find(networkMode.slice(10)) : null;
      if (networkMode.startsWith('container:')) assert.ok(joined);
      const ports = Object.fromEntries(
        all(flags, '--publish').map((binding) => {
          const [host, port, destination] = binding.split(':');
          return [`${destination}/tcp`, [{ HostIp: host, HostPort: port }]];
        }),
      );
      const entry = {
        Id: id,
        Name: `/${name}`,
        Image: args[imageIndex],
        RestartCount: 0,
        Config: {
          Labels: { [PROOF_LABEL]: value.runId },
          Env: ['NODE_ENV=production', ...all(flags, '--env')],
          User: one(flags, '--user', ''),
          OpenStdin: flags.includes('--interactive'),
          Cmd: args.slice(imageIndex + 1),
          Healthcheck: {
            Test: flags.includes('--no-healthcheck') ? ['NONE'] : ['CMD', 'inherited-healthcheck'],
          },
        },
        HostConfig: {
          NetworkMode: networkMode,
          ReadonlyRootfs: flags.includes('--read-only'),
          Privileged: flags.includes('--privileged'),
          PidMode: '',
          CapDrop: all(flags, '--cap-drop'),
          CapAdd: all(flags, '--cap-add'),
          SecurityOpt: all(flags, '--security-opt'),
          Memory: bytes(one(flags, '--memory')),
          MemorySwap: bytes(one(flags, '--memory-swap')),
          PidsLimit: Number(one(flags, '--pids-limit', '0')),
          PortBindings: ports,
          PublishAllPorts: false,
          RestartPolicy: { Name: one(flags, '--restart', 'no'), MaximumRetryCount: 0 },
        },
        NetworkSettings: {
          SandboxID: joined ? '' : id,
          Ports: joined ? {} : ports,
          Networks:
            networkMode === 'bridge' || networkMode === 'default'
              ? { bridge: { EndpointID: id } }
              : {},
        },
        Mounts: all(flags, '--mount').map((mount) => {
          const fields = Object.fromEntries(mount.split(',').map((part) => part.split('=')));
          return {
            Type: fields.type,
            Source: fields.source,
            ...(fields.type === 'volume' ? { Name: fields.source } : {}),
            Destination: fields.destination,
            RW: !('readonly' in fields),
          };
        }),
        State: {
          Running: true,
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Error: '',
          StartedAt: '2026-10-14T00:00:00.000000001Z',
          ExitCode: 0,
        },
        namespace: joined?.namespace ?? `net:[${1000 + created}]`,
      };
      containers.set(name, entry);
      return id;
    }
    if (args[0] === 'inspect') {
      const entry = find(args[1]);
      if (!entry) throw new Error('No such container');
      engine.onInspect?.(entry);
      return JSON.stringify([entry]);
    }
    if (args[0] === 'wait') return '0';
    if (args[0] === 'logs') {
      const entry = find(args.at(-1));
      assert.ok(entry);
      return entry.Name.endsWith('-build-identity')
        ? 'fixture-build'
        : JSON.stringify({
            fixtureDigest: digest(value.fixtures),
            migrationDigest: 'e'.repeat(64),
          });
    }
    if (args[0] === 'exec') {
      const entry = find(args[1]);
      if (entry) {
        engine.onExec?.(entry, args);
        if (args.at(-1).includes("readlinkSync('/proc/self/ns/net')")) return entry.namespace;
        if (args.slice(2).join(' ') === 'cat /proc/1/comm') return 'postgres';
      }
      return '';
    }
    if (args[0] === 'stop') {
      const entry = find(args.at(-1));
      assert.ok(entry);
      entry.State.Running = false;
      entry.State.ExitCode = 143;
      return entry.Id;
    }
    if (args[0] === 'cp') {
      const entry = find(args[1].split(':')[0]);
      const input = entry.Mounts.find((mount) => mount.Destination === '/proof-input');
      const state = JSON.parse(await readFile(path.join(input.Source, 'state.json'), 'utf8'));
      assert.ok(args[1].endsWith(':/proof-output/shutdown.jsonl'));
      await writeFile(
        args[2],
        [
          { sequence: 0, kind: 'observer-start', runId: value.runId, stateId: state.stateId },
          { sequence: 1, kind: 'shutdown-signal', signal: 'SIGTERM' },
          { sequence: 2, kind: 'observer-exit', code: 143, signal: 'SIGTERM' },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n'),
      );
      return '';
    }
    if (args[0] === 'rm') {
      const entry = find(args.at(-1));
      assert.ok(entry);
      containers.delete(entry.Name.slice(1));
      return entry.Id;
    }
    if (args[0] === 'ps') {
      const filter = one(args, '--filter', '');
      return [...containers.values()]
        .filter((entry) => !filter.startsWith('id=') || entry.Id === filter.slice(3))
        .map((entry) => (filter.startsWith('id=') ? entry.Id : entry.Name.slice(1)))
        .join('\n');
    }
    throw new Error(`Unexpected Docker fixture operation: ${args[0]}`);
  };
  return { value, engine };
}

function relayNetworkHolder(engine) {
  const holders = [...engine.containers.values()].filter(
    (entry) => entry.HostConfig.NetworkMode === 'bridge',
  );
  assert.equal(holders.length, 1, 'Expected one persistent relay network holder');
  return holders[0];
}

test('persistent relay network is created before PostgreSQL and reused across fresh isolated cases', async (t) => {
  const { value, engine } = await networkHarness(t);
  await value.initialize();
  const holder = relayNetworkHolder(engine);
  const launches = engine.calls.filter((args) => args[0] === 'run');
  assert.equal(launches[0][launches[0].indexOf('--name') + 1], holder.Name.slice(1));
  assert.equal(holder.Config.User, '1000:1000');
  assert.equal(holder.Config.OpenStdin, true);
  assert.deepEqual(holder.Config.Cmd, ['node', '-e', 'process.stdin.resume()']);
  assert.deepEqual(holder.Mounts, []);
  assert.deepEqual(holder.Config.Env, ['NODE_ENV=production']);
  assert.deepEqual(holder.Config.Healthcheck.Test, ['NONE']);
  assert.equal(holder.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(holder.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(holder.HostConfig.CapAdd, []);
  assert.deepEqual(holder.HostConfig.SecurityOpt, ['no-new-privileges']);
  assert.equal(holder.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(holder.HostConfig.PidsLimit, 32);
  assert.deepEqual(holder.HostConfig.PortBindings, {
    '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: new URL(PROOF_ORIGIN).port }],
  });
  const handles = [];
  for (let index = 0; index < 2; index++) {
    const handle = await value.startCase(
      { path: '/fixture', stateId: `state-${index}` },
      { visual: true },
    );
    handles.push(handle);
    const relay = engine.containers.get(handle.relayName);
    assert.equal(relay.HostConfig.NetworkMode, `container:${holder.Id}`);
    assert.deepEqual(relay.HostConfig.PortBindings, {});
    assert.equal(relay.NetworkSettings.SandboxID, '');
    assert.deepEqual(relay.Mounts, [
      {
        Type: 'volume',
        Name: handle.httpVolume,
        Source: handle.httpVolume,
        Destination: '/run/agi-proof-http',
        RW: false,
      },
      {
        Type: 'bind',
        Source: path.join(value.root, 'scripts'),
        Destination: '/harness/scripts',
        RW: false,
      },
    ]);
    assert.equal(engine.containers.get(handle.appName).HostConfig.NetworkMode, 'none');
    assert.equal(engine.containers.get(value.pgName).HostConfig.NetworkMode, 'none');
    assert.equal(handle.transport.namespace, holder.namespace);
    await value.finishVisual(handle);
    assert.ok(engine.containers.has(holder.Name.slice(1)));
    assert.ok(!engine.containers.has(handle.relayName));
    assert.ok(!engine.volumes.has(handle.httpVolume));
  }
  assert.notEqual(handles[0].httpVolume, handles[1].httpVolume);
  assert.notEqual(handles[0].outputVolume, handles[1].outputVolume);
  assert.notEqual(handles[0].relayName, handles[1].relayName);
  for (const args of engine.calls.filter((args) => args[0] === 'run')) {
    const name = args[args.indexOf('--name') + 1];
    if (name !== holder.Name.slice(1) && !handles.some((handle) => name === handle.relayName))
      assert.equal(args[args.indexOf('--network') + 1], 'none');
  }
  assert.equal(
    engine.calls.filter((args) => args[0] === 'run' && args.includes('--publish')).length,
    1,
  );
  await value.close();
  assert.equal(engine.containers.size, 0);
  assert.equal(engine.volumes.size, 0);
  assert.equal(value.names.size, 0);
  assert.equal(value.volumes.size, 0);
  await assert.rejects(readFile(value.lifecycleFile), { code: 'ENOENT' });
});

test('persistent relay network refuses changed holder identity, security, publication and namespace', async (t) => {
  const changes = [
    (entry) => {
      entry.Id = 'f'.repeat(64);
    },
    (entry) => {
      entry.Image = 'foreign-image';
    },
    (entry) => {
      entry.Config.Labels[PROOF_LABEL] = 'foreign';
    },
    (entry) => {
      entry.Config.User = '0';
    },
    (entry) => {
      entry.Config.Cmd = ['node', '-e', 'process.stdin.resume(); console.log(1)'];
    },
    (entry) => {
      entry.Config.OpenStdin = false;
    },
    (entry) => {
      entry.Config.Healthcheck.Test = ['CMD', 'health'];
    },
    (entry) => {
      entry.Config.Env.push('UNOWNED_FIXTURE=value');
    },
    (entry) => {
      entry.HostConfig.ReadonlyRootfs = false;
    },
    (entry) => {
      entry.HostConfig.Privileged = true;
    },
    (entry) => {
      entry.HostConfig.PidMode = 'host';
    },
    (entry) => {
      entry.HostConfig.Devices = [{ PathOnHost: '/dev/fixture' }];
    },
    (entry) => {
      entry.HostConfig.CapAdd = ['NET_ADMIN'];
    },
    (entry) => {
      entry.HostConfig.SecurityOpt = [];
    },
    (entry) => {
      entry.HostConfig.Memory = 0;
    },
    (entry) => {
      entry.HostConfig.MemorySwap = -1;
    },
    (entry) => {
      entry.HostConfig.PidsLimit = -1;
    },
    (entry) => {
      entry.HostConfig.RestartPolicy.Name = 'always';
    },
    (entry) => {
      entry.HostConfig.PublishAllPorts = true;
    },
    (entry) => {
      entry.HostConfig.NetworkMode = 'host';
    },
    (entry) => {
      entry.HostConfig.PortBindings['3000/tcp'][0].HostIp = '0.0.0.0';
    },
    (entry) => {
      entry.NetworkSettings.SandboxID = 'f'.repeat(64);
    },
    (entry) => {
      delete entry.NetworkSettings.SandboxID;
    },
    (entry) => {
      entry.NetworkSettings.Networks.bridge.EndpointID = 'f'.repeat(64);
    },
    (entry) => {
      entry.NetworkSettings.Networks.extra = {};
    },
    (entry) => {
      entry.State.Running = false;
    },
    (entry) => {
      delete entry.State.Running;
    },
    (entry) => {
      entry.State.Paused = true;
    },
    (entry) => {
      entry.State.OOMKilled = true;
    },
    (entry) => {
      entry.State.Error = 'fixture-engine-error';
    },
    (entry) => {
      entry.State.Restarting = true;
    },
    (entry) => {
      entry.State.StartedAt = '2026-10-14T01:00:00Z';
    },
    (entry) => {
      entry.RestartCount = 1;
    },
    (entry) => {
      entry.Mounts.push({ Type: 'bind', Source: '/fixture', Destination: '/unowned', RW: false });
    },
    (entry) => {
      entry.namespace = 'net:[replacement]';
    },
    (entry) => {
      entry.namespace = 'net:[98765]';
    },
  ];
  for (const change of changes) {
    const { value, engine } = await networkHarness(t);
    await value.initialize();
    change(relayNetworkHolder(engine));
    await assert.rejects(
      value.startCase({ path: '/fixture' }),
      /relay network|relay container|No such container/,
    );
    assert.ok(![...engine.containers.keys()].some((name) => /-relay-\d+$/.test(name)));
  }
});

test('persistent relay network detects holder churn after joining and stopped relays despite successful TCP', async (t) => {
  for (const mode of [
    'holder-restarted',
    'holder-namespace',
    'holder-after-probe-check',
    'relay-stopped',
    'relay-restarted',
    'relay-command',
    'relay-restart-policy',
    'relay-publish',
    'relay-mode',
    'relay-namespace',
    'relay-mount',
  ]) {
    const { value, engine } = await networkHarness(t);
    await value.initialize();
    const holder = relayNetworkHolder(engine);
    let probed = false;
    engine.onExec = (entry, args) => {
      if (!/-relay-\d+$/.test(entry.Name)) return;
      if (mode === 'holder-after-probe-check' && probed && args.at(-1).includes('readlinkSync')) {
        holder.namespace = 'net:[98765]';
        return;
      }
      if (!args.at(-1).includes('.connect(3000,')) return;
      probed = true;
      if (mode === 'holder-restarted') holder.State.StartedAt = '2026-10-14T01:00:00Z';
      if (mode === 'holder-namespace') holder.namespace = 'net:[98765]';
      if (mode === 'relay-stopped') entry.State.Running = false;
      if (mode === 'relay-restarted') entry.State.StartedAt = '2026-10-14T01:00:00Z';
      if (mode === 'relay-command') entry.Config.Cmd = ['node', '-e', 'process.stdin.resume()'];
      if (mode === 'relay-restart-policy') entry.HostConfig.RestartPolicy.Name = 'always';
      if (mode === 'relay-publish')
        entry.HostConfig.PortBindings = { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }] };
      if (mode === 'relay-mode') entry.HostConfig.NetworkMode = 'bridge';
      if (mode === 'relay-namespace') entry.namespace = 'net:[98765]';
      if (mode === 'relay-mount') entry.Mounts[0].Name = 'previous-case-socket';
    };
    await assert.rejects(value.startCase({ path: '/fixture' }), /relay network|relay container/);
  }
});

test('persistent relay network is required even when the owned application is ready', async (t) => {
  const { value, engine } = await networkHarness(t);
  await value.initialize();
  const holder = relayNetworkHolder(engine);
  engine.containers.delete(holder.Name.slice(1));
  await assert.rejects(value.startCase({ path: '/fixture' }), /No such container/);
  assert.ok(![...engine.containers.keys()].some((name) => /-relay-\d+$/.test(name)));
});

test('persistent relay network cleanup recovers exact owners and refuses foreign holders or relays', async (t) => {
  for (const replaced of ['none', 'relay-image', 'holder-image', 'holder-label']) {
    const { value, engine } = await networkHarness(t);
    await value.initialize();
    const handle = await value.startCase({ path: '/fixture', stateId: 'interrupted' });
    const holder = relayNetworkHolder(engine);
    const relay = engine.containers.get(handle.relayName);
    const recovered = harness();
    recovered.revision = value.revision;
    recovered.prefix = 'different-recovery-instance';
    recovered.docker = value.docker;
    restoreOwnership(recovered, JSON.parse(await readFile(value.lifecycleFile, 'utf8')));
    if (replaced === 'relay-image') relay.Image = 'foreign-image';
    if (replaced === 'holder-image') holder.Image = 'foreign-image';
    if (replaced === 'holder-label') holder.Config.Labels[PROOF_LABEL] = 'foreign-run';
    if (replaced !== 'none') {
      await assert.rejects(recovered.close(), /teardown is incomplete/);
      assert.ok(engine.containers.has(holder.Name.slice(1)));
      const removed = engine.calls.filter((args) => args[0] === 'rm').map((args) => args.at(-1));
      assert.ok(!removed.includes(holder.Id));
      if (replaced === 'relay-image') {
        assert.ok(engine.containers.has(handle.relayName));
        assert.ok(engine.volumes.has(handle.httpVolume));
        assert.ok(!removed.includes(relay.Id));
      } else {
        assert.ok(!engine.containers.has(handle.relayName));
        assert.ok(removed.includes(relay.Id));
      }
      relay.Image = value.imageId;
      holder.Image = value.imageId;
      holder.Config.Labels[PROOF_LABEL] = value.runId;
    }
    await recovered.close();
    const removed = engine.calls.filter((args) => args[0] === 'rm').map((args) => args.at(-1));
    assert.ok(removed.indexOf(relay.Id) < removed.indexOf(holder.Id));
    assert.equal(engine.containers.size, 0);
    assert.equal(engine.volumes.size, 0);
  }
});

test('persistent relay network rejects a remaining old relay and rechecks identity before evidence', async (t) => {
  for (const method of ['startCase', 'finishCase', 'finishVisual']) {
    const { value, engine } = await networkHarness(t);
    await value.initialize();
    const handle = await value.startCase(
      { path: '/fixture', stateId: 'first' },
      { visual: method === 'finishVisual' },
    );
    const holder = relayNetworkHolder(engine);
    if (method === 'startCase') {
      value.activeCase = null;
      await assert.rejects(value.startCase({ path: '/next' }), /previous.*relay|relay.*remaining/);
    } else {
      holder.RestartCount = 1;
      await assert.rejects(value[method](handle, {}, {}), /relay network/);
      assert.equal(engine.calls.filter((args) => args[0] === 'stop').length, 0);
    }
    const relayId = engine.containers.get(handle.relayName).Id;
    holder.RestartCount = 0;
    await value.close();
    const removed = engine.calls.filter((args) => args[0] === 'rm').map((args) => args.at(-1));
    assert.ok(removed.indexOf(relayId) < removed.indexOf(holder.Id));
    assert.equal(engine.containers.size, 0);
    assert.equal(engine.volumes.size, 0);
  }
});

async function startupHarness(t, state) {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-proof-startup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const value = harness();
  Object.assign(value, {
    directory,
    root: directory,
    database: `${DATABASE_PREFIX}${value.runId}`,
    prefix: 'owned',
    socketVolume: 'owned-socket',
    index: 18,
    activeCase: null,
    databaseCommand: async () => '{}',
    configurePeer: async () => {},
    volume: async (name) => name,
    removeContainer: async () => {},
  });
  const current = {
    Id: 'app-id',
    Image: value.imageId,
    Config: {
      Labels: { [PROOF_LABEL]: value.runId },
      User: '1000:1000',
      Healthcheck: { Test: ['NONE'] },
    },
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
    },
    Mounts: [],
    State: state,
  };
  value.run = async (name, args) => {
    if (name === 'owned-permissions-18') return name;
    assert.equal(name, 'owned-app-18');
    current.Mounts = args.flatMap((argument, index) => {
      if (argument !== '--mount') return [];
      const fields = Object.fromEntries(args[index + 1].split(',').map((part) => part.split('=')));
      return [
        {
          Type: fields.type,
          Source: fields.source,
          Destination: fields.destination,
          RW: !('readonly' in fields),
        },
      ];
    });
    value.names.set(name, { id: current.Id, image: current.Image });
    return name;
  };
  value.inspect = async (id, options) => {
    assert.ok(['owned-app-18', 'app-id'].includes(id));
    if (id === 'app-id') assert.deepEqual(options, { timeout: 10_000, maxBuffer: 128 * 1024 });
    return current;
  };
  const calls = [];
  value.docker = async (args, options) => {
    calls.push({ args, options });
    if (args[0] === 'wait') return '0';
    if (args[0] === 'logs') {
      assert.deepEqual(args, ['logs', '--tail', '80', 'app-id']);
      assert.deepEqual(options, { includeStderr: true, timeout: 10_000, maxBuffer: 128 * 1024 });
      return 'startup stdout\nstartup stderr';
    }
    if (args[0] === 'exec') throw new Error('application listener unavailable');
    throw new Error(`Unexpected Docker operation ${args[0]}`);
  };
  const route = {
    path: '/connectors/mcp-directory/fixture',
    pattern: '/connectors/mcp-directory/[...id]',
    state: 'successful-content',
    stateId: 'fixture-state',
  };
  return { value, calls, current, route };
}

test('a stopped case retains its identity and bounded owned application startup evidence', async (t) => {
  const state = {
    ExitCode: 137,
    Running: false,
    OOMKilled: true,
    Error: 'engine failure',
    StartedAt: '2026-10-13T20:26:00Z',
    FinishedAt: '2026-10-13T20:26:01Z',
  };
  const { value, calls, route } = await startupHarness(t, state);
  await assert.rejects(value.startCase(route), (error) => {
    assert.match(error.message, /^Public runtime stopped; case /);
    assert.ok(
      error.message.includes(
        JSON.stringify({
          index: 18,
          pattern: route.pattern,
          path: route.path,
          state: route.state,
          stateId: route.stateId,
        }),
      ),
    );
    assert.ok(error.message.includes(`Docker State: ${JSON.stringify(state)}`));
    assert.ok(error.message.endsWith('startup stdout\nstartup stderr'));
    return true;
  });
  assert.deepEqual(
    calls.map(({ args }) => args[0]),
    ['wait', 'logs'],
  );
});

test('case readiness timeout keeps all 90 attempts and reports the owned running state', async (t) => {
  const { value, calls, route } = await startupHarness(t, { Running: true });
  const nativeSetTimeout = globalThis.setTimeout;
  let waits = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, milliseconds, ...args) => {
    assert.equal(milliseconds, 500);
    waits++;
    return nativeSetTimeout(callback, 0, ...args);
  });
  await assert.rejects(value.startCase(route), (error) => {
    assert.match(error.message, /^Cold public server readiness timed out; case /);
    const summary = JSON.parse(error.message.split('Docker State: ')[1].split('\n')[0]);
    assert.deepEqual(summary, {
      ExitCode: 'unknown',
      Running: true,
      OOMKilled: 'unknown',
      Error: 'unknown',
      StartedAt: 'unknown',
      FinishedAt: 'unknown',
    });
    assert.ok(error.message.endsWith('startup stdout\nstartup stderr'));
    return true;
  });
  assert.equal(waits, 90);
  assert.equal(calls.filter(({ args }) => args[0] === 'exec').length, 90);
  assert.equal(calls.filter(({ args }) => args[0] === 'logs').length, 1);
});

test('a case refuses startup diagnostics if its recorded application owner changes', async (t) => {
  for (const change of [
    { Id: 'replacement' },
    { Image: 'replacement-image' },
    { Config: { Labels: {} } },
  ]) {
    const { value, calls, current, route } = await startupHarness(t, { Running: false });
    const inspect = value.inspect;
    value.inspect = async (id, options) => {
      await inspect(id, options);
      return id === 'app-id' ? { ...current, ...change } : current;
    };
    await assert.rejects(value.startCase(route), /ownership changed before startup diagnostics/);
    assert.deepEqual(
      calls.map(({ args }) => args[0]),
      ['wait'],
    );
  }
});

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

async function observerRouteExecution() {
  const source = await readFile(new URL('./observer.mjs', import.meta.url), 'utf8');
  const start = 'const executed = (script) =>';
  const end = "record('snapshot-render-start'";
  assert.equal(source.split(start).length, 2);
  assert.equal(source.split(end).length, 2);
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('observer route execution matches native literal, encoded and absolute file identities', async () => {
  const block = await observerRouteExecution();
  for (const routeFile of [
    '/app/apps/web/.next/server/app/docs/page.js',
    '/app/apps/web/.next/server/app/connect/[deviceType]/page.js',
    '/app/apps/web/.next/server/app/connectors/mcp-directory/[...id]/page.js',
    '/app/apps/web/.next/server/app/docs/[[...slug]]/page.js',
  ]) {
    for (const url of [routeFile, `file://${routeFile}`, pathToFileURL(routeFile).href]) {
      const report = {};
      runInNewContext(
        block,
        {
          report,
          routeFile,
          fileURLToPath,
          pathToFileURL,
          scripts: [{ url, functions: [{ ranges: [{ count: 1 }] }] }],
        },
        { timeout: 1000 },
      );
      assert.equal(report.routeBundleExecuted, true, url);
    }
  }
});

test('observer route execution rejects zero coverage, different files and malformed file URLs', async () => {
  const block = await observerRouteExecution();
  const routeFile = '/app/apps/web/.next/server/app/connectors/mcp-directory/[...id]/page.js';
  const positive = [{ ranges: [{ count: 1 }] }];
  for (const scripts of [
    [],
    [{ url: `file://${routeFile}`, functions: [{ ranges: [{ count: 0 }] }] }],
    [{ url: `file://${routeFile}`, functions: [] }],
    [{ url: `file://${routeFile}.other`, functions: positive }],
    [{ url: `file:///unrelated${routeFile}`, functions: positive }],
    [{ url: `https://example.invalid${routeFile}`, functions: positive }],
    [{ url: 'app/connectors/mcp-directory/[...id]/page.js', functions: positive }],
    [{ url: `file://foreign.invalid${routeFile}`, functions: positive }],
    [{ url: 'file:///app/apps/web/.next/server/app/%ZZ/page.js', functions: positive }],
    [{ url: 'file:///app/apps/web/.next/server/app/%2F/page.js', functions: positive }],
    [
      { url: 'file:///app/apps/web/.next/server/app/other/page.js', functions: positive },
      { url: pathToFileURL(routeFile).href, functions: [{ ranges: [{ count: 0 }] }] },
    ],
  ]) {
    const report = {};
    runInNewContext(
      block,
      { report, routeFile, fileURLToPath, pathToFileURL, scripts },
      { timeout: 1000 },
    );
    assert.equal(report.routeBundleExecuted, false, JSON.stringify(scripts));
  }
});

async function observerRouteResolution() {
  const source = await readFile(new URL('./observer.mjs', import.meta.url), 'utf8');
  const start = 'const routeManifest = JSON.parse(';
  const end = 'const prerender = JSON.parse(';
  assert.equal(source.split(start).length, 2);
  assert.equal(source.split(end).length, 2);
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('observer manifest resolution hashes normal, dynamic and catch-all production bundles', async () => {
  const block = await observerRouteResolution();
  const bytes = Buffer.from('compiled route fixture\n');
  for (const [pattern, entry] of [
    ['/', 'app/page.js'],
    ['/docs', 'app/docs/page.js'],
    ['/connect/[deviceType]', 'app/connect/[deviceType]/page.js'],
    ['/connectors/mcp-directory/[...id]', 'app/connectors/mcp-directory/[...id]/page.js'],
    ['/docs/[[...slug]]', 'app/docs/[[...slug]]/page.js'],
    ['/module..name', 'app/module..name/page.js'],
  ]) {
    const calls = [];
    const report = {};
    runInNewContext(
      block,
      {
        state: { pattern },
        report,
        createHash,
        path,
        readFileSync(filename, encoding) {
          calls.push(filename);
          if (filename === '/app/apps/web/.next/server/app-paths-manifest.json') {
            assert.equal(encoding, 'utf8');
            return JSON.stringify({ [`${pattern === '/' ? '' : pattern}/page`]: entry });
          }
          assert.equal(filename, `/app/apps/web/.next/server/${entry}`);
          assert.equal(encoding, undefined);
          return bytes;
        },
      },
      { timeout: 1000 },
    );
    assert.deepEqual(calls, [
      '/app/apps/web/.next/server/app-paths-manifest.json',
      `/app/apps/web/.next/server/${entry}`,
    ]);
    assert.equal(report.routeBundleHash, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('observer manifest resolution refuses escaping or invalid entries before any bundle read', async () => {
  const block = await observerRouteResolution();
  for (const entry of [
    undefined,
    null,
    42,
    {},
    [],
    '',
    '.',
    '..',
    '../outside.js',
    'app/../page.js',
    'app/nested/../../page.js',
    '/outside/page.js',
    '//outside/page.js',
    'C:/outside/page.js',
    'C:\\outside\\page.js',
    'app\\..\\page.js',
    'app/\0page.js',
    'a'.repeat(4097),
  ]) {
    const calls = [];
    const report = {};
    assert.throws(
      () =>
        runInNewContext(
          block,
          {
            state: { pattern: '/fixture' },
            report,
            createHash,
            path,
            readFileSync(filename) {
              calls.push(filename);
              assert.equal(filename, '/app/apps/web/.next/server/app-paths-manifest.json');
              return JSON.stringify({ '/fixture/page': entry });
            },
          },
          { timeout: 1000 },
        ),
      /Production route bundle is not in the build manifest/,
    );
    assert.deepEqual(calls, ['/app/apps/web/.next/server/app-paths-manifest.json']);
    assert.equal(report.routeBundleHash, undefined);
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
  assert.match(error.message, /^Database stopped \(exit 1\):\nDocker State: /);
  assert.ok(error.message.endsWith('\nStartup logs unavailable'));
});

test('startup state summaries whitelist bounded fields and leave absent values unknown', async () => {
  const value = harness();
  value.names.set('app', { id: 'original', image: value.imageId });
  const current = {
    Id: 'original',
    Image: value.imageId,
    Config: { Labels: { [PROOF_LABEL]: value.runId }, Env: ['PRIVATE_VALUE=not-for-output'] },
  };
  value.inspect = async () => current;
  value.docker = async () => '🧪'.repeat(20 * 1024) + '\nlog-tail';
  const missing = await value.readinessError('app', 'Stopped');
  const summary = JSON.parse(missing.message.split('Docker State: ')[1].split('\n')[0]);
  assert.deepEqual(Object.values(summary), Array(6).fill('unknown'));
  current.State = {
    ExitCode: '0',
    Running: 'false',
    OOMKilled: null,
    Error: 'x'.repeat(4000) + '\nengine tail',
    StartedAt: 's'.repeat(4000),
    FinishedAt: 'f'.repeat(4000),
    Health: { Log: ['not-for-output'] },
  };
  const bounded = await value.readinessError('app', 'Stopped');
  const retained = JSON.parse(bounded.message.split('Docker State: ')[1].split('\n')[0]);
  assert.deepEqual(Object.keys(retained), Object.keys(summary));
  assert.equal(retained.ExitCode, 'unknown');
  assert.equal(retained.Running, 'unknown');
  assert.equal(retained.OOMKilled, 'unknown');
  assert.equal(retained.Error.length, 1024);
  assert.equal(retained.StartedAt.length, 64);
  assert.equal(retained.FinishedAt.length, 64);
  assert.ok(bounded.message.endsWith('\nlog-tail'));
  assert.ok(Buffer.byteLength(bounded.message.split('\n').slice(1).join('\n')) <= 32 * 1024);
  assert.ok(!bounded.message.includes('\uFFFD'));
  assert.ok(!bounded.message.includes('not-for-output'));
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

test('controlled stops require a live owned container and send an explicit termination signal', async () => {
  for (const state of [
    { Running: true, OOMKilled: false, Error: '' },
    { Running: false, OOMKilled: false, Error: '' },
    { Running: true, OOMKilled: true, Error: '' },
    { Running: true, OOMKilled: false, Error: 'runtime error' },
    { Running: true },
  ]) {
    const value = harness();
    value.names.set('owned', { id: 'original', image: value.imageId });
    const current = {
      Id: 'original',
      Image: value.imageId,
      Config: { Labels: { [PROOF_LABEL]: value.runId } },
      State: state,
    };
    const stopped = {
      ...current,
      State: { Running: false, OOMKilled: false, Error: '', ExitCode: 143 },
    };
    const calls = [];
    value.inspect = async () => (calls.length === 0 ? current : stopped);
    value.docker = async (args) => calls.push(args);
    if (state.Running && state.OOMKilled === false && state.Error === '') {
      assert.equal(await value.stopContainer('owned'), stopped);
      assert.deepEqual(calls, [['stop', '--signal', 'SIGTERM', '--time', '15', 'original']]);
    } else {
      await assert.rejects(value.stopContainer('owned'), /before controlled shutdown/);
      assert.deepEqual(calls, []);
    }
  }
});

test('visual teardown rejects crashes and foreign lifecycle evidence before resource removal', async (t) => {
  for (const mode of [
    'complete',
    'oom',
    'running',
    'error',
    'missing-state',
    'wrong-exit',
    'missing-exit',
    'foreign-state',
    'execution-case',
  ]) {
    const { value, engine } = await networkHarness(t);
    await value.initialize();
    const handle = await value.startCase(
      { path: '/visual', stateId: 'visual-state' },
      { visual: mode !== 'execution-case' },
    );
    const state = handle.state;
    const stopped = structuredClone(engine.containers.get(handle.appName));
    stopped.State = { Running: false, OOMKilled: false, Error: '', ExitCode: 143 };
    const events = [
      { sequence: 0, kind: 'observer-start', runId: value.runId, stateId: state.stateId },
      { sequence: 1, kind: 'shutdown-signal', signal: 'SIGTERM' },
      { sequence: 2, kind: 'observer-exit', code: 143, signal: 'SIGTERM' },
    ];
    if (mode === 'oom') stopped.State.OOMKilled = true;
    if (mode === 'running') stopped.State.Running = true;
    if (mode === 'error') stopped.State.Error = 'runtime error';
    if (mode === 'missing-state') delete stopped.State.OOMKilled;
    if (mode === 'wrong-exit') stopped.State.ExitCode = 137;
    if (mode === 'missing-exit') events.pop();
    if (mode === 'foreign-state') events[0].stateId = 'foreign';
    const removed = [];
    value.stopContainer = async () => stopped;
    const docker = value.docker;
    value.docker = async (args) => {
      if (args[0] !== 'cp') return docker(args);
      assert.equal(args[1], `${handle.appName}:/proof-output/shutdown.jsonl`);
      await writeFile(args[2], events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    };
    value.configurePeer = async () => removed.push('peer');
    value.removeContainer = async (name) =>
      removed.push(name === handle.relayName ? 'relay' : 'app');
    value.databaseCommand = async () => removed.push('database');
    value.removeCaseVolumes = async () => removed.push('volumes');
    if (mode === 'complete') {
      await value.finishVisual(handle);
      assert.deepEqual(removed, ['peer', 'relay', 'app', 'database', 'volumes']);
      assert.equal(value.activeCase, null);
    } else {
      await assert.rejects(value.finishVisual(handle), /teardown|observation|snapshot/);
      assert.deepEqual(removed, []);
      assert.equal(value.activeCase, 0);
    }
  }
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
    producerPid: process.pid,
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

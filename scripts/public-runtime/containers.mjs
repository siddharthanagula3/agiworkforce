import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  APP_OS_USER,
  APP_UID,
  authorityQueries,
  caseDatabaseRole,
  peerConfiguration,
} from './database-authority.mjs';
import {
  assertIsolatedContainer,
  DATABASE_PREFIX,
  DATABASE_SOCKET,
  digest,
  documentInputs,
  parseDatabaseStatements,
  PROOF_LABEL,
  PROOF_ORIGIN,
  PROOF_VERSION,
  validateRuntimeProof,
  validateRawReceipt,
} from './proof.mjs';

const execute = promisify(execFile);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const APP_ROOT = '/app/apps/web';
const REVISION_LABEL = 'org.agi.public-proof.revision';

export class PublicRuntimeContainers {
  /**
   * @param {{
   *   root: string,
   *   revision: string,
   *   image?: string,
   *   postgresImage?: string,
   *   fixtures: Record<string, unknown>,
   *   snapshot?: { filename: string, digest: string, roles: unknown[], sourceRunId: string, fixtureDigest: string, migrationDigest: string } | null,
   *   snapshotFile?: string | null,
   *   evidenceDirectory?: string | null
   * }} options
   */
  constructor({
    root,
    image,
    postgresImage,
    fixtures,
    revision,
    snapshot = null,
    snapshotFile = null,
    evidenceDirectory = null,
  }) {
    if (process.env.CI !== 'true')
      throw new Error('The public runtime harness requires disposable CI containers');
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('An exact source revision is required');
    this.root = root;
    this.image = image;
    this.postgresImage = postgresImage;
    this.fixtures = fixtures;
    this.revision = revision;
    this.snapshot = snapshot;
    this.snapshotFile = snapshotFile;
    this.evidenceDirectory = evidenceDirectory;
    this.runId = randomBytes(12).toString('hex');
    this.database = `${DATABASE_PREFIX}${this.runId}`;
    this.prefix = `agi-public-${this.runId}`;
    this.lifecycleFile = path.join(
      root,
      'apps/web/.cache/public-runtime-lifecycle',
      `${this.runId}.json`,
    );
    this.names = new Map();
    this.volumes = new Set();
    this.proofs = [];
    this.proofBindings = new WeakMap();
    this.handleBindings = new WeakMap();
    this.index = 0;
    this.activeCase = null;
  }

  async docker(args, options = {}) {
    const result = await execute('docker', args, {
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      ...options,
    });
    return result.stdout.trim();
  }

  async inspect(name) {
    return JSON.parse(await this.docker(['inspect', name]))[0];
  }

  async persistOwnership() {
    if (!this.lifecycleFile) return;
    await mkdir(path.dirname(this.lifecycleFile), { recursive: true });
    const temporary = `${this.lifecycleFile}.pending`;
    await writeFile(
      temporary,
      JSON.stringify({
        revision: this.revision,
        runId: this.runId,
        containers: [...this.names],
        volumes: [...this.volumes],
      }),
    );
    await rename(temporary, this.lifecycleFile);
  }

  async volume(name) {
    const before = await this.docker(['volume', 'ls', '--format', '{{.Name}}']);
    if (before.split('\n').includes(name))
      throw new Error('Refusing to reuse an existing proof volume');
    await this.persistOwnership();
    await this.docker(['volume', 'create', '--label', `${PROOF_LABEL}=${this.runId}`, name]);
    const created = JSON.parse(await this.docker(['volume', 'inspect', name]))[0];
    if (
      created.Name !== name ||
      created.Labels?.[PROOF_LABEL] !== this.runId ||
      created.Driver !== 'local' ||
      Object.keys(created.Options ?? {}).length
    )
      throw new Error('Proof volume ownership is unverified');
    this.volumes.add(name);
    await this.persistOwnership();
    return name;
  }

  async run(name, args) {
    const image = args.includes(this.imageId) ? this.imageId : this.postgresImageId;
    await this.persistOwnership();
    try {
      await this.docker([
        'run',
        '--detach',
        '--name',
        name,
        '--label',
        `${PROOF_LABEL}=${this.runId}`,
        ...(image === this.imageId ? ['--no-healthcheck'] : []),
        ...args,
      ]);
    } catch (error) {
      const candidate = await this.inspect(name).catch(() => null);
      if (candidate?.Config?.Labels?.[PROOF_LABEL] === this.runId && candidate.Image === image)
        this.names.set(name, { id: candidate.Id, image });
      await this.persistOwnership();
      throw error;
    }
    const created = await this.inspect(name);
    if (
      created.Config?.Labels?.[PROOF_LABEL] !== this.runId ||
      created.Image !== image ||
      created.Name !== `/${name}`
    )
      throw new Error('Created container ownership is unverified');
    this.names.set(name, { id: created.Id, image });
    await this.persistOwnership();
    return name;
  }

  async initialize() {
    this.directory = await mkdtemp(path.join(tmpdir(), 'agi-public-runtime-'));
    this.input = path.join(this.directory, 'input');
    await mkdir(this.input);
    await writeFile(
      path.join(this.input, 'fixture.json'),
      JSON.stringify({ runId: this.runId, fixtures: this.fixtures, snapshot: this.snapshot }),
    );
    const image = await this.inspectImage(this.image);
    if (image.Config?.Labels?.[REVISION_LABEL] !== this.revision)
      throw new Error('Image does not bind the expected source revision');
    this.imageId = image.Id;
    this.postgresImageId = (await this.inspectImage(this.postgresImage)).Id;
    await this.persistOwnership();
    this.socketVolume = await this.volume(`${this.prefix}-db-socket`);
    const socketPermissions = `${this.prefix}-socket-permissions`;
    try {
      await this.run(socketPermissions, [
        '--network',
        'none',
        '--user',
        '0',
        '--mount',
        `type=volume,source=${this.socketVolume},destination=${DATABASE_SOCKET}`,
        this.imageId,
        'node',
        '-e',
        `require('node:fs').chmodSync('${DATABASE_SOCKET}',0o1777)`,
      ]);
      if ((await this.docker(['wait', socketPermissions])) !== '0')
        throw new Error('Database socket permissions could not be prepared');
    } finally {
      await this.removeContainer(socketPermissions);
    }
    this.pgName = await this.run(`${this.prefix}-db`, [
      '--memory',
      '2g',
      '--memory-swap',
      '4g',
      '--pids-limit',
      '128',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--cap-add',
      'CHOWN',
      '--cap-add',
      'SETUID',
      '--cap-add',
      'SETGID',
      '--cap-add',
      'DAC_OVERRIDE',
      '--mount',
      `type=volume,source=${this.socketVolume},destination=${DATABASE_SOCKET}`,
      '--tmpfs',
      '/var/lib/postgresql/data:size=2g',
      '--tmpfs',
      '/proof-logs:mode=1777,size=256m',
      '--env',
      'POSTGRES_PASSWORD=public-runtime-bootstrap-fixture',
      '--env',
      'POSTGRES_INITDB_ARGS=--auth-local=peer --auth-host=reject',
      '--env',
      `POSTGRES_DB=${this.database}`,
      this.postgresImageId,
      'postgres',
      '-c',
      'listen_addresses=',
      '-c',
      `unix_socket_directories=${DATABASE_SOCKET}`,
      '-c',
      'logging_collector=on',
      '-c',
      'log_destination=jsonlog',
      '-c',
      'log_directory=/proof-logs',
      '-c',
      'log_filename=statements',
      '-c',
      'log_connections=on',
      '-c',
      'log_disconnections=on',
      '-c',
      'log_parameter_max_length=-1',
    ]);
    const postgres = await this.inspect(this.pgName);
    if (
      postgres.Config?.Labels?.[PROOF_LABEL] !== this.runId ||
      postgres.Image !== this.postgresImageId ||
      postgres.HostConfig?.NetworkMode !== 'none' ||
      postgres.HostConfig?.Privileged ||
      postgres.Mounts.filter((mount) => mount.Type !== 'tmpfs').some(
        (mount) => mount.Name !== this.socketVolume || mount.Destination !== DATABASE_SOCKET,
      )
    ) {
      throw new Error('PostgreSQL isolation does not match the owned proof database');
    }
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await this.docker([
          'exec',
          this.pgName,
          'pg_isready',
          '-h',
          DATABASE_SOCKET,
          '-U',
          'postgres',
          '-d',
          this.database,
        ]);
        ready = true;
        break;
      } catch {
        if (!(await this.inspect(this.pgName)).State.Running)
          throw new Error('Isolated PostgreSQL stopped before readiness');
      }
      await delay(500);
    }
    if (!ready) throw new Error('Isolated PostgreSQL readiness timed out');
    await this.docker([
      'exec',
      '--user',
      '0',
      this.pgName,
      'sh',
      '-ceu',
      'if getent passwd "$1" >/dev/null; then exit 1; fi; printf "%s:x:%s:%s::/nonexistent:/usr/sbin/nologin\\n" "$2" "$1" "$1" >> /etc/passwd',
      '--',
      String(APP_UID),
      APP_OS_USER,
    ]);
    await this.configurePeer();
    let initialized;
    if (this.snapshot) {
      if (!this.snapshotFile || digest(await readFile(this.snapshotFile)) !== this.snapshot.digest)
        throw new Error('Template snapshot hash mismatch');
      await this.databaseCommand('prepare-restore', this.database);
      await this.docker(['cp', this.snapshotFile, `${this.pgName}:/tmp/public-proof.dump`]);
      await this.docker([
        'exec',
        this.pgName,
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '-h',
        DATABASE_SOCKET,
        '-U',
        'postgres',
        '--dbname',
        this.database,
        '/tmp/public-proof.dump',
      ]);
      await this.docker(['exec', this.pgName, 'rm', '/tmp/public-proof.dump']);
      initialized = JSON.parse(await this.databaseCommand('verify-restore', this.database));
    } else {
      initialized = JSON.parse(await this.databaseCommand('initialize', this.database));
    }
    if (initialized.fixtureDigest !== digest(this.fixtures))
      throw new Error('Fixture seed digest does not match');
    this.migrationDigest = initialized.migrationDigest;
    const name = `${this.prefix}-build-identity`;
    try {
      await this.run(name, [
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        this.imageId,
        'node',
        '-e',
        "process.stdout.write(require('node:fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())",
      ]);
      const status = await this.docker(['wait', name]);
      if (status !== '0') throw new Error('Could not read immutable Next build identity');
      this.buildId = await this.docker(['logs', name]);
      if (!this.buildId || /\s/.test(this.buildId)) throw new Error('Invalid Next build identity');
    } finally {
      await this.removeContainer(name);
    }
    return this;
  }

  async exportSnapshot(filename) {
    const dumped = await execute(
      'docker',
      [
        'exec',
        this.pgName,
        'pg_dump',
        '--format=custom',
        '--no-owner',
        '-h',
        DATABASE_SOCKET,
        '-U',
        'postgres',
        this.database,
      ],
      { encoding: 'buffer', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
    );
    await writeFile(filename, dumped.stdout);
    const roleSql =
      "select coalesce(json_agg(r),'[]'::json) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname <> 'postgres' and rolname !~ '^pg_' order by rolname) r";
    const roles = JSON.parse(
      await this.docker([
        'exec',
        this.pgName,
        'psql',
        '-At',
        '-h',
        DATABASE_SOCKET,
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        roleSql,
      ]),
    );
    return {
      filename: path.basename(filename),
      digest: digest(dumped.stdout),
      roles,
      sourceRunId: this.runId,
      fixtureDigest: digest(this.fixtures),
      migrationDigest: this.migrationDigest,
    };
  }

  async inspectImage(reference) {
    if (!reference) throw new Error('The proof requires an already-built image');
    const value = JSON.parse(await this.docker(['image', 'inspect', reference]))[0];
    if (!/^sha256:[a-f0-9]{64}$/.test(value?.Id)) throw new Error('Missing immutable image digest');
    return value;
  }

  async databaseCommand(command, database, extra = '') {
    const name = `${this.prefix}-database-command`;
    try {
      await this.run(name, [
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '0',
        '--mount',
        `type=volume,source=${this.socketVolume},destination=${DATABASE_SOCKET}`,
        '--mount',
        `type=bind,source=${path.join(this.root, 'scripts')},destination=/harness/scripts,readonly`,
        '--mount',
        `type=bind,source=${path.join(this.root, 'apps/web/db/neon')},destination=/proof-migrations,readonly`,
        '--mount',
        `type=bind,source=${this.input},destination=/proof-input,readonly`,
        '--env',
        'CI=true',
        this.imageId,
        'node',
        '/harness/scripts/public-runtime/database.mjs',
        command,
        database,
        extra,
      ]);
      const status = await this.docker(['wait', name]);
      if (status !== '0')
        throw new Error(`Public fixture ${command} failed: ${await this.docker(['logs', name])}`);
      return await this.docker(['logs', name]);
    } finally {
      await this.removeContainer(name);
    }
  }

  async startCase(route, { visual = false } = {}) {
    if (this.index >= 512) throw new Error('Public runtime case budget exceeded');
    if (this.activeCase !== null) throw new Error('Runtime cases must not overlap');
    const index = this.index++;
    this.activeCase = index;
    const database = `${this.database}_${index}`;
    await this.databaseCommand('clone', this.database, database);
    const readAuthority = JSON.parse(await this.databaseCommand('authorize', database));
    await this.configurePeer(database);
    const caseDir = path.join(this.directory, `case-${index}`);
    await mkdir(caseDir);
    const state = {
      ...route,
      runId: this.runId,
      database,
      templateDatabase: this.database,
      databaseRole: caseDatabaseRole(database),
      readAuthority,
      startCanary: `proof_start_${this.runId}_${index}`,
      endCanary: `proof_end_${this.runId}_${index}`,
      applicationCanary: `proof_application_${this.runId}_${index}`,
      visual,
    };
    await writeFile(path.join(caseDir, 'state.json'), JSON.stringify(state));
    const httpVolume = await this.volume(`${this.prefix}-http-${index}`);
    const outputVolume = await this.volume(`${this.prefix}-output-${index}`);
    const permissions = `${this.prefix}-permissions-${index}`;
    try {
      await this.run(permissions, [
        '--network',
        'none',
        '--user',
        '0',
        '--mount',
        `type=volume,source=${httpVolume},destination=/http`,
        '--mount',
        `type=volume,source=${outputVolume},destination=/output`,
        this.imageId,
        'node',
        '-e',
        "for(const p of ['/http','/output']){require('node:fs').chownSync(p,1000,1000);require('node:fs').chmodSync(p,0o700)}",
      ]);
      if ((await this.docker(['wait', permissions])) !== '0')
        throw new Error('Proof volume initialization failed');
    } finally {
      await this.removeContainer(permissions);
    }
    const mounts = [
      { source: this.socketVolume, destination: DATABASE_SOCKET, writable: false, type: 'volume' },
      { source: httpVolume, destination: '/run/agi-proof-http', writable: true, type: 'volume' },
      { source: outputVolume, destination: '/proof-output', writable: true, type: 'volume' },
      {
        source: path.join(this.root, 'scripts'),
        destination: '/harness/scripts',
        writable: false,
        type: 'bind',
      },
      { source: caseDir, destination: '/proof-input', writable: false, type: 'bind' },
    ];
    const connectionString = `postgres://${state.databaseRole}@localhost/${database}?host=${DATABASE_SOCKET}&sslmode=disable`;
    const appName = await this.run(`${this.prefix}-app-${index}`, [
      '--memory',
      '4g',
      '--memory-swap',
      '8g',
      '--pids-limit',
      '128',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '--tmpfs',
      '/tmp:uid=1000,gid=1000',
      '--tmpfs',
      `${APP_ROOT}/.next/cache:uid=1000,gid=1000`,
      '--tmpfs',
      '/app/workflow-data:uid=1000,gid=1000',
      ...mounts.flatMap((mount) => [
        '--mount',
        `type=${mount.type},source=${mount.source},destination=${mount.destination}${mount.writable ? '' : ',readonly'}`,
      ]),
      '--env',
      'NODE_ENV=production',
      '--env',
      'PORT=3000',
      '--env',
      'HOSTNAME=127.0.0.1',
      '--env',
      'CI=true',
      '--env',
      'NEXT_TELEMETRY_DISABLED=1',
      '--env',
      'AGI_DEPLOY_ENV=preview',
      '--env',
      'VERCEL_ENV=preview',
      '--env',
      'AGI_ALLOW_INVALID_ENV=1',
      '--env',
      'AGI_BOT_PROTECTION=off',
      '--env',
      'AGI_KV_PROVIDER=memory',
      '--env',
      'AGI_STORAGE_PROVIDER=memory',
      '--env',
      'AGI_DATABASE_PROVIDER=postgres',
      '--env',
      `AGI_DATABASE_URL=${connectionString}`,
      '--env',
      `DATABASE_URL=${connectionString}`,
      '--env',
      `AGI_RELEASE_SHA=${this.revision}`,
      '--env',
      `NEXT_PUBLIC_APP_URL=${PROOF_ORIGIN}`,
      '--env',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmstY2kuaW52YWxpZCQ',
      '--env',
      'CLERK_SECRET_KEY=public-proof-clerk-fixture',
      '--env',
      `CLERK_AUTHORIZED_PARTIES=${PROOF_ORIGIN}`,
      this.imageId,
      'node',
      visual
        ? '/harness/scripts/public-runtime/serve.mjs'
        : '/harness/scripts/public-runtime/observer.mjs',
    ]);
    assertIsolatedContainer(await this.inspect(appName), this.runId, this.imageId, mounts);
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (!(await this.inspect(appName)).State.Running)
        throw new Error(`Public runtime stopped: ${await this.docker(['logs', appName])}`);
      try {
        await this.docker([
          'exec',
          appName,
          'node',
          '-e',
          "const s=require('node:net').connect(3000,'127.0.0.1');s.once('connect',()=>s.end());s.once('error',()=>process.exit(1));s.setTimeout(500,()=>process.exit(1));",
        ]);
        ready = true;
        break;
      } catch {
        await delay(500);
      }
    }
    if (!ready) throw new Error('Cold public server readiness timed out');
    const relayName = await this.run(`${this.prefix}-relay-${index}`, [
      '--memory',
      '256m',
      '--pids-limit',
      '32',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '--publish',
      '127.0.0.1:3000:3000',
      '--mount',
      `type=volume,source=${httpVolume},destination=/run/agi-proof-http,readonly`,
      '--mount',
      `type=bind,source=${path.join(this.root, 'scripts')},destination=/harness/scripts,readonly`,
      this.imageId,
      'node',
      '/harness/scripts/public-runtime/relay.mjs',
    ]);
    const relay = await this.inspect(relayName);
    if (JSON.stringify(relay.Config?.Healthcheck?.Test) !== JSON.stringify(['NONE']))
      throw new Error('Relay inherited an unobserved healthcheck');
    let relayReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await this.docker([
          'exec',
          relayName,
          'node',
          '-e',
          "const s=require('node:net').connect(3000,'127.0.0.1');s.once('connect',()=>s.end());s.once('error',()=>process.exit(1));s.setTimeout(500,()=>process.exit(1));",
        ]);
        relayReady = true;
        break;
      } catch {
        await delay(100);
      }
    }
    if (!relayReady) throw new Error('The isolated HTTP relay did not become ready');
    const handle = Object.freeze({
      state,
      appName,
      relayName,
      caseDir,
      database,
      mounts,
      httpVolume,
      outputVolume,
      index,
      origin: PROOF_ORIGIN,
    });
    this.handleBindings.set(handle, digest(state));
    return handle;
  }

  async configurePeer(database = null) {
    const policy = peerConfiguration(database);
    await this.docker([
      'exec',
      '--user',
      'postgres',
      this.pgName,
      'sh',
      '-ceu',
      'printf "%s\\n" "$1" > "$PGDATA/pg_hba.conf"; printf "%s\\n" "$2" > "$PGDATA/pg_ident.conf"',
      '--',
      policy.hba,
      policy.ident,
    ]);
    await this.docker([
      'exec',
      '--user',
      'postgres',
      this.pgName,
      'psql',
      '-At',
      '-h',
      DATABASE_SOCKET,
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      'select pg_reload_conf()',
    ]);
    let loaded = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await this.docker([
          'exec',
          '--user',
          '0',
          this.pgName,
          'psql',
          '-At',
          '-h',
          DATABASE_SOCKET,
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-c',
          'select current_user',
        ]);
        loaded = true;
        break;
      } catch {
        await delay(100);
      }
    }
    if (!loaded) throw new Error('Peer authentication did not become ready');
    const contents = JSON.parse(
      await this.docker([
        'exec',
        '--user',
        'postgres',
        this.pgName,
        'psql',
        '-At',
        '-h',
        DATABASE_SOCKET,
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        "select json_build_object('hba',pg_read_file(current_setting('hba_file')),'ident',pg_read_file(current_setting('ident_file')),'errors',(select count(*) from pg_hba_file_rules where error is not null))",
      ]),
    );
    if (
      contents.hba.trim() !== policy.hba ||
      contents.ident.trim() !== policy.ident ||
      contents.errors !== 0
    )
      throw new Error('Peer authentication policy is not exact');
    const user = await this.docker([
      'exec',
      '--user',
      '0',
      this.pgName,
      'getent',
      'passwd',
      String(APP_UID),
    ]);
    if (user.split(':')[0] !== APP_OS_USER || Number(user.split(':')[2]) !== APP_UID)
      throw new Error('PostgreSQL cannot resolve the application peer UID');
    if (database) {
      let caseReady = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const identity = await this.docker([
            'exec',
            '--user',
            `${APP_UID}:${APP_UID}`,
            this.pgName,
            'psql',
            '-At',
            '-h',
            DATABASE_SOCKET,
            '-U',
            caseDatabaseRole(database),
            '-d',
            database,
            '-c',
            'select current_user',
          ]);
          if (identity !== caseDatabaseRole(database))
            throw new Error('Peer mapped the wrong application role');
          caseReady = true;
          break;
        } catch {
          await delay(100);
        }
      }
      if (!caseReady)
        throw new Error(
          'The exact application UID/database/role peer mapping did not become ready',
        );
    }
  }

  async finishCase(handle, render, browserObservation) {
    this.assertCase(handle);
    const snapshot = JSON.parse(
      await this.docker([
        'exec',
        handle.relayName,
        'node',
        '/harness/scripts/public-runtime/relay.mjs',
        'snapshot',
        handle.state.stateId,
      ]),
    );
    if (!snapshot.complete || snapshot.stateId !== handle.state.stateId)
      throw new Error('Observer did not acknowledge the measured state');
    const stopped = await this.stopContainer(handle.appName);
    if (stopped.State.Running || stopped.State.ExitCode !== 0)
      throw new Error('Observed server did not finish a clean teardown');
    assertIsolatedContainer(stopped, this.runId, this.imageId, handle.mounts);
    const output = path.join(handle.caseDir, 'observed');
    await mkdir(output);
    await this.docker(['cp', `${handle.appName}:/proof-output/.`, output]);
    const observer = JSON.parse(await readFile(path.join(output, 'observer.json'), 'utf8'));
    const eventsJsonl = await readFile(path.join(output, 'events.jsonl'), 'utf8');
    const nodeCoverage = JSON.parse(await readFile(path.join(output, 'coverage.json'), 'utf8'));
    const events = eventsJsonl
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (
      events.some((entry, index) => entry.sequence !== index) ||
      events[0]?.kind !== 'observer-start' ||
      events.at(-1)?.kind !== 'observer-exit' ||
      events.at(-1)?.code !== 0 ||
      !events.some((entry) => entry.kind === 'snapshot-after-render')
    ) {
      throw new Error('Observer lifecycle is incomplete');
    }
    const entryLoad = events.findIndex(
      (entry) => entry.kind === 'module-load' && entry.url === 'file:///app/apps/web/server.js',
    );
    const databaseReady = events.findIndex(
      (entry) =>
        entry.kind === 'database-start-canary' && entry.marker === handle.state.applicationCanary,
    );
    if (databaseReady < 1 || entryLoad <= databaseReady)
      throw new Error('Production imports were not observed after both instruments started');
    const firstRequest = events.find((entry) => entry.kind === 'request');
    if (
      firstRequest?.url !== handle.state.path ||
      firstRequest.method !== 'GET' ||
      firstRequest.headers['sec-fetch-dest'] !== 'document'
    )
      throw new Error('Unowned HTTP traffic preceded the cold document request');
    observer.stoppedAfterRender = true;
    await this.configurePeer();
    await this.databaseCommand('canary', handle.database, handle.state.endCanary);
    let statements;
    let postgresJsonl;
    for (let attempt = 0; attempt < 40; attempt++) {
      const logfile = await this.docker([
        'exec',
        this.pgName,
        'psql',
        '-At',
        '-h',
        DATABASE_SOCKET,
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        "select pg_current_logfile('jsonlog')",
      ]);
      if (!/^\/proof-logs\/[a-z0-9_.-]+$/.test(logfile))
        throw new Error('PostgreSQL did not expose its independent statement log');
      const logs = await this.docker(['exec', this.pgName, 'cat', logfile]);
      try {
        statements = parseDatabaseStatements(
          logs,
          handle.state,
          observer.privilegeCanaries,
          authorityQueries(this.runId),
        );
        postgresJsonl = logs;
        break;
      } catch (error) {
        if (attempt === 39) throw error;
        await delay(100);
      }
    }
    const documents = observer.documents.filter((entry) => entry.url === handle.state.path);
    if (observer.documents.length !== 1 || documents.length !== 1 || documents[0].method !== 'GET')
      throw new Error('The proof must observe exactly one requested main document');
    const proof = {
      version: PROOF_VERSION,
      runId: this.runId,
      stateId: handle.state.stateId,
      revision: this.revision,
      imageId: this.imageId,
      buildId: this.buildId,
      fixtureDigest: digest(this.fixtures),
      migrationDigest: this.migrationDigest,
      observer,
      databaseStatements: statements,
      databaseCanariesVerified: true,
      databaseAuthorityVerified: true,
      isolationVerified: true,
      document: documentInputs(new URL(handle.state.path, PROOF_ORIGIN).href, documents[0].headers),
      render,
      teardownComplete: false,
      sourceState: handle.state,
      databaseRole: handle.state.databaseRole,
      scope:
        'Bounded public read execution in an isolated case database with SELECT-only application authority; does not verify RLS enforcement or arbitrary transitive routine safety.',
    };
    if (!this.evidenceDirectory || !/^[a-f0-9]{64}$/.test(handle.state.stateId))
      throw new Error('Raw evidence requires an owned artifact destination and state identity');
    const receipt = {
      nodeCoverage,
      browserCoverage: browserObservation.coverage,
      browserHttpRequests: browserObservation.httpRequests,
      eventsJsonl,
      postgresJsonl,
    };
    const serialized = JSON.stringify(receipt);
    if (Buffer.byteLength(serialized) > 256 * 1024 * 1024)
      throw new Error('Raw execution evidence exceeded its case budget');
    const archive = gzipSync(serialized);
    if (archive.byteLength > 64 * 1024 * 1024)
      throw new Error('Compressed execution evidence exceeded its case budget');
    proof.evidence = {
      filename: `evidence/${handle.state.stateId}.json.gz`,
      digest: digest(archive),
      nodeCoverageDigest: digest(nodeCoverage),
      browserCoverageDigest: digest(receipt.browserCoverage),
      browserHttpDigest: digest(receipt.browserHttpRequests),
      eventsDigest: digest(eventsJsonl),
      postgresLogDigest: digest(postgresJsonl),
    };
    validateRawReceipt(receipt, proof, authorityQueries(this.runId));
    await mkdir(this.evidenceDirectory, { recursive: true });
    await writeFile(path.join(this.evidenceDirectory, `${handle.state.stateId}.json.gz`), archive);
    await this.removeContainer(handle.relayName);
    await this.removeContainer(handle.appName);
    await this.databaseCommand('drop', this.database, handle.database);
    await this.removeCaseVolumes(handle);
    this.activeCase = null;
    this.proofs.push(proof);
    this.proofBindings.set(proof, {
      digest: digest(proof),
      expected: structuredClone({
        ...handle.state,
        runId: this.runId,
        revision: this.revision,
        imageId: this.imageId,
        buildId: this.buildId,
        fixtureDigest: digest(this.fixtures),
        migrationDigest: this.migrationDigest,
      }),
    });
    return proof;
  }

  async finishVisual(handle) {
    this.assertCase(handle);
    const stopped = await this.stopContainer(handle.appName);
    if (stopped.State.Running || stopped.State.ExitCode !== 0)
      throw new Error('Visual server teardown did not complete');
    assertIsolatedContainer(stopped, this.runId, this.imageId, handle.mounts);
    await this.configurePeer();
    await this.removeContainer(handle.relayName);
    await this.removeContainer(handle.appName);
    await this.databaseCommand('drop', this.database, handle.database);
    await this.removeCaseVolumes(handle);
    this.activeCase = null;
  }

  async removeCaseVolumes(handle) {
    for (const volume of [handle.httpVolume, handle.outputVolume]) {
      await this.removeVolume(volume);
    }
  }

  assertCase(handle) {
    if (
      handle.index !== this.activeCase ||
      this.handleBindings.get(handle) !== digest(handle.state)
    )
      throw new Error('Runtime case identity changed');
  }

  async stopContainer(name) {
    const owned = this.names.get(name);
    if (!owned) throw new Error('Refusing to stop an unowned container');
    const current = await this.inspect(owned.id);
    if (
      current.Id !== owned.id ||
      current.Image !== owned.image ||
      current.Config?.Labels?.[PROOF_LABEL] !== this.runId
    )
      throw new Error('Container ownership changed before stopping');
    await this.docker(['stop', '--time', '15', owned.id]);
    return this.inspect(owned.id);
  }

  async removeContainer(name) {
    if (!this.names.has(name)) return;
    const owned = this.names.get(name);
    let current;
    try {
      current = await this.inspect(owned.id);
    } catch (error) {
      const existing = await this.docker([
        'ps',
        '--all',
        '--no-trunc',
        '--filter',
        `id=${owned.id}`,
        '--format',
        '{{.ID}}',
      ]);
      if (existing) throw error;
      this.names.delete(name);
      await this.persistOwnership();
      return;
    }
    if (
      current.Id !== owned.id ||
      current.Image !== owned.image ||
      current.Config?.Labels?.[PROOF_LABEL] !== this.runId
    )
      throw new Error('Refusing to remove a container with unverified ownership');
    await this.docker(['rm', '--force', owned.id]);
    this.names.delete(name);
    await this.persistOwnership();
  }

  async removeVolume(name) {
    if (!this.volumes.has(name)) return;
    let current;
    try {
      current = JSON.parse(await this.docker(['volume', 'inspect', name]))[0];
    } catch (error) {
      const existing = (await this.docker(['volume', 'ls', '--format', '{{.Name}}'])).split('\n');
      if (existing.includes(name)) throw error;
      this.volumes.delete(name);
      await this.persistOwnership();
      return;
    }
    if (
      current.Name !== name ||
      current.Labels?.[PROOF_LABEL] !== this.runId ||
      current.Driver !== 'local' ||
      Object.keys(current.Options ?? {}).length
    )
      throw new Error('Refusing to remove an unowned volume');
    await this.docker(['volume', 'rm', name]);
    this.volumes.delete(name);
    await this.persistOwnership();
  }

  async close() {
    const errors = [];
    for (const name of [...this.names.keys()].reverse()) {
      try {
        await this.removeContainer(name);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const volume of [...this.volumes]) {
      try {
        await this.removeVolume(volume);
      } catch (error) {
        errors.push(error);
      }
    }
    const remainingContainers = await this.docker([
      'ps',
      '--all',
      '--filter',
      `label=${PROOF_LABEL}=${this.runId}`,
      '--format',
      '{{.Names}}',
    ]);
    const remainingVolumes = await this.docker([
      'volume',
      'ls',
      '--filter',
      `label=${PROOF_LABEL}=${this.runId}`,
      '--format',
      '{{.Name}}',
    ]);
    if (errors.length || remainingContainers || remainingVolumes)
      throw new AggregateError(errors, 'Public runtime resource teardown is incomplete');
    for (const proof of this.proofs) {
      const binding = this.proofBindings.get(proof);
      if (!binding || binding.digest !== digest(proof))
        throw new Error('Observed proof changed before lifecycle sealing');
      proof.teardownComplete = true;
      validateRuntimeProof(proof, binding.expected);
    }
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
    if (this.lifecycleFile) await rm(this.lifecycleFile, { force: true });
  }
}

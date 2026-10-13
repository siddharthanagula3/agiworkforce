import { appendFileSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import net from 'node:net';
import http from 'node:http';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { startPublicHttpBridge } from './http-bridge.mjs';
import { probeApplicationAuthority } from './database-authority.mjs';
import { buildEvidenceReader } from './build-evidence.mjs';
import {
  DATABASE_SOCKET,
  CONTROL_SOCKET,
  digest,
  renderExecutionWitness,
  compiledSourceWitness,
} from './proof.mjs';

const state = JSON.parse(readFileSync('/proof-input/state.json', 'utf8'));
const readBuildSource = buildEvidenceReader('/app/apps/web/.next/server', '/proof-build/server', {
  revision: process.env.AGI_RELEASE_SHA,
  buildId: readFileSync('/app/apps/web/.next/BUILD_ID', 'utf8').trim(),
});
const eventsFile = '/proof-output/events.jsonl';
let sequence = 0;
const record = (kind, value = {}) =>
  appendFileSync(eventsFile, JSON.stringify({ sequence: sequence++, kind, ...value }) + '\n');
const report = {
  startedBeforeEntry: true,
  stoppedAfterRender: false,
  networkCanaryDenied: false,
  moduleCanaryObserved: false,
  coverageCanaryObserved: false,
  routeBundleHash: null,
  routeBundleExecuted: false,
  unobservedExecution: [],
  network: [],
  documents: [],
};
record('observer-start', { runId: state.runId, stateId: state.stateId, pid: process.pid });
const inspector = new Session();
inspector.connect();
const inspect = (method, parameters = {}) =>
  new Promise((resolve, reject) =>
    inspector.post(method, parameters, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
await inspect('Profiler.enable');
await inspect('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

await new Promise((resolve, reject) => {
  const socket = net.connect({ host: '198.51.100.1', port: 443 });
  socket.setTimeout(1500, () => {
    socket.destroy();
    reject(new Error('Network isolation canary did not fail promptly'));
  });
  socket.once('connect', () => {
    socket.destroy();
    reject(new Error('Network isolation canary escaped'));
  });
  socket.once('error', (error) => {
    if (!['ENETUNREACH', 'EHOSTUNREACH', 'EACCES'].includes(error.code)) return reject(error);
    report.networkCanaryDenied = true;
    record('network-canary-denied', { code: error.code });
    resolve();
  });
});

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...raw) {
  const args = Array.isArray(raw[0]) ? raw[0] : raw;
  const first = args[0];
  const options =
    typeof first === 'object'
      ? first
      : typeof first === 'string' && !/^\d+$/.test(first)
        ? { path: first }
        : { port: Number(first), host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const allowed =
    options.path === `${DATABASE_SOCKET}/.s.PGSQL.5432` ||
    (Number(options.port) === 3000 &&
      ['127.0.0.1', 'localhost', '::1'].includes(options.host ?? 'localhost'));
  const event = {
    allowed,
    path: options.path ?? null,
    host: options.host ?? null,
    port: Number(options.port) || null,
  };
  report.network.push(event);
  record('connection', event);
  if (!allowed) throw new Error('Unexpected runtime network destination');
  return originalConnect.apply(this, raw);
};

const disallowExecution = (kind) => {
  report.unobservedExecution.push(kind);
  record('unobserved-execution', { operation: kind });
  throw new Error(`Runtime proof does not observe ${kind}`);
};
for (const name of ['exec', 'execFile', 'execSync', 'execFileSync', 'fork', 'spawn', 'spawnSync']) {
  childProcess[name] = () => disallowExecution(`child_process.${name}`);
}
workerThreads.Worker = class {
  constructor() {
    disallowExecution('worker_threads.Worker');
  }
};
syncBuiltinESMExports();

const routeManifest = JSON.parse(
  readFileSync('/app/apps/web/.next/server/app-paths-manifest.json', 'utf8'),
);
const routeEntry = routeManifest[`${state.pattern === '/' ? '' : state.pattern}/page`];
if (typeof routeEntry !== 'string' || routeEntry.includes('..'))
  throw new Error('Production route bundle is not in the build manifest');
const routeFile = `/app/apps/web/.next/server/${routeEntry}`;
report.routeBundleHash = createHash('sha256').update(readFileSync(routeFile)).digest('hex');
const prerender = JSON.parse(readFileSync('/app/apps/web/.next/prerender-manifest.json', 'utf8'));
report.prerender = {
  manifestDigest: digest(prerender),
  route: prerender.routes[state.path] ?? null,
  dynamic: prerender.dynamicRoutes[state.pattern] ?? null,
};
if (
  state.executionRequired &&
  (prerender.routes[state.path] || prerender.dynamicRoutes[state.pattern])
) {
  throw new Error(
    'This state requires build-phase execution evidence that the cold server cannot supply',
  );
}
if (state.renderRuntime === 'browser') {
  const scope = {};
  const manifestText = readFileSync(
    routeFile.replace(/\.js$/, '_client-reference-manifest.js'),
    'utf8',
  );
  runInNewContext(manifestText, scope, { timeout: 1000 });
  const clientManifest = scope.__RSC_MANIFEST[`${state.pattern}/page`];
  const entries = Object.entries(clientManifest.clientModules).filter(([source]) =>
    source.endsWith(`/${state.renderSource.file}`),
  );
  if (entries.length !== 1)
    throw new Error('Client source is not uniquely mapped by the production build');
  report.clientManifestDigest = digest(manifestText);
  report.clientChunks = entries[0][1].chunks.map((url) => {
    if (!url.startsWith('/_next/static/chunks/') || url.includes('..'))
      throw new Error('Unexpected client chunk path');
    return {
      url,
      digest: digest(
        readFileSync(`/app/apps/web/.next/static/${url.slice('/_next/static/'.length)}`, 'utf8'),
      ),
    };
  });
}
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    record('module-load', { url, format: result.format });
    if (url.endsWith('/module-canary.mjs')) report.moduleCanaryObserved = true;
    return result;
  },
});
const { executeCanary } = await import('./module-canary.mjs');
if (executeCanary(state.stateId) !== state.stateId) throw new Error('Execution canary failed');

const require = createRequire('/app/apps/web/package.json');
const { Client } = require('pg');
const canaryDb = new Client({
  connectionString: process.env.AGI_DATABASE_URL,
  application_name: 'agi-public-proof-canary',
});
await canaryDb.connect();
await canaryDb.query(`select '${state.startCanary}'`);
report.privilegeCanaries = await probeApplicationAuthority(
  Client,
  process.env.AGI_DATABASE_URL,
  state,
);
await canaryDb.query(`select '${state.applicationCanary}'`);
await canaryDb.end();
record('database-start-canary', { marker: state.applicationCanary });

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    const [request, response] = args;
    const incoming = {
      method: request.method,
      url: request.url,
      headers: structuredClone(request.headers),
    };
    record('request', incoming);
    response.once('finish', () => {
      record('response', { ...incoming, status: response.statusCode });
      if (incoming.headers['sec-fetch-dest'] === 'document')
        report.documents.push({ ...incoming, status: response.statusCode });
    });
  }
  return originalEmit.call(this, event, ...args);
};

await startPublicHttpBridge();
const control = net.createServer((socket) => {
  let input = '';
  socket.on('data', (chunk) => {
    input += chunk.toString();
    if (input.length > 256) socket.destroy(new Error('Oversize observer command'));
    if (!input.endsWith('\n')) return;
    const command = JSON.parse(input);
    if (command.command !== 'snapshot' || command.stateId !== state.stateId)
      return socket.destroy(new Error('Invalid observer command'));
    void (async () => {
      const coverage = await inspect('Profiler.takePreciseCoverage');
      const scripts = coverage.result;
      const executed = (script) =>
        script.functions.some((fn) => fn.ranges.some((range) => range.count > 0));
      report.coverageCanaryObserved = scripts.some(
        (script) => script.url.endsWith('/module-canary.mjs') && executed(script),
      );
      report.routeBundleExecuted = scripts.some(
        (script) =>
          [routeFile, pathToFileURL(routeFile).href].includes(script.url) && executed(script),
      );
      report.renderExecution = renderExecutionWitness(
        coverage,
        state.renderSource,
        readBuildSource,
      );
      report.compiledSource = compiledSourceWitness(coverage, state.renderSource, readBuildSource);
      writeFileSync('/proof-output/coverage.json', JSON.stringify(coverage));
      writeFileSync('/proof-output/observer.json', JSON.stringify(report));
      record('snapshot-after-render', { coverageDigest: digest(coverage) });
      socket.end(JSON.stringify({ complete: true, stateId: state.stateId }) + '\n');
    })().catch((error) => {
      record('snapshot-error', { message: String(error) });
      socket.destroy();
    });
  });
});
await new Promise((resolve, reject) => {
  control.once('error', reject);
  control.listen(CONTROL_SOCKET, resolve);
});
chmodSync(CONTROL_SOCKET, 0o666);
process.on('exit', (code) => {
  writeFileSync('/proof-output/observer.json', JSON.stringify(report));
  record('observer-exit', { code });
});
await import(pathToFileURL('/app/apps/web/server.js').href);

import assert from 'node:assert/strict';
import test from 'node:test';
import { authorityQueries, caseDatabaseRole } from './database-authority.mjs';
import {
  assertFixtureDestination,
  assertIsolatedContainer,
  compiledSourceWitness,
  DATABASE_PREFIX,
  DATABASE_SOCKET,
  digest,
  documentInputs,
  matchDocumentProof,
  observedFixtureRead,
  parseDatabaseStatements,
  PROOF_LABEL,
  PROOF_VERSION,
  renderExecutionWitness,
  validateRuntimeProof,
  validateRawReceipt,
} from './proof.mjs';

const runId = 'a'.repeat(24);
const database = `${DATABASE_PREFIX}${runId}_1`;
const expected = {
  runId,
  stateId: 'state',
  revision: 'b'.repeat(40),
  imageId: `sha256:${'c'.repeat(64)}`,
  buildId: 'build',
  fixtureDigest: 'd'.repeat(64),
  migrationDigest: 'f'.repeat(64),
  executionRequired: true,
  renderRuntime: 'server',
  renderSource: { sourceDigest: 'e'.repeat(64) },
};
const cleanProof = () => ({
  ...expected,
  version: PROOF_VERSION,
  evidence: {
    filename: `evidence/${expected.stateId}.json.gz`,
    digest: 'f'.repeat(64),
    nodeCoverageDigest: 'f'.repeat(64),
    browserCoverageDigest: 'f'.repeat(64),
    browserHttpDigest: 'f'.repeat(64),
    eventsDigest: 'f'.repeat(64),
    postgresLogDigest: 'f'.repeat(64),
  },
  teardownComplete: true,
  isolationVerified: true,
  observer: {
    startedBeforeEntry: true,
    stoppedAfterRender: true,
    networkCanaryDenied: true,
    moduleCanaryObserved: true,
    coverageCanaryObserved: true,
    unobservedExecution: [],
    network: [],
    routeBundleHash: 'hash',
    routeBundleExecuted: true,
    renderExecution: { count: 1, sourceDigest: expected.renderSource.sourceDigest },
    compiledSource: { sourceDigest: expected.renderSource.sourceDigest },
  },
  databaseStatements: [],
  databaseRole: caseDatabaseRole(database),
  databaseCanariesVerified: true,
  databaseAuthorityVerified: true,
  document: documentInputs('http://127.0.0.1:3000/example', { host: '127.0.0.1:3000' }),
  render: { settled: true, stateMatched: true },
});

test('each observer, source, data, isolation and teardown obligation is independently blocking', () => {
  assert.equal(validateRuntimeProof(cleanProof(), expected).stateId, 'state');
  for (const field of [
    'teardownComplete',
    'isolationVerified',
    'databaseCanariesVerified',
    'databaseAuthorityVerified',
  ]) {
    const value = cleanProof();
    value[field] = false;
    assert.throws(() => validateRuntimeProof(value, expected), /Incomplete/);
  }
  for (const field of [
    'startedBeforeEntry',
    'stoppedAfterRender',
    'networkCanaryDenied',
    'moduleCanaryObserved',
    'coverageCanaryObserved',
  ]) {
    const value = cleanProof();
    value.observer[field] = false;
    assert.throws(() => validateRuntimeProof(value, expected), /Incomplete/);
  }
  for (const field of [
    'runId',
    'stateId',
    'revision',
    'imageId',
    'buildId',
    'fixtureDigest',
    'migrationDigest',
  ]) {
    const value = cleanProof();
    value[field] = 'different';
    assert.throws(() => validateRuntimeProof(value, expected), /Incomplete/);
  }
  const cached = cleanProof();
  cached.observer.renderExecution = null;
  assert.throws(() => validateRuntimeProof(cached, expected), /not observed executing/);
  const wrongSource = cleanProof();
  wrongSource.observer.compiledSource.sourceDigest = 'different';
  assert.throws(() => validateRuntimeProof(wrongSource, expected), /not observed executing/);
});

test('browser execution must belong to the client chunks identified by the exact image', () => {
  const proof = cleanProof();
  proof.observer.routeBundleExecuted = false;
  proof.observer.clientChunks = [{ url: '/_next/static/chunks/page.js', digest: 'actual' }];
  proof.render.clientExecution = {
    url: '/_next/static/chunks/page.js',
    scriptDigest: 'wrong',
    count: 1,
  };
  const browserExpected = { ...expected, renderRuntime: 'browser' };
  assert.throws(() => validateRuntimeProof(proof, browserExpected), /not observed executing/);
  proof.render.clientExecution.scriptDigest = 'actual';
  assert.equal(validateRuntimeProof(proof, browserExpected).stateId, 'state');
});

test('browser-only success and wrong application data reads cannot satisfy execution proof', () => {
  const proof = cleanProof();
  proof.observer = {};
  assert.throws(() => validateRuntimeProof(proof, expected), /Incomplete/);
  assert.throws(
    () => validateRuntimeProof(cleanProof(), { ...expected, requiredTable: 'shared_sessions' }),
    /did not read/,
  );
  const read = cleanProof();
  read.databaseStatements.push({
    user: read.databaseRole,
    statement: 'select * from public.shared_sessions',
  });
  assert.throws(
    () => validateRuntimeProof(read, { ...expected, dataAccess: 'handler-guarded' }),
    /issued application SQL/,
  );
  read.databaseStatements[0].statement = 'select public.read_from_an_indirect_view()';
  assert.throws(
    () => validateRuntimeProof(read, { ...expected, dataAccess: 'handler-guarded' }),
    /issued application SQL/,
  );
});

test('a successful fixture requires its actual SELECT and independently logged bound value', () => {
  const entry = {
    statement: 'select token, title from public.shared_sessions where token=$1',
    detail: "parameters: $1 = 'run-specific-token'",
    errorCode: '00000',
  };
  assert.equal(observedFixtureRead(entry, 'shared_sessions', ['run-specific-token']), true);
  for (const change of [
    { detail: "parameters: $1 = 'another-token'" },
    { errorCode: '42501' },
    { statement: "select 'from public.shared_sessions'" },
    { statement: 'select 1 /* from public.shared_sessions */' },
    { statement: 'select * from public.other_table' },
    { statement: 'delete from public.shared_sessions where token=$1' },
  ])
    assert.equal(
      observedFixtureRead({ ...entry, ...change }, 'shared_sessions', ['run-specific-token']),
      false,
    );
  const error = cleanProof();
  error.databaseStatements.push({ ...entry, errorCode: '42501' });
  assert.throws(() => validateRuntimeProof(error, expected), /Incomplete/);
});

const dbState = {
  runId,
  database,
  databaseRole: caseDatabaseRole(database),
  templateDatabase: `${DATABASE_PREFIX}${runId}`,
  startCanary: 'start_canary',
  applicationCanary: 'application_canary',
  endCanary: 'end_canary',
};
const queries = authorityQueries(runId);
const probes = [
  ...queries.map((probe) => ({ ...probe, code: '42501' })),
  { name: 'impersonate-postgres', database, user: 'postgres', code: '28000' },
  {
    name: 'connect-template',
    database: dbState.templateDatabase,
    user: dbState.databaseRole,
    code: '28000',
  },
  {
    name: 'connect-other-database',
    database: 'postgres',
    user: dbState.databaseRole,
    code: '28000',
  },
];
const logRows = () => [
  { user: dbState.databaseRole, dbname: database, message: "statement: select 'start_canary'" },
  ...queries.map((probe) => ({
    user: dbState.databaseRole,
    dbname: database,
    state_code: '42501',
    statement: probe.sql,
  })),
  ...probes
    .filter((probe) => probe.database)
    .map((probe) => ({ user: probe.user, dbname: probe.database, state_code: '28000' })),
  {
    user: dbState.databaseRole,
    dbname: database,
    application_name: 'agi-public-proof-controller',
    message: `statement: select 'proof_spoof_${runId}'`,
  },
  {
    user: dbState.databaseRole,
    dbname: database,
    message: "statement: select 'application_canary'",
  },
  {
    user: dbState.databaseRole,
    dbname: database,
    application_name: 'agi-public-proof-controller',
    message: 'statement: select * from public.shared_sessions where token=$1',
  },
  { user: 'postgres', dbname: database, message: "statement: select 'end_canary'" },
];
const serialize = (rows) => rows.map((row) => JSON.stringify(row)).join('\n');
test('database attribution follows authenticated user despite spoofed application_name', () => {
  const statements = parseDatabaseStatements(serialize(logRows()), dbState, probes, queries);
  assert.equal(statements.length, 1);
  assert.match(statements[0].statement, /shared_sessions/);
  assert.equal(statements[0].user, dbState.databaseRole);
  assert.equal(statements[0].application, 'agi-public-proof-controller');
});

test('independent privilege denials, peer rejections and both trace boundaries are mandatory', () => {
  const rows = logRows();
  for (const index of [0, 1, queries.length + 1, rows.length - 1]) {
    assert.throws(
      () =>
        parseDatabaseStatements(
          serialize(rows.filter((_, at) => at !== index)),
          dbState,
          probes,
          queries,
        ),
      /incomplete|missing/,
    );
  }
  assert.throws(() => parseDatabaseStatements(serialize(rows) + '\n{', dbState, probes, queries));
  const unattributed = [...rows];
  unattributed.splice(rows.length - 1, 0, {
    user: 'unobserved',
    dbname: database,
    message: 'statement: select 1',
  });
  assert.throws(
    () => parseDatabaseStatements(serialize(unattributed), dbState, probes, queries),
    /Unattributed/,
  );
});

test('connection checks reject remote hosts, socket substitutions and ordinary local databases', () => {
  const valid = `postgres://postgres@localhost/${database}?host=${DATABASE_SOCKET}&sslmode=disable`;
  assert.doesNotThrow(() => assertFixtureDestination(valid, database));
  for (const value of [
    valid.replace('localhost', 'production.example'),
    valid.replace(DATABASE_SOCKET, '/tmp'),
    valid.replace(database, 'agiworkforce_test'),
    valid + '&host=/another',
    valid.replace('postgres@', 'postgres:secret@'),
  ]) {
    assert.throws(() => assertFixtureDestination(value, database), /isolated Unix socket/);
  }
});

test('a correctly named container cannot conceal network, privilege or mount changes', () => {
  const value = {
    Config: {
      Labels: { [PROOF_LABEL]: runId },
      User: '1000:1000',
      Healthcheck: { Test: ['NONE'] },
    },
    Image: expected.imageId,
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
    },
    Mounts: [{ Type: 'volume', Name: 'owned', Destination: '/proof', RW: false }],
  };
  const mounts = [{ source: 'owned', destination: '/proof', writable: false }];
  assert.doesNotThrow(() => assertIsolatedContainer(value, runId, expected.imageId, mounts));
  for (const change of [
    { NetworkMode: 'host' },
    { ReadonlyRootfs: false },
    { Privileged: true },
    { PidMode: 'host' },
    { CapDrop: [] },
    { SecurityOpt: [] },
  ]) {
    assert.throws(
      () =>
        assertIsolatedContainer(
          { ...value, HostConfig: { ...value.HostConfig, ...change } },
          runId,
          expected.imageId,
          mounts,
        ),
      /isolation/,
    );
  }
  assert.throws(
    () =>
      assertIsolatedContainer(
        {
          ...value,
          Mounts: [
            ...value.Mounts,
            { Type: 'bind', Source: '/var/run/docker.sock', Destination: '/docker', RW: true },
          ],
        },
        runId,
        expected.imageId,
        mounts,
      ),
    /filesystem mount/,
  );
});

test('an inherited healthcheck cannot run unobserved route traffic', () => {
  const value = {
    Config: {
      Labels: { [PROOF_LABEL]: runId },
      User: '1000:1000',
      Healthcheck: { Test: ['CMD', 'fetch-health'] },
    },
    Image: expected.imageId,
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
    },
    Mounts: [],
  };
  assert.throws(() => assertIsolatedContainer(value, runId, expected.imageId, []), /isolation/);
});

test('viewport reuse requires identical actual server inputs, including client hints', () => {
  const proof = cleanProof();
  assert.equal(matchDocumentProof(proof, proof.document, expected).length, 5);
  const changed = documentInputs('http://127.0.0.1:3000/example', {
    host: '127.0.0.1:3000',
    'sec-ch-viewport-width': '390',
  });
  assert.throws(() => matchDocumentProof(proof, changed, expected), /server inputs differ/);
  assert.throws(
    () => documentInputs('http://127.0.0.1:3000/example', { cookie: 'session' }),
    /signed-out/,
  );
});

test('navigation-only observations never produce source execution witnesses', () => {
  const proof = cleanProof();
  proof.observer.renderExecution = null;
  proof.observer.routeBundleExecuted = false;
  const witnesses = matchDocumentProof(proof, proof.document, {
    ...expected,
    executionRequired: false,
  });
  assert.deepEqual(
    witnesses.map((value) => value.obligation),
    ['navigation-transport'],
  );
});

test('source-mapped module loading is distinct from observed render invocation', () => {
  const source = 'export default function Page() { return 1; }';
  const generated = 'function a(){return 1;}';
  const file = '/app/apps/web/.next/server/chunks/page.js';
  const map = {
    version: 3,
    sources: ['../../apps/web/app/example/page.tsx'],
    sourcesContent: [source],
    names: [],
    mappings: 'AAAA',
  };
  const read = (filename) => (filename.endsWith('.map') ? JSON.stringify(map) : generated);
  const target = {
    file: 'apps/web/app/example/page.tsx',
    startLine: 0,
    endLine: 0,
    sourceDigest: digest(source),
  };
  const coverage = (count) => ({
    result: [
      {
        url: file,
        functions: [
          { functionName: '', ranges: [{ startOffset: 0, endOffset: generated.length, count: 1 }] },
          { functionName: 'a', ranges: [{ startOffset: 0, endOffset: generated.length, count }] },
        ],
      },
    ],
  });
  assert.equal(compiledSourceWitness(coverage(0), target, read).sourceDigest, digest(source));
  assert.equal(renderExecutionWitness(coverage(0), target, read), null);
  assert.equal(renderExecutionWitness(coverage(1), target, read).count, 1);
  assert.throws(
    () => renderExecutionWitness(coverage(1), { ...target, sourceDigest: 'wrong' }, read),
    /reviewed route source/,
  );
});

test('raw receipts reproduce SQL attribution and V8 invocation instead of trusting summary booleans', () => {
  const make = () => {
    const proof = cleanProof();
    proof.sourceState = dbState;
    proof.observer.privilegeCanaries = probes;
    proof.observer.renderExecution = {
      scriptUrl: 'file:///app/page.js',
      functionName: 'render',
      startOffset: 1,
      endOffset: 20,
      count: 1,
    };
    const receipt = {
      nodeCoverage: {
        result: [
          {
            url: 'file:///harness/module-canary.mjs',
            functions: [
              {
                functionName: 'executeCanary',
                ranges: [{ startOffset: 1, endOffset: 10, count: 1 }],
              },
            ],
          },
          {
            url: 'file:///app/page.js',
            functions: [
              { functionName: 'render', ranges: [{ startOffset: 1, endOffset: 20, count: 1 }] },
            ],
          },
        ],
      },
      browserCoverage: { result: [] },
      browserHttpRequests: [],
      postgresJsonl: serialize(logRows()),
    };
    proof.databaseStatements = parseDatabaseStatements(
      receipt.postgresJsonl,
      dbState,
      probes,
      queries,
    );
    const bind = () => {
      receipt.eventsJsonl = serialize([
        { sequence: 0, kind: 'observer-start' },
        {
          sequence: 1,
          kind: 'snapshot-after-render',
          coverageDigest: digest(receipt.nodeCoverage),
        },
        { sequence: 2, kind: 'observer-exit', code: 0 },
      ]);
      proof.evidence = {
        nodeCoverageDigest: digest(receipt.nodeCoverage),
        browserCoverageDigest: digest(receipt.browserCoverage),
        browserHttpDigest: digest(receipt.browserHttpRequests),
        eventsDigest: digest(receipt.eventsJsonl),
        postgresLogDigest: digest(receipt.postgresJsonl),
      };
    };
    bind();
    return { receipt, proof, bind };
  };
  const complete = make();
  assert.equal(validateRawReceipt(complete.receipt, complete.proof, queries), true);
  complete.receipt.nodeCoverage.result[1].functions[0].ranges[0].count = 0;
  assert.throws(
    () => validateRawReceipt(complete.receipt, complete.proof, queries),
    /digest changed/,
  );
  complete.bind();
  assert.throws(
    () => validateRawReceipt(complete.receipt, complete.proof, queries),
    /raw V8 invocation/,
  );
  const noCanary = make();
  noCanary.receipt.nodeCoverage.result[0].functions[0].ranges[0].count = 0;
  noCanary.bind();
  assert.throws(
    () => validateRawReceipt(noCanary.receipt, noCanary.proof, queries),
    /V8 coverage is incomplete/,
  );
  const missingBoundary = make();
  missingBoundary.receipt.postgresJsonl = serialize(logRows().slice(0, -1));
  missingBoundary.bind();
  assert.throws(
    () => validateRawReceipt(missingBoundary.receipt, missingBoundary.proof, queries),
    /observation is incomplete/,
  );
});

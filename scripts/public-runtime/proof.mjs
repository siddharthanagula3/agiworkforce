import { createHash } from 'node:crypto';
import { SourceMap } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROOF_VERSION = 1;
export const PROOF_LABEL = 'agi.public-runtime.run';
export const DATABASE_PREFIX = 'agi_public_proof_';
export const DATABASE_SOCKET = '/var/run/postgresql';
export const HTTP_SOCKET = '/run/agi-proof-http/http.sock';
export const CONTROL_SOCKET = '/run/agi-proof-http/control.sock';
export function resolveProofOrigin(value = 'http://127.0.0.1:3000') {
  let origin;
  try {
    if (typeof value !== 'string') throw new Error('Origin must be a string');
    origin = new URL(value);
  } catch {
    throw new Error(
      'Public runtime origin must be an HTTP 127.0.0.1 origin with an unprivileged port',
    );
  }
  const port = Number(origin.port);
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    value !== origin.origin
  ) {
    throw new Error(
      'Public runtime origin must be an HTTP 127.0.0.1 origin with an unprivileged port',
    );
  }
  return origin.origin;
}
export const PROOF_ORIGIN = resolveProofOrigin(process.env.PUBLIC_RUNTIME_ORIGIN);
export const SOURCE_OBLIGATIONS = [
  'module-initializers-unverified',
  'import-side-effects-unverified',
  'transitive-bindings-unverified',
  'parameter-and-expression-evaluation-unverified',
  'render-execution-unverified',
];

export function digest(value) {
  return createHash('sha256')
    .update(typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value))
    .digest('hex');
}

export function renderExecutionWitness(coverage, target, readText) {
  for (const script of coverage.result ?? []) {
    const filename = script.url.startsWith('file:') ? fileURLToPath(script.url) : script.url;
    if (!filename.startsWith('/app/apps/web/.next/server/')) continue;
    let generated, payload;
    try {
      generated = readText(filename);
      payload = JSON.parse(readText(`${filename}.map`));
    } catch (error) {
      if (error.code === 'BUILD_EVIDENCE_MISMATCH') throw error;
      continue;
    }
    const sections = payload.sections ?? [{ offset: { line: 0, column: 0 }, map: payload }];
    for (const fn of script.functions) {
      if (!fn.functionName || !fn.ranges[0] || fn.ranges[0].count <= 0) continue;
      const declaration = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(
        generated.slice(fn.ranges[0].startOffset, fn.ranges[0].startOffset + 200),
      );
      if (!declaration) continue;
      const position = fn.ranges[0].startOffset + declaration[0].indexOf(declaration[1]);
      const prefix = generated.slice(0, position).split('\n');
      const line = prefix.length - 1;
      const column = prefix.at(-1).length;
      for (const section of [...sections].reverse()) {
        const offset = section.offset;
        if (line < offset.line || (line === offset.line && column < offset.column)) continue;
        const entry = new SourceMap(section.map).findEntry(
          line - offset.line,
          column - (line === offset.line ? offset.column : 0),
        );
        if (!entry.originalSource) break;
        const original = decodeURIComponent(entry.originalSource).replaceAll('\\', '/');
        if (
          !original.endsWith(`/${target.file}`) ||
          entry.originalLine < target.startLine ||
          entry.originalLine > target.endLine
        )
          break;
        const sourceIndex = section.map.sources.findIndex((source) =>
          decodeURIComponent(source).replaceAll('\\', '/').endsWith(`/${target.file}`),
        );
        const content = section.map.sourcesContent?.[sourceIndex];
        if (typeof content !== 'string' || digest(content) !== target.sourceDigest)
          throw new Error('Executed source map does not match the reviewed route source');
        return {
          script: path.basename(filename),
          scriptUrl: script.url,
          scriptDigest: digest(generated),
          sourceDigest: digest(content),
          originalLine: entry.originalLine,
          functionName: fn.functionName,
          startOffset: fn.ranges[0].startOffset,
          endOffset: fn.ranges[0].endOffset,
          count: fn.ranges[0].count,
        };
      }
    }
  }
  return null;
}

export function compiledSourceWitness(coverage, target, readText) {
  for (const script of coverage.result ?? []) {
    const filename = script.url.startsWith('file:') ? fileURLToPath(script.url) : script.url;
    if (!filename.startsWith('/app/apps/web/.next/server/')) continue;
    let payload;
    try {
      payload = JSON.parse(readText(`${filename}.map`));
    } catch (error) {
      if (error.code === 'BUILD_EVIDENCE_MISMATCH') throw error;
      continue;
    }
    for (const section of payload.sections ?? [{ map: payload }]) {
      const index = section.map.sources.findIndex((source) =>
        decodeURIComponent(source).replaceAll('\\', '/').endsWith(`/${target.file}`),
      );
      if (index < 0) continue;
      const content = section.map.sourcesContent?.[index];
      if (typeof content !== 'string' || digest(content) !== target.sourceDigest)
        throw new Error('Compiled source differs from the reviewed route');
      return { sourceDigest: digest(content), mapDigest: digest(payload) };
    }
  }
  return null;
}

export function documentInputs(url, headers) {
  const parsed = new URL(url);
  const normalized = Object.fromEntries(
    Object.entries(headers)
      .map(([name, value]) => [name.toLowerCase(), value])
      .filter(([name]) => !['connection', 'content-length'].includes(name))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  if (normalized.cookie || normalized.authorization)
    throw new Error('Public runtime proof requires a signed-out document request');
  return {
    method: 'GET',
    origin: parsed.origin,
    path: parsed.pathname,
    query: parsed.search,
    headers: normalized,
  };
}

export function assertFixtureDestination(connectionString, database) {
  const url = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== 'localhost' ||
    url.username !== 'postgres' ||
    url.password ||
    url.port ||
    !new RegExp(`^${DATABASE_PREFIX}[a-f0-9]{24}(?:_[0-9]+)?$`).test(database) ||
    url.pathname !== `/${database}` ||
    url.searchParams.get('host') !== DATABASE_SOCKET ||
    url.searchParams.get('sslmode') !== 'disable' ||
    [...url.searchParams.keys()].sort().join(',') !== 'host,sslmode'
  ) {
    throw new Error(
      'Fixtures require an owned disposable PostgreSQL database through its isolated Unix socket',
    );
  }
}

export function assertIsolatedContainer(value, runId, imageId, expectedMounts) {
  if (
    value.Config?.Labels?.[PROOF_LABEL] !== runId ||
    value.Image !== imageId ||
    value.HostConfig?.NetworkMode !== 'none' ||
    !value.HostConfig.ReadonlyRootfs ||
    value.HostConfig.Privileged ||
    value.HostConfig.PidMode === 'host' ||
    !value.HostConfig.CapDrop?.includes('ALL') ||
    value.Config?.User !== '1000:1000' ||
    !value.HostConfig.SecurityOpt?.includes('no-new-privileges') ||
    JSON.stringify(value.Config?.Healthcheck?.Test) !== JSON.stringify(['NONE'])
  )
    throw new Error('Runtime container isolation does not match the proof');
  const mounts = value.Mounts.filter((mount) => mount.Type !== 'tmpfs');
  if (
    mounts.length !== expectedMounts.length ||
    expectedMounts.some(
      (expected) =>
        !mounts.some(
          (mount) =>
            mount.Destination === expected.destination &&
            (mount.Name ?? mount.Source) === expected.source &&
            mount.RW === expected.writable,
        ),
    )
  ) {
    throw new Error('Runtime container has an unverified filesystem mount');
  }
}

export function parseDatabaseStatements(raw, state, privilegeCanaries, expectedQueries) {
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const statement = (entry) =>
    entry.statement ?? entry.message?.replace(/^(?:statement:|execute [^:]*:)\s*/, '');
  const exact = (entry, sql) => statement(entry)?.trim().toLowerCase() === sql.toLowerCase();
  const start = entries.findIndex(
    (entry) =>
      entry.dbname === state.database &&
      entry.user === state.databaseRole &&
      exact(entry, `select '${state.startCanary}'`),
  );
  const application = entries.findIndex(
    (entry) =>
      entry.dbname === state.database &&
      entry.user === state.databaseRole &&
      exact(entry, `select '${state.applicationCanary}'`),
  );
  const end = entries.findIndex(
    (entry) =>
      entry.dbname === state.database &&
      entry.user === 'postgres' &&
      exact(entry, `select '${state.endCanary}'`),
  );
  if (start < 0 || application <= start || end <= application)
    throw new Error('Independent PostgreSQL statement observation is incomplete');
  const beforeApplication = entries.slice(start, application);
  for (const probe of expectedQueries) {
    if (
      !privilegeCanaries?.some(
        (entry) => entry.name === probe.name && entry.sql === probe.sql && entry.code === '42501',
      ) ||
      !beforeApplication.some(
        (entry) =>
          entry.user === state.databaseRole &&
          entry.dbname === state.database &&
          entry.state_code === '42501' &&
          exact(entry, probe.sql),
      )
    ) {
      throw new Error(`Independent privilege denial is missing: ${probe.name}`);
    }
  }
  for (const [name, database, user] of [
    ['impersonate-postgres', state.database, 'postgres'],
    ['connect-template', state.templateDatabase, state.databaseRole],
    ['connect-other-database', 'postgres', state.databaseRole],
  ]) {
    if (
      !privilegeCanaries?.some(
        (entry) =>
          entry.name === name &&
          entry.database === database &&
          entry.user === user &&
          entry.code === '28000',
      ) ||
      !beforeApplication.some(
        (entry) => entry.user === user && entry.dbname === database && entry.state_code === '28000',
      )
    ) {
      throw new Error(`Independent peer-auth rejection is missing: ${name}`);
    }
  }
  if (
    !beforeApplication.some(
      (entry) =>
        entry.user === state.databaseRole &&
        entry.application_name === 'agi-public-proof-controller' &&
        exact(entry, `select 'proof_spoof_${state.runId}'`),
    )
  ) {
    throw new Error('Database actor attribution was not tested independently of application_name');
  }
  const operations = entries
    .slice(application + 1, end)
    .filter(
      (entry) =>
        entry.dbname === state.database &&
        (/^(?:statement:|execute [^:]*:)/.test(entry.message ?? '') ||
          typeof entry.statement === 'string'),
    );
  if (operations.some((entry) => ![state.databaseRole, 'postgres'].includes(entry.user)))
    throw new Error('Unattributed PostgreSQL statements cannot establish runtime proof');
  return operations
    .filter((entry) => entry.user === state.databaseRole)
    .map((entry) => ({
      user: entry.user,
      application: entry.application_name ?? null,
      sessionId: entry.session_id,
      line: entry.line_num,
      statement: statement(entry),
      detail: entry.detail ?? null,
      timestamp: entry.timestamp,
      errorCode: entry.state_code ?? null,
    }));
}

export function validateRuntimeProof(proof, expected) {
  if (
    proof?.version !== PROOF_VERSION ||
    proof.runId !== expected.runId ||
    proof.stateId !== expected.stateId ||
    proof.fixtureDigest !== expected.fixtureDigest ||
    proof.imageId !== expected.imageId ||
    proof.buildId !== expected.buildId ||
    proof.revision !== expected.revision ||
    proof.migrationDigest !== expected.migrationDigest ||
    proof.evidence?.filename !== `evidence/${expected.stateId}.json.gz` ||
    [
      'digest',
      'nodeCoverageDigest',
      'browserCoverageDigest',
      'browserHttpDigest',
      'eventsDigest',
      'postgresLogDigest',
    ].some((field) => !/^[a-f0-9]{64}$/.test(proof.evidence?.[field] ?? '')) ||
    !proof.teardownComplete ||
    !proof.isolationVerified ||
    !proof.observer?.startedBeforeEntry ||
    !proof.observer?.stoppedAfterRender ||
    !proof.observer?.networkCanaryDenied ||
    !proof.observer?.moduleCanaryObserved ||
    !proof.observer?.coverageCanaryObserved ||
    proof.observer?.unobservedExecution?.length !== 0 ||
    !Array.isArray(proof.databaseStatements) ||
    proof.databaseStatements.some((entry) => entry.errorCode && entry.errorCode !== '00000') ||
    !new RegExp(`^agi_public_case_${expected.runId}_[0-9]+$`).test(proof.databaseRole) ||
    proof.databaseStatements.some((entry) => entry.user !== proof.databaseRole) ||
    !proof.databaseCanariesVerified ||
    !proof.databaseAuthorityVerified ||
    !Array.isArray(proof.observer?.network) ||
    proof.observer.network.some((entry) => !entry.allowed) ||
    !proof.document ||
    !proof.render?.settled ||
    !proof.render?.stateMatched
  ) {
    throw new Error(`Incomplete cold runtime proof for ${expected.stateId}`);
  }
  if (expected.path) {
    const location = new URL(expected.path, PROOF_ORIGIN);
    if (
      proof.document.origin !== location.origin ||
      proof.document.path !== location.pathname ||
      proof.document.query !== location.search
    )
      throw new Error('Runtime proof belongs to a different route input');
  }
  if (expected.executionRequired) {
    const browser = expected.renderRuntime === 'browser';
    const execution = browser ? proof.render.clientExecution : proof.observer.renderExecution;
    if (
      !proof.observer.routeBundleHash ||
      !execution ||
      !(execution.count > 0) ||
      proof.observer.compiledSource?.sourceDigest !== expected.renderSource.sourceDigest ||
      (!browser &&
        (!proof.observer.routeBundleExecuted ||
          execution.sourceDigest !== expected.renderSource.sourceDigest)) ||
      (browser &&
        !proof.observer.clientChunks?.some(
          (chunk) => chunk.url === execution.url && chunk.digest === execution.scriptDigest,
        ))
    ) {
      throw new Error(`The production render was not observed executing for ${expected.stateId}`);
    }
  }
  if (expected.dataAccess === 'handler-guarded' && proof.databaseStatements.length !== 0) {
    throw new Error('Malformed-token execution issued application SQL');
  }
  if (
    expected.requiredTable &&
    !proof.databaseStatements.some((entry) =>
      observedFixtureRead(entry, expected.requiredTable, expected.requiredParameters),
    )
  ) {
    throw new Error(`Successful content did not read ${expected.requiredTable}`);
  }
  return proof;
}

export function observedFixtureRead(entry, table, parameters) {
  if (
    !/^[a-z_]+$/.test(table) ||
    !Array.isArray(parameters) ||
    !parameters.length ||
    (entry.errorCode && entry.errorCode !== '00000')
  )
    return false;
  const statement = entry.statement.replace(/'(?:[^']|'')*'/g, "''");
  if (/--|\/\*|\$[a-z_]*\$/i.test(statement) || !/^\s*select\b/i.test(statement)) return false;
  const identifiers = statement.replace(/"([a-z_]+)"/gi, '$1');
  if (!new RegExp(`\\bfrom\\s+(?:public\\s*\\.\\s*)?${table}\\b`, 'i').test(identifiers))
    return false;
  return parameters.every(
    (parameter) =>
      typeof parameter === 'string' &&
      new RegExp(
        `(?:^|[, ]+)\\$[0-9]+ = '${parameter.replaceAll("'", "''").replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'(?:,|$)`,
      ).test(entry.detail ?? ''),
  );
}

export function matchDocumentProof(proof, inputs, binding) {
  validateRuntimeProof(proof, binding);
  if (JSON.stringify(proof.document) !== JSON.stringify(inputs)) {
    throw new Error('Browser server inputs differ from the observed cold runtime state');
  }
  return (binding.executionRequired ? SOURCE_OBLIGATIONS : ['navigation-transport']).map(
    (obligation) => ({
      obligation,
      evidence: proof.stateId,
      runId: proof.runId,
      scope: binding.executionRequired
        ? 'Observed entry and selected render branch for this exact request and fixture snapshot; unexecuted branches remain unverified.'
        : 'Observed main-document transport for this exact request and fixture snapshot; no source execution claim.',
    }),
  );
}

export function validateRawReceipt(receipt, proof, expectedQueries) {
  const evidence = proof.evidence;
  if (
    !evidence ||
    evidence.nodeCoverageDigest !== digest(receipt.nodeCoverage) ||
    evidence.browserCoverageDigest !== digest(receipt.browserCoverage) ||
    evidence.browserHttpDigest !== digest(receipt.browserHttpRequests) ||
    evidence.eventsDigest !== digest(receipt.eventsJsonl) ||
    evidence.postgresLogDigest !== digest(receipt.postgresJsonl)
  )
    throw new Error('Raw execution receipt digest changed');
  const events = receipt.eventsJsonl
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const snapshots = events.filter((event) => event.kind === 'snapshot-after-render');
  if (
    events.some((event, index) => event.sequence !== index) ||
    snapshots.length !== 1 ||
    snapshots[0].coverageDigest !== evidence.nodeCoverageDigest ||
    events[0]?.kind !== 'observer-start' ||
    events.at(-1)?.kind !== 'observer-exit' ||
    events.at(-1)?.code !== 0
  )
    throw new Error('Raw observer lifecycle or snapshot binding is incomplete');
  const positiveRange = (script, witness, name = null) =>
    script?.functions.some(
      (fn) =>
        (name === null || fn.functionName === name) &&
        fn.ranges[0]?.count > 0 &&
        (!witness ||
          ['startOffset', 'endOffset', 'count'].every((key) => fn.ranges[0][key] === witness[key])),
    );
  if (
    !Array.isArray(receipt.nodeCoverage?.result) ||
    !Array.isArray(receipt.browserCoverage?.result) ||
    !receipt.nodeCoverage.result.some(
      (script) =>
        script.url.endsWith('/module-canary.mjs') && positiveRange(script, null, 'executeCanary'),
    )
  )
    throw new Error('Raw Node/browser V8 coverage is incomplete');
  const server = proof.observer.renderExecution;
  if (
    server &&
    !positiveRange(
      receipt.nodeCoverage.result.find((script) => script.url === server.scriptUrl),
      server,
      server.functionName,
    )
  )
    throw new Error('Server render witness does not match raw V8 invocation');
  const client = proof.render.clientExecution;
  if (
    client &&
    !positiveRange(
      receipt.browserCoverage.result.find((script) => {
        try {
          const url = new URL(script.url);
          return url.origin === PROOF_ORIGIN && url.pathname === client.url;
        } catch {
          return false;
        }
      }),
      client,
    )
  )
    throw new Error('Client render witness does not match raw V8 invocation');
  const statements = parseDatabaseStatements(
    receipt.postgresJsonl,
    proof.sourceState,
    proof.observer.privilegeCanaries,
    expectedQueries,
  );
  if (digest(statements) !== digest(proof.databaseStatements))
    throw new Error('Database statement summary differs from independent raw logs');
  return true;
}

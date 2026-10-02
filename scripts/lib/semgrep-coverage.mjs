import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { performance } from 'node:perf_hooks';
import { spawn, execFileSync } from 'node:child_process';

const MAX_REPORT_BYTES = 192 * 1024 * 1024;
const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const SCANNER_DEADLINE_MS = 120_000;
const COVERAGE_BUDGET_MS = 900_000;
const TAINT_LANGUAGES = ['js', 'ts', 'javascript', 'typescript'];
const DEFAULT_LABEL = '__SOURCE__';
const FORMULA_KEYS = ['pattern', 'patterns', 'pattern-either', 'pattern-regex'];
const SPEC_KEYS = {
  source: ['label', 'requires', 'by-side-effect', 'exact', 'control'],
  sink: ['requires', 'exact', 'at-exit'],
};
const CANARY = {
  languages: ['js', 'ts'],
  message: 'Structural coverage canary',
  severity: 'WARNING',
};
const CANARIES = [
  {
    ...CANARY,
    id: 'coverage-canary-0',
    patterns: [
      {
        'pattern-either': [
          { pattern: "this.window.document. ... .$HTML('...',$SINK)" },
          { pattern: "window.document. ... .$HTML('...',$SINK)" },
          { pattern: 'document.$HTML($SINK)' },
        ],
      },
      { 'metavariable-regex': { metavariable: '$HTML', regex: '(writeln|write)' } },
      { 'focus-metavariable': '$SINK' },
    ],
  },
  {
    ...CANARY,
    id: 'coverage-canary-1',
    patterns: [
      { pattern: "$PROP. ... .$HTML('...',$SINK)" },
      { 'metavariable-regex': { metavariable: '$HTML', regex: '(insertAdjacentHTML)' } },
      { 'focus-metavariable': '$SINK' },
    ],
  },
];
const CALIBRATION = [
  'coverage-canary-0:2',
  'coverage-canary-0:3',
  'coverage-canary-0:4',
  'coverage-canary-0:5',
  'coverage-canary-0:6',
  'coverage-canary-1:9',
];
export class CoverageError extends Error {}
const CONTROLS = `function positiveDocument(value) {
  document.write(value);
  document.writeln(value);
  this.window.document.write('p', value);
  window.document.writeln('p', value);
  document.writeText(value);
}
function positiveAdjacent(value) {
  panel.insertAdjacentHTML('beforeend', value);
}
function negativeReceivers(value) {
  navigator.clipboard.writeText(value);
  handler.write(value);
  panel.append(value);
}
`;

function requireValue(value, message) {
  if (!value) throw new CoverageError(message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonFile(file) {
  const stat = fs.lstatSync(file);
  requireValue(
    stat.isFile() && stat.size <= MAX_REPORT_BYTES,
    'Coverage input is not a bounded regular file.',
  );
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`)
  );
}

export function validateCoverageEnvelope(report) {
  requireValue(
    Array.isArray(report.skipped_rules),
    'Semgrep report skipped_rules must be an array.',
  );
  requireValue(
    report.skipped_rules.length === 0,
    'Semgrep report contains skipped rules. The scan is incomplete.',
  );
  requireValue(
    record(report.time) && Array.isArray(report.time.fixpoint_timeouts),
    'Semgrep report time.fixpoint_timeouts must be an explicit array.',
  );
}

function warningDiagnostic(warning, selected) {
  requireValue(
    record(warning) && warning.error_type === 'Fixpoint timeout',
    'Unrecognized internal analysis diagnostic.',
  );
  const location = warning.location;
  requireValue(
    record(location) && typeof location.path === 'string' && selected.has(location.path),
    'Internal diagnostic must name a selected source file.',
  );
  requireValue(
    record(location.start) && Number.isSafeInteger(location.start.line) && location.start.line > 0,
    'Internal diagnostic has an invalid source position.',
  );
  requireValue(
    typeof warning.message === 'string' && warning.message.length <= 4096,
    'Internal diagnostic has an invalid rule identity.',
  );
  const match = /\[rules: ([1-9][0-9]*), first: ([A-Za-z0-9_.:-]+)\]$/.exec(warning.message);
  requireValue(
    match && Number.isSafeInteger(Number(match[1])),
    'Internal diagnostic has an invalid affected rule count.',
  );
  return {
    path: location.path,
    line: location.start.line,
    rule: match[2],
    count: Number(match[1]),
  };
}

export function warningIdentity(warning, selected) {
  const { path, line, rule } = warningDiagnostic(warning, selected);
  return { path, line, rule };
}

function replayTaintRules(rules, diagnostic) {
  requireValue(
    ['.ts', '.tsx', '.mts', '.cts'].includes(path.extname(diagnostic.path)),
    'Aggregate diagnostic source language is unsupported.',
  );
  const languages = ['js', 'ts', 'javascript', 'typescript'];
  const applicable = [];
  for (const rule of rules.values()) {
    requireValue(
      Array.isArray(rule.languages) && rule.languages.length > 0,
      'Original rule languages are invalid.',
    );
    if (!rule.languages.some((value) => [...languages, 'generic', 'regex'].includes(value)))
      continue;
    requireValue(
      rule.mode === undefined || rule.mode === 'search' || rule.mode === 'taint',
      'Aggregate diagnostic rule mode is unsupported.',
    );
    if (rule.mode !== 'taint') {
      requireValue(
        rule['pattern-sources'] === undefined && rule['pattern-sinks'] === undefined,
        'Aggregate diagnostic taint mode is missing.',
      );
      continue;
    }
    requireValue(
      rule.languages.length > 0 && rule.languages.every((value) => languages.includes(value)),
      'Aggregate diagnostic taint language is unsupported.',
    );
    applicable.push(rule);
  }
  requireValue(
    applicable.some((rule) => rule.id === diagnostic.rule),
    'Aggregate diagnostic is not bound to the complete applicable taint rule set.',
  );
  return applicable;
}

function specFormula(spec, kind) {
  const keys = record(spec)
    ? Object.keys(spec).filter((key) => !SPEC_KEYS[kind].includes(key))
    : [];
  requireValue(
    keys.length === 1 &&
      FORMULA_KEYS.includes(keys[0]) &&
      (spec.label === undefined || typeof spec.label === 'string') &&
      (spec.requires === undefined ||
        typeof spec.requires === 'string' ||
        Array.isArray(spec.requires)),
    `Affected rule has unsupported ${kind} semantics.`,
  );
  return { [keys[0]]: spec[keys[0]] };
}

export function structuralRules(rule) {
  requireValue(
    record(rule) &&
      rule.mode === 'taint' &&
      Array.isArray(rule.languages) &&
      rule.languages.length > 0 &&
      rule.languages.every((value) => TAINT_LANGUAGES.includes(value)),
    'Affected rule is not a supported structural taint boundary.',
  );
  requireValue(
    (rule.options === undefined || record(rule.options)) &&
      (rule['pattern-propagators'] === undefined ||
        (Array.isArray(rule['pattern-propagators']) &&
          rule['pattern-propagators'].every(
            (propagator) =>
              record(propagator) &&
              (propagator.label === undefined || typeof propagator.label === 'string'),
          ))) &&
      [rule['pattern-sources'], rule['pattern-sinks']].every(
        (specs) => Array.isArray(specs) && specs.length > 0,
      ),
    'Affected rule has unsupported taint semantics.',
  );
  return ['source', 'sink'].flatMap((kind) =>
    rule[`pattern-${kind}s`].map((spec, index) => ({
      id: `coverage-${kind}-${index}`,
      languages: rule.languages,
      message: 'Structural taint coverage',
      severity: 'WARNING',
      ...(rule.options === undefined ? {} : { options: rule.options }),
      ...specFormula(spec, kind),
    })),
  );
}

function requirement(expression) {
  const tokens = expression.match(/[()]|[^\s()]+/g) ?? [];
  const labels = new Set();
  let position = 0;
  function operand() {
    const token = tokens[position++];
    if (token === 'not') {
      const negated = operand();
      return (present) => !negated(present);
    }
    if (token === '(') {
      const inner = disjunction();
      requireValue(tokens[position++] === ')', 'Taint label requirement is malformed.');
      return inner;
    }
    if (token === 'True' || token === 'False') return () => token === 'True';
    requireValue(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(token ?? '') && !['and', 'or'].includes(token),
      'Taint label requirement is malformed.',
    );
    labels.add(token);
    return (present) => present.has(token);
  }
  function series(keyword, next) {
    const terms = [next()];
    while (tokens[position] === keyword) {
      position += 1;
      terms.push(next());
    }
    return keyword === 'and'
      ? (present) => terms.every((term) => term(present))
      : (present) => terms.some((term) => term(present));
  }
  function conjunction() {
    return series('and', operand);
  }
  function disjunction() {
    return series('or', conjunction);
  }
  const evaluate = disjunction();
  requireValue(position === tokens.length, 'Taint label requirement is malformed.');
  return { evaluate, labels };
}

function reachable(requires, present) {
  const { evaluate, labels } = requirement(requires ?? DEFAULT_LABEL);
  const available = [...labels].filter((label) => present.has(label));
  requireValue(available.length <= 16, 'Taint label requirement is too large to qualify.');
  for (let mask = 0; mask < 2 ** available.length; mask += 1) {
    if (evaluate(new Set(available.filter((_, bit) => mask & (1 << bit))))) return true;
  }
  return false;
}

async function stopGroup(pid) {
  const target = process.platform === 'win32' ? pid : -pid;
  const alive = () => {
    try {
      process.kill(target, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      if (error.code === 'EPERM') return true;
      throw new CoverageError('Owned scanner cleanup could not be confirmed.');
    }
  };
  if (!alive()) return;
  try {
    process.kill(target, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw new CoverageError('Owned scanner cleanup failed.');
  }
  for (let attempt = 0; attempt < 10 && alive(); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 50));
  if (alive()) {
    process.kill(target, 'SIGKILL');
    for (let attempt = 0; attempt < 20 && alive(); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
  }
  requireValue(!alive(), 'Owned scanner process group remains active.');
}

export async function runCoverageScanner(
  argv,
  { cwd, env, directory, timeoutMs = SCANNER_DEADLINE_MS },
) {
  requireValue(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= SCANNER_DEADLINE_MS,
    'Coverage scanner deadline is invalid.',
  );
  const stderr = fs.openSync(path.join(directory, 'scanner.stderr.private'), 'a', 0o600);
  let child;
  try {
    child = spawn('semgrep', argv, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fs.closeSync(stderr);
    throw new CoverageError('Structural scanner could not start.');
  }
  const chunks = [];
  let failure;
  let outputBytes = 0;
  let abort = () => {};
  const timer = setTimeout(
    () => abort(new CoverageError('Structural scanner deadline exceeded.')),
    timeoutMs,
  );
  const interrupted = () => abort(new CoverageError('Structural scanner was interrupted.'));
  process.on('SIGTERM', interrupted);
  process.on('SIGINT', interrupted);
  const receive = (bytes, store) => {
    outputBytes += bytes.length;
    if (failure) return;
    if (outputBytes > MAX_STREAM_BYTES) {
      failure = new CoverageError('Structural scanner output bound exceeded.');
      abort(failure);
      return;
    }
    try {
      if (store) chunks.push(bytes);
      else fs.writeSync(stderr, bytes);
    } catch {
      failure = new CoverageError('Structural scanner output could not be captured.');
      abort(failure);
    }
  };
  child.stdout.on('data', (bytes) => receive(bytes, true));
  child.stderr.on('data', (bytes) => receive(bytes, false));
  try {
    const code = await new Promise((resolve, reject) => {
      abort = reject;
      child.once('error', () => reject(new CoverageError('Structural scanner could not start.')));
      child.once('close', resolve);
    });
    if (failure) throw failure;
    return { code, stdout: Buffer.concat(chunks).toString('utf8') };
  } finally {
    clearTimeout(timer);
    try {
      if (child.pid) await stopGroup(child.pid);
    } finally {
      process.off('SIGTERM', interrupted);
      process.off('SIGINT', interrupted);
      fs.closeSync(stderr);
    }
  }
}

export async function qualifyInternalCoverage({
  report,
  reportPath,
  bundlePath,
  contextPath,
  expectedVersion,
  cwd = process.cwd(),
  execute = runCoverageScanner,
}) {
  validateCoverageEnvelope(report);
  if (expectedVersion !== undefined)
    requireValue(
      report.version === expectedVersion,
      'Semgrep report version differs from the configured engine.',
    );
  if (
    report.time.fixpoint_timeouts.length === 0 &&
    bundlePath === undefined &&
    contextPath === undefined &&
    expectedVersion === undefined
  )
    return { nativeWarnings: 0, structurallyQualifiedPairs: 0, convergedReplayPairs: 0 };
  requireValue(
    typeof bundlePath === 'string' &&
      typeof contextPath === 'string' &&
      typeof expectedVersion === 'string',
    'Internal diagnostics require the original rule bundle, source context and configured engine.',
  );
  const bundle = jsonFile(bundlePath);
  const context = jsonFile(contextPath);
  const provenance = [reportPath, bundlePath, contextPath].map((file) => [
    file,
    hash(fs.readFileSync(file)),
  ]);
  requireValue(
    context.version === report.version &&
      context.sourceBeforeAfterEqual === true &&
      [0, 1].includes(context.actualScannerExit) &&
      context.reportSha256 === hash(fs.readFileSync(reportPath)) &&
      context.rulesSha256 === hash(fs.readFileSync(bundlePath)),
    'Original scan report and rule provenance do not match.',
  );
  requireValue(
    Array.isArray(context.sources) && Array.isArray(bundle.rules) && bundle.rules.length > 0,
    'Original scan source or rule provenance is invalid.',
  );
  const rules = new Map();
  for (const rule of bundle.rules) {
    requireValue(
      record(rule) &&
        typeof rule.id === 'string' &&
        /^[A-Za-z0-9_.:-]+$/.test(rule.id) &&
        !rules.has(rule.id),
      'Original rule bundle has an invalid or duplicate identity.',
    );
    rules.set(rule.id, rule);
  }
  const sources = new Map();
  for (const source of context.sources) {
    requireValue(
      record(source) &&
        typeof source.path === 'string' &&
        /^[a-f0-9]{64}$/.test(source.sha256) &&
        Number.isSafeInteger(source.bytes) &&
        source.bytes >= 0 &&
        typeof source.symlink === 'boolean' &&
        !sources.has(source.path),
      'Original source provenance is invalid.',
    );
    sources.set(source.path, source);
  }
  const root = fs.realpathSync(cwd);
  const selected = new Set(report.paths.scanned);
  const pairs = new Map();
  const directPairs = new Map();
  const aggregateFiles = new Map();
  for (const warning of report.time.fixpoint_timeouts) {
    const identity = warningDiagnostic(warning, selected);
    requireValue(
      rules.has(identity.rule) && sources.has(identity.path),
      'Internal diagnostic is not bound to original rules and sources.',
    );
    const file = path.resolve(root, identity.path);
    requireValue(
      inside(root, file) && fs.lstatSync(file).isFile() && inside(root, fs.realpathSync(file)),
      'Internal diagnostic source escapes the checkout.',
    );
    requireValue(
      hash(fs.readFileSync(file)) === sources.get(identity.path).sha256,
      'Internal diagnostic source changed after the original scan.',
    );
    requireValue(
      identity.line <= fs.readFileSync(file, 'utf8').split('\n').length,
      'Internal diagnostic position exceeds its source file.',
    );
    if (identity.count === 1) {
      const rule = rules.get(identity.rule);
      requireValue(
        report.engine_requested === 'OSS' &&
          rule.mode === 'taint' &&
          Array.isArray(rule.languages) &&
          rule.languages.length > 0 &&
          rule.languages.every((value) => ['js', 'ts', 'javascript', 'typescript'].includes(value)),
        'Singleton diagnostic rule or engine is unsupported.',
      );
      directPairs.set(`${identity.rule}\0${identity.path}`, { ...identity, file });
    } else {
      requireValue(
        report.engine_requested === 'OSS',
        'Aggregate diagnostic engine is unsupported.',
      );
      const applicable = replayTaintRules(rules, identity);
      aggregateFiles.set(identity.path, { ...identity, file, applicable });
    }
  }
  requireValue(
    /^[a-f0-9]{40}$/.test(context.head) && /^[a-f0-9]{40}$/.test(context.tree),
    'Original Git source identity is invalid.',
  );
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { PATH: process.env.PATH, GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const verifySources = () => {
    const actual = new Set(
      git(['ls-files', '-co', '--exclude-standard', '-z'])
        .split('\0')
        .filter((name) => name && path.resolve(root, name) !== path.resolve(reportPath)),
    );
    requireValue(
      actual.size === sources.size && [...actual].every((name) => sources.has(name)),
      'Original source inventory changed after the scan.',
    );
    for (const [name, source] of sources) {
      const file = path.resolve(root, name);
      requireValue(inside(root, file), 'Original source inventory escapes the checkout.');
      const stat = fs.lstatSync(file);
      requireValue(
        stat.isSymbolicLink() === source.symlink && (stat.isFile() || stat.isSymbolicLink()),
        'Original source type changed after the scan.',
      );
      if (!source.symlink)
        requireValue(
          inside(root, fs.realpathSync(file)),
          'Original source inventory escapes the checkout.',
        );
      const bytes = source.symlink ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
      requireValue(
        bytes.length === source.bytes && hash(bytes) === source.sha256,
        'Original source bytes changed after the scan.',
      );
    }
  };
  requireValue(
    git(['rev-parse', 'HEAD']).trim() === context.head &&
      git(['rev-parse', 'HEAD^{tree}']).trim() === context.tree,
    'Original source revision changed after the scan.',
  );
  verifySources();
  if (directPairs.size === 0 && aggregateFiles.size === 0)
    return { nativeWarnings: 0, structurallyQualifiedPairs: 0, convergedReplayPairs: 0 };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-coverage-'));
  const state = path.join(directory, 'state');
  fs.mkdirSync(state, { mode: 0o700 });
  const env = {
    PATH: process.env.PATH,
    HOME: state,
    XDG_CONFIG_HOME: state,
    XDG_CACHE_HOME: state,
    XDG_DATA_HOME: state,
    TMPDIR: state,
    SEMGREP_SETTINGS_FILE: path.join(state, 'settings.yml'),
    SEMGREP_LOG_FILE: path.join(state, 'semgrep.log'),
    SEMGREP_VERSION_CACHE_PATH: path.join(state, 'version-cache'),
    SEMGREP_SEND_METRICS: 'off',
    SEMGREP_ENABLE_VERSION_CHECK: '0',
    SEMGREP_OTEL_METRICS: '0',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  if (process.env.SSL_CERT_FILE) env.SSL_CERT_FILE = process.env.SSL_CERT_FILE;
  const deadline = performance.now() + COVERAGE_BUDGET_MS;
  const convergedPairs = new Set();
  const replayedPairs = new Set();
  const scanCoverage = async (argv) => {
    const timeoutMs = Math.min(SCANNER_DEADLINE_MS, Math.ceil(deadline - performance.now()));
    requireValue(timeoutMs > 0, 'Aggregate coverage deadline exceeded.');
    const result = await execute(argv, { cwd: root, env, directory, timeoutMs });
    requireValue(performance.now() < deadline, 'Aggregate coverage deadline exceeded.');
    return result;
  };
  try {
    const version = await scanCoverage(['--version']);
    requireValue(
      version.code === 0 && version.stdout.trim() === expectedVersion,
      'Structural scanner version differs from the original scan.',
    );
    const replayRule = async (target, rule) => {
      const key = `${rule.id}\0${target.path}`;
      if (replayedPairs.has(key)) return;
      try {
        const rulesPath = path.join(directory, 'taint-rule.json');
        const outputPath = path.join(directory, 'taint-report.json');
        fs.writeFileSync(rulesPath, JSON.stringify({ rules: [rule] }), { mode: 0o600 });
        fs.rmSync(outputPath, { force: true });
        const scan = await scanCoverage([
          'scan',
          '--config',
          rulesPath,
          '--no-rewrite-rule-ids',
          '--metrics=off',
          '--timeout=30',
          '--jobs=1',
          '--time',
          '--json',
          '--output',
          outputPath,
          target.file,
        ]);
        const replay = jsonFile(outputPath);
        validateCoverageEnvelope(replay);
        requireValue(
          scan.code === 0 &&
            replay.version === report.version &&
            replay.engine_requested === 'OSS' &&
            Array.isArray(replay.errors) &&
            replay.errors.length === 0 &&
            Array.isArray(replay.results) &&
            replay.results.length === 0 &&
            Array.isArray(replay.time.rules) &&
            replay.time.rules.length === 1 &&
            replay.time.rules[0] === rule.id,
          'Singleton taint analysis is incomplete or has a finding.',
        );
        requireValue(
          record(replay.paths) &&
            Array.isArray(replay.paths.scanned) &&
            replay.paths.scanned.length === 1 &&
            typeof replay.paths.scanned[0] === 'string' &&
            fs.realpathSync(path.resolve(root, replay.paths.scanned[0])) ===
              fs.realpathSync(target.file),
          'Singleton taint analysis did not select exactly the whole source.',
        );
        for (const warning of replay.time.fixpoint_timeouts) {
          const identity = warningIdentity(warning, new Set(replay.paths.scanned));
          requireValue(
            identity.rule === rule.id &&
              fs.realpathSync(path.resolve(root, identity.path)) === fs.realpathSync(target.file) &&
              identity.line <= fs.readFileSync(target.file, 'utf8').split('\n').length,
            'Singleton diagnostic is not bound to its exact rule and source.',
          );
          pairs.set(`${identity.rule}\0${target.path}`, {
            ...identity,
            path: target.path,
            file: target.file,
          });
        }
        if (replay.time.fixpoint_timeouts.length === 0) convergedPairs.add(key);
        replayedPairs.add(key);
      } catch (error) {
        if (error instanceof CoverageError)
          throw new CoverageError(
            `${error.message} Rule ${JSON.stringify(rule.id)}, source ${JSON.stringify(target.path)}.`,
          );
        throw error;
      }
    };
    for (const target of directPairs.values()) await replayRule(target, rules.get(target.rule));
    for (const target of aggregateFiles.values()) {
      for (const rule of target.applicable) await replayRule(target, rule);
    }
    for (const [identifier, rule] of rules) {
      const targets = [...pairs.values()].filter((pair) => pair.rule === identifier);
      if (targets.length === 0) continue;
      let subject = targets[0].path;
      try {
        const derived = [...structuralRules(rule), ...CANARIES];
        const identifiers = derived.map((item) => item.id);
        const controlsPath = path.join(directory, 'controls.ts');
        const rulesPath = path.join(directory, 'structural-rules.json');
        const outputPath = path.join(directory, 'structural-report.json');
        fs.writeFileSync(controlsPath, CONTROLS, { mode: 0o600 });
        fs.writeFileSync(rulesPath, JSON.stringify({ rules: derived }), { mode: 0o600 });
        fs.rmSync(outputPath, { force: true });
        const scan = await scanCoverage([
          'scan',
          '--config',
          rulesPath,
          '--no-rewrite-rule-ids',
          '--disable-nosem',
          '--metrics=off',
          '--timeout=30',
          '--jobs=1',
          '--time',
          '--json',
          '--output',
          outputPath,
          ...targets.map((pair) => pair.file),
          controlsPath,
        ]);
        const structural = jsonFile(outputPath);
        validateCoverageEnvelope(structural);
        requireValue(
          scan.code === 0 &&
            structural.version === report.version &&
            Array.isArray(structural.errors) &&
            structural.errors.length === 0 &&
            Array.isArray(structural.results) &&
            structural.time.fixpoint_timeouts.length === 0 &&
            Array.isArray(structural.time.rules) &&
            JSON.stringify([...structural.time.rules].sort()) ===
              JSON.stringify([...identifiers].sort()),
          'Structural taint analysis is incomplete.',
        );
        requireValue(
          record(structural.paths) && Array.isArray(structural.paths.scanned),
          'Structural selected targets are missing.',
        );
        const controls = fs.realpathSync(controlsPath);
        const matched = new Map(targets.map((pair) => [fs.realpathSync(pair.file), new Set()]));
        const actualPaths = structural.paths.scanned
          .map((file) => fs.realpathSync(path.resolve(root, file)))
          .sort();
        requireValue(
          JSON.stringify(actualPaths) === JSON.stringify([...matched.keys(), controls].sort()),
          'Structural analysis did not select every whole source and control.',
        );
        const calibration = [];
        for (const match of structural.results) {
          requireValue(
            record(match) &&
              typeof match.path === 'string' &&
              identifiers.includes(match.check_id) &&
              record(match.start) &&
              Number.isSafeInteger(match.start.line),
            'Structural finding is malformed.',
          );
          const file = fs.realpathSync(path.resolve(root, match.path));
          const canary = match.check_id.startsWith('coverage-canary-');
          requireValue(file === controls || matched.has(file), 'Structural finding is malformed.');
          if (file === controls && canary)
            calibration.push(`${match.check_id}:${match.start.line}`);
          if (file !== controls && !canary) matched.get(file).add(match.check_id);
        }
        requireValue(
          JSON.stringify(calibration.sort()) === JSON.stringify(CALIBRATION),
          'Structural sink calibration failed.',
        );
        for (const target of targets) {
          subject = target.path;
          const found = matched.get(fs.realpathSync(target.file));
          const indices = (kind) =>
            rule[`pattern-${kind}s`].flatMap((_, index) =>
              found.has(`coverage-${kind}-${index}`) ? [index] : [],
            );
          const sinks = indices('sink');
          if (sinks.length === 0) continue;
          requireValue(
            sinks.every((index) => !Array.isArray(rule['pattern-sinks'][index].requires)),
            'Internal warning has a potential sink and remains unresolved.',
          );
          const sources = indices('source');
          if (sources.length === 0) continue;
          const present = new Set([
            ...sources.map((index) => rule['pattern-sources'][index].label ?? DEFAULT_LABEL),
            ...(rule['pattern-propagators'] ?? []).flatMap((propagator) => propagator.label ?? []),
          ]);
          requireValue(
            sinks.every((index) => !reachable(rule['pattern-sinks'][index].requires, present)),
            'Internal warning has a potential sink and remains unresolved.',
          );
        }
      } catch (error) {
        if (error instanceof CoverageError)
          throw new CoverageError(
            `${error.message} Rule ${JSON.stringify(identifier)}, source ${JSON.stringify(subject)}.`,
          );
        throw error;
      }
    }
    verifySources();
    for (const [file, expected] of provenance)
      requireValue(
        hash(fs.readFileSync(file)) === expected,
        'Original coverage provenance changed during reanalysis.',
      );
    requireValue(
      git(['rev-parse', 'HEAD']).trim() === context.head &&
        git(['rev-parse', 'HEAD^{tree}']).trim() === context.tree,
      'Source revision changed during structural coverage analysis.',
    );
    return {
      nativeWarnings: report.time.fixpoint_timeouts.length,
      structurallyQualifiedPairs: pairs.size,
      convergedReplayPairs: convergedPairs.size,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

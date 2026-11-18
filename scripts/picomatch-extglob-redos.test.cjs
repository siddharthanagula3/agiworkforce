/* GHSA-fc5q-39xc-vjpf: exercise the installed patch and reconstruct upstream
 * offline for failing controls. No network or committed vendor source is used.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const root = process.cwd();
const PACKAGE = 'picomatch@4.0.7';
const patchRelativePath = `patches/${PACKAGE}.patch`;
const patchFile = path.join(root, patchRelativePath);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(
  manifest.pnpm?.patchedDependencies?.[PACKAGE],
  patchRelativePath,
  `The root manifest must register the ${PACKAGE} patch`,
);

// Resolve the exact lock-bound pnpm folder, including its patch hash. A stale
// unpatched folder or unrelated NODE_PATH/global package must never be tested.
const lockLines = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8').split(/\r?\n/);
const sectionStart = lockLines.indexOf('patchedDependencies:');
assert.ok(sectionStart >= 0, 'The lockfile must contain patchedDependencies');
const section = [];
for (let i = sectionStart + 1; i < lockLines.length; i++) {
  const line = lockLines[i];
  if (line && !line.startsWith(' ')) break;
  section.push(line);
}
const entryStart = section.indexOf(`  ${PACKAGE}:`);
assert.ok(entryStart >= 0, `The lockfile must bind ${PACKAGE} to the patch`);
const entry = [];
for (let i = entryStart + 1; i < section.length; i++) {
  if (section[i] && !section[i].startsWith('    ')) break;
  entry.push(section[i]);
}
const lockEntry = entry.join('\n');
const hash = /^    hash: ([a-z0-9]+)$/m.exec(lockEntry)?.[1];
assert.ok(hash, 'The picomatch lockfile patch hash must be present');
assert.equal(/^    path: (.+)$/m.exec(lockEntry)?.[1], patchRelativePath);
const pnpmDirectory = path.join(root, 'node_modules', '.pnpm');
const patchedPath = path.join(
  pnpmDirectory,
  `${PACKAGE}_patch_hash=${hash}`,
  'node_modules',
  'picomatch',
);
assert.ok(
  fs.realpathSync(patchedPath).startsWith(fs.realpathSync(pnpmDirectory) + path.sep),
  'The installed test target must remain inside this workspace pnpm directory',
);
const metadata = JSON.parse(fs.readFileSync(path.join(patchedPath, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'picomatch');
assert.equal(metadata.version, '4.0.7');
const patched = require(patchedPath);

const originalPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-picomatch-original-'));
after(() => fs.rmSync(originalPath, { recursive: true, force: true }));
let original;
try {
  for (const file of ['index.js', 'posix.js', 'package.json', 'LICENSE']) {
    fs.copyFileSync(path.join(patchedPath, file), path.join(originalPath, file));
  }
  fs.cpSync(path.join(patchedPath, 'lib'), path.join(originalPath, 'lib'), { recursive: true });
  const gitEnvironment = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) {
    delete gitEnvironment[name];
  }
  for (const args of [
    ['apply', '--reverse', '--check', patchFile],
    ['apply', '--reverse', patchFile],
  ]) {
    const result = spawnSync('git', args, {
      cwd: originalPath,
      env: gitEnvironment,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(
      result.status,
      0,
      'Cannot reconstruct the upstream picomatch control: ' +
        (result.stderr || result.stdout || String(result.error)),
    );
  }
  original = require(originalPath);
  assert.equal(require(path.join(originalPath, 'package.json')).version, '4.0.7');
} catch (error) {
  fs.rmSync(originalPath, { recursive: true, force: true });
  throw error;
}

const REPEATS = 40;
const WORST_INPUTS = [
  'a'.repeat(REPEATS) + 'b',
  'a'.repeat(REPEATS) + '/',
  'a'.repeat(REPEATS) + '!',
  'x' + 'a'.repeat(REPEATS) + 'b',
  '.js'.repeat(REPEATS) + 'x',
  '.js'.repeat(REPEATS) + '/',
];

// Each body nests an unbounded quantifier inside the repeat: a wildcard, a
// negation extglob (a lookahead followed by a wildcard) or a nested repeat.
const NESTED_UNBOUNDED = [
  '+(*)',
  '+(*a)',
  '*(*)',
  '*(*a)',
  '+(a*)',
  '+(*a*)',
  '+(*.js)',
  '+(**)',
  '+(*?)',
  '+([a-z]*)',
  '+(*a|b)',
  '+(a*|b)',
  '+(@(*))',
  '+(@(*a))',
  'x+(*a)y',
  '+(!(a))',
  '*(!(a))',
  '+(a!(b))',
  '+(a|!(b))',
  '+(a*(a))',
  '+(*(a)a)',
  '+(a+(a))',
];

const MATCH_EVERY_INPUT = `
  const picomatch = require(process.argv[1]);
  const patterns = JSON.parse(process.argv[2]);
  const inputs = JSON.parse(process.argv[3]);
  for (const pattern of patterns) {
    process.stdout.write(pattern + '\\n');
    const isMatch = picomatch(pattern);
    for (const input of inputs) isMatch(input);
  }
  process.stdout.write('done\\n');
`;

function matchInChild(modulePath, patterns, inputs, limitMs) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['-e', MATCH_EVERY_INPUT, modulePath, JSON.stringify(patterns), JSON.stringify(inputs)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), limitMs);
    child.once('close', (code) => {
      clearTimeout(timer);
      const lines = output.trim().split('\n');
      resolve({ finished: code === 0 && lines.at(-1) === 'done', last: lines.at(-1), output });
    });
  });
}

test('unpatched source backtracks without end on the patterns the advisory names', async () => {
  const controls = [
    ['+(*a)', 'a'.repeat(REPEATS) + 'b'],
    ['+(*)', '.js'.repeat(REPEATS) + '/'],
    ['+(!(a))', '.js'.repeat(REPEATS) + '/'],
    ['+(a*(a))', 'a'.repeat(REPEATS) + 'b'],
  ];
  const results = await Promise.all(
    controls.map(([pattern, input]) => matchInChild(originalPath, [pattern], [input], 2000)),
  );
  results.forEach((result, index) => {
    assert.equal(result.finished, false, `${controls[index][0]} finished: ${result.output}`);
    assert.equal(result.last, controls[index][0]);
  });
});

test('patched source answers every nested unbounded repeat on its worst inputs', async () => {
  const result = await matchInChild(patchedPath, NESTED_UNBOUNDED, WORST_INPUTS, 20000);
  assert.equal(result.finished, true, `stopped at ${result.last}: ${result.output}`);
});

test('a repeat with a nested unbounded quantifier is matched as literal text', () => {
  for (const pattern of NESTED_UNBOUNDED) {
    const isMatch = patched(pattern);
    assert.equal(isMatch(pattern), true, `${pattern} must match itself`);
    for (const input of ['a', 'aa', 'ab', 'x.js', 'xaay']) {
      assert.equal(isMatch(input), false, `${pattern} must not match ${input}`);
    }
  }
});

test('the patch leaves every other glob compiling to the upstream expression', () => {
  const corpus = [
    '*',
    '**',
    '**/*.js',
    '*.{js,ts}',
    'src/**/*.test.ts',
    'apps/*/src/**/*.{ts,tsx}',
    '**/node_modules/**',
    '*.d.ts',
    '.env*',
    '[!a]*',
    '\\*',
    '!(node_modules)',
    '!(*.d).ts',
    '**/!(*.min).js',
    '!(*a)',
    '@(a|b)',
    '@(*.js|*.ts)',
    '?(a)',
    '?(*.js)',
    '+(a)',
    '*(a)',
    '+(a|b)',
    '*(a|b)',
    '+(js|ts)',
    '*.+(js|jsx)',
    '+([0-9])',
    '+(\\*)',
    '+([*])',
    'a/+(b|c)/d',
    'foo/*(bar|baz).js',
    'x+(ab)y',
    '**/+(index|main).@(js|ts)',
    '!(+(a))',
    '+(a|b)*',
    '*+(a)',
    '+(*(a))',
    '+(*(a)|*(b))',
    '+(a|aa)',
    '+(+(a))',
  ];
  const optionSets = [{}, { dot: true }, { nocase: true }, { bash: true }, { capture: true }];
  for (const pattern of corpus) {
    for (const options of optionSets) {
      assert.equal(
        patched.makeRe(pattern, options).source,
        original.makeRe(pattern, options).source,
        `${pattern} ${JSON.stringify(options)}`,
      );
    }
  }
});

test('the options that turn the upstream analysis off or loosen it still do', () => {
  for (const pattern of ['+(*a)', '+(!(a))', '+(a*(a))']) {
    assert.equal(
      patched.makeRe(pattern, { maxExtglobRecursion: false }).source,
      original.makeRe(pattern, { maxExtglobRecursion: false }).source,
      pattern,
    );
  }
  assert.equal(
    patched.makeRe('+(a*(b))', { maxExtglobRecursion: 1 }).source,
    original.makeRe('+(a*(b))', { maxExtglobRecursion: 1 }).source,
  );
  assert.notEqual(
    patched.makeRe('+(a*(b))').source,
    original.makeRe('+(a*(b))').source,
    'a nested repeat is refused at the default depth of zero',
  );
  assert.equal(
    patched.makeRe('+(*a)', { maxExtglobRecursion: 1 }).source,
    patched.makeRe('+(*a)').source,
    'a wildcard inside a repeat is refused at any depth',
  );
});

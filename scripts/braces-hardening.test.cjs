/* GHSA-vfj7-8cjw-p6xm: exercise the installed patch and reconstruct upstream
 * offline for failing controls. No network or committed vendor source is used.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const root = process.cwd();
const patchRelativePath = 'patches/braces@3.0.3.patch';
const patchFile = path.join(root, patchRelativePath);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(
  manifest.pnpm?.patchedDependencies?.['braces@3.0.3'],
  patchRelativePath,
  'The root manifest must register the braces@3.0.3 patch',
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
const entryStart = section.indexOf('  braces@3.0.3:');
assert.ok(entryStart >= 0, 'The lockfile must bind braces@3.0.3 to the patch');
const entry = [];
for (let i = entryStart + 1; i < section.length; i++) {
  if (section[i] && !section[i].startsWith('    ')) break;
  entry.push(section[i]);
}
const lockEntry = entry.join('\n');
const hash = /^    hash: ([a-z0-9]+)$/m.exec(lockEntry)?.[1];
assert.ok(hash, 'The braces lockfile patch hash must be present');
assert.equal(/^    path: (.+)$/m.exec(lockEntry)?.[1], patchRelativePath);
const pnpmDirectory = path.join(root, 'node_modules', '.pnpm');
const patchedPath = path.join(
  pnpmDirectory,
  `braces@3.0.3_patch_hash=${hash}`,
  'node_modules',
  'braces',
);
assert.ok(
  fs.realpathSync(patchedPath).startsWith(fs.realpathSync(pnpmDirectory) + path.sep),
  'The installed test target must remain inside this workspace pnpm directory',
);
const metadata = JSON.parse(fs.readFileSync(path.join(patchedPath, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'braces');
assert.equal(metadata.version, '3.0.3');
const patched = require(patchedPath);
const limit = 128;
const errorMessage = `AST depth exceeds maximum of ${limit}`;

const originalPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-braces-original-'));
after(() => fs.rmSync(originalPath, { recursive: true, force: true }));
let original;
try {
  for (const file of ['index.js', 'package.json', 'LICENSE']) {
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
      'Cannot reconstruct the upstream braces control: ' +
        (result.stderr || result.stdout || String(result.error)),
    );
  }
  // The upstream control uses the exact same installed runtime dependency.
  // Resolve from braces itself instead of relying on root dependency hoisting.
  const fillRangeManifest = require.resolve('fill-range/package.json', { paths: [patchedPath] });
  fs.mkdirSync(path.join(originalPath, 'node_modules'));
  fs.symlinkSync(
    path.dirname(fillRangeManifest),
    path.join(originalPath, 'node_modules', 'fill-range'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  original = require(originalPath);
  assert.equal(require(path.join(originalPath, 'package.json')).version, '3.0.3');
} catch (error) {
  fs.rmSync(originalPath, { recursive: true, force: true });
  throw error;
}

function rejectsDepth(fn) {
  assert.throws(fn, (error) => error instanceof SyntaxError && error.message === errorMessage);
}

function nested(open, close, depth, body = 'a,b', missing = 0) {
  return open.repeat(depth) + body + close.repeat(depth - missing);
}

function astWithDepth(depth) {
  const root = { type: 'root', nodes: [] };
  let current = root;
  for (let i = 0; i < depth; i++) {
    const child = { type: 'paren', nodes: [], parent: current };
    current.nodes.push(child);
    current = child;
  }
  current.nodes.push({ type: 'text', value: 'x', parent: current });
  return root;
}

function observableAst(node) {
  const output = {};
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'prev' || key === 'nodes') continue;
    output[key] = node[key];
  }
  if (node.nodes) output.nodes = node.nodes.map(observableAst);
  return output;
}

test('unpatched source exhausts the stack on below-MAX_LENGTH brace and paren patterns', () => {
  const probe = `
    const assert = require('node:assert/strict');
    const braces = require(process.argv[1]);
    for (const [open, close] of [['{', '}'], ['(', ')']]) {
      for (const missing of [0, 1]) {
        const input = open.repeat(4000) + 'a,b' + close.repeat(4000 - missing);
        assert.ok(input.length < 10000);
        assert.equal(braces.parse(input).type, 'root');
        for (const method of ['compile', 'expand', 'stringify']) {
          assert.throws(() => braces[method](input), error =>
            error instanceof RangeError && /call stack/.test(error.message), method + ' ' + open + close + ' missing=' + missing);
        }
      }
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--jitless', '--stack_size=256', '-e', probe, originalPath],
    {
      env: { ...process.env, NODE_PATH: '' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});

test('all public pattern APIs reject deeply nested matched and malformed inputs with SyntaxError', () => {
  for (const [open, close] of [
    ['{', '}'],
    ['(', ')'],
  ]) {
    for (const missing of [0, 1, 4000]) {
      const input = nested(open, close, 4000, 'a,b', missing);
      assert.ok(input.length < 10000);
      for (const method of ['parse', 'compile', 'expand', 'stringify', 'create']) {
        rejectsDepth(() => patched[method](input));
      }
      rejectsDepth(() => patched(input));
      rejectsDepth(() => patched(input, { expand: true }));
    }
  }
  const mixed = '{('.repeat(1000) + 'x' + ')}'.repeat(1000);
  rejectsDepth(() => patched.parse(mixed));
  rejectsDepth(() => patched.compile(mixed));
});

test('options cannot raise or disable the depth bound', () => {
  const input = nested('{', '}', limit);
  for (const options of [
    { maxDepth: Infinity },
    { depthLimit: false },
    { maxLength: Infinity, maxDepth: 1000000, rangeLimit: false },
    { escapeInvalid: true, keepEscaping: true, keepQuotes: true },
  ]) {
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      rejectsDepth(() => patched[method](input, options));
    }
  }
});

test('the parser reserves leaf depth and accepts ordinary behavior at the supported boundary', () => {
  for (const [open, close] of [
    ['{', '}'],
    ['(', ')'],
  ]) {
    for (const missing of [0, 1, limit - 1]) {
      const input = nested(open, close, limit - 1, 'x', missing);
      assert.deepEqual(observableAst(patched.parse(input)), observableAst(original.parse(input)));
      for (const method of ['compile', 'expand', 'stringify']) {
        assert.deepEqual(patched[method](input), original[method](input));
      }
    }
    rejectsDepth(() => patched.parse(nested(open, close, limit)));
  }
});

test('direct public AST APIs are bounded independently of the parser', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    rejectsDepth(() => patched[method](astWithDepth(4000)));
    assert.deepEqual(
      patched[method](astWithDepth(limit - 1)),
      original[method](astWithDepth(limit - 1)),
    );
    rejectsDepth(() => patched[method](astWithDepth(limit)));
  }
});

test('unpatched direct AST walkers exhaust the stack', () => {
  const probe = `
    const assert = require('node:assert/strict');
    const braces = require(process.argv[1]);
    const make = ${astWithDepth.toString()};
    for (const method of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](make(10000)), error =>
        error instanceof RangeError && /call stack/.test(error.message), method);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--jitless', '--stack_size=256', '-e', probe, originalPath],
    {
      env: { ...process.env, NODE_PATH: '' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});

test('patched public APIs stay controlled on a restricted stack', () => {
  const probe = `
    const assert = require('node:assert/strict');
    const braces = require(process.argv[1]);
    const make = ${astWithDepth.toString()};
    const isDepthError = error => error instanceof SyntaxError && error.message === ${JSON.stringify(errorMessage)};
    for (const [open, close] of [['{', '}'], ['(', ')']]) {
      for (const missing of [0, 1, 4000]) {
        const input = open.repeat(4000) + 'a,b' + close.repeat(4000 - missing);
        for (const method of ['parse', 'compile', 'expand', 'stringify']) {
          assert.throws(() => braces[method](input), isDepthError, method);
        }
      }
      const supported = open.repeat(127) + 'x' + close.repeat(127);
      for (const method of ['compile', 'expand', 'stringify']) {
        braces[method](supported);
        assert.throws(() => braces[method](make(4000)), isDepthError, method);
      }
    }
    for (const kind of ['invalid', 'dollar', 'ranges']) {
      const ast = make(4000);
      if (kind === 'ranges') {
        ast.nodes[0].type = 'brace';
        ast.nodes[0].ranges = 1;
      } else {
        ast.nodes[0][kind] = true;
      }
      assert.throws(() => braces.expand(ast), isDepthError, kind);
    }
  `;
  const result = spawnSync(process.execPath, ['--stack_size=512', '-e', probe, patchedPath], {
    env: { ...process.env, NODE_PATH: '' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});

test('recursive AST cycles and expand parent cycles terminate with the controlled depth error', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    const root = { type: 'root', nodes: [] };
    root.nodes.push(root);
    rejectsDepth(() => patched[method](root));
  }
  const paren = { type: 'paren', nodes: [] };
  paren.parent = paren;
  rejectsDepth(() => patched.expand(paren));
});

test('expand cannot bypass the recursive guard through invalid, dollar, or failed-range stringify', () => {
  for (const kind of ['invalid', 'dollar', 'ranges']) {
    const root = astWithDepth(4000);
    const child = root.nodes[0];
    if (kind === 'ranges') {
      child.type = 'brace';
      child.ranges = 1;
    } else {
      child[kind] = true;
    }
    rejectsDepth(() => patched.expand(root));
  }
});

test('recursive array flattening has the same hard depth guard', () => {
  const utils = require(path.join(patchedPath, 'lib/utils'));
  let value = ['x'];
  for (let i = 0; i < 4000; i++) value = [value];
  rejectsDepth(() => utils.flatten(value));
  assert.deepEqual(utils.flatten(['a', ['b', ['c']]], undefined), ['a', 'b', 'c']);
});

test('literal escaped, quoted, and bracketed braces do not consume AST nesting depth', () => {
  const literals = [
    '\\{'.repeat(1000) + '\\}'.repeat(1000),
    '"' + nested('{', '}', 1000, 'x') + '"',
    "'" + nested('(', ')', 1000, 'x') + "'",
    '`' + nested('{', '}', 1000, 'x') + '`',
    '[' + nested('{', '}', 1000, 'x') + ']',
    '[' + nested('(', ')', 1000, 'x') + ']',
  ];
  for (const input of literals) {
    for (const options of [{}, { keepQuotes: true, keepEscaping: true }]) {
      for (const method of ['compile', 'expand', 'stringify']) {
        assert.deepEqual(patched[method](input, options), original[method](input, options));
      }
    }
  }
});

test('normal globs, ranges, parentheses, options, and AST behavior match the original source', () => {
  const patterns = [
    '',
    'x',
    'plain/path/**',
    'foo/{a,b}/bar',
    '{a,b,c}',
    '{a,{b,c},d}',
    '{1..5}',
    '{01..05..2}',
    '{a..e..2}',
    '{z..a}',
    '{5..1}',
    '{a,b}{1..3}',
    '{a,,b}',
    '{{a,b},{c,d}}',
    '{1..3,a}',
    '{1...3}',
    '{a}',
    '{}',
    '{',
    '}',
    '{a,b',
    '(a|b)',
    '((a|b))/{c,d}',
    '{(a|b),c}',
    'foo\\{a,b\\}',
    '"{a,b}"/{c,d}',
    "'{a,b}'",
    '`{a,b}`',
    '[{a,b}]',
    '[a-z]/{one,two}',
    '${a,b}',
    'a/{x,y}/**/*.{js,ts}',
  ];
  const optionsList = [
    {},
    { escapeInvalid: true },
    { keepEscaping: true },
    { keepQuotes: true },
    { nodupes: true, noempty: true },
    { rangeLimit: 100 },
  ];
  for (const input of patterns) {
    for (const options of optionsList) {
      assert.deepEqual(
        observableAst(patched.parse(input, options)),
        observableAst(original.parse(input, options)),
      );
      for (const method of ['compile', 'expand', 'stringify', 'create']) {
        assert.deepEqual(
          patched[method](input, options),
          original[method](input, options),
          `${method}: ${input}`,
        );
      }
      assert.deepEqual(patched(input, options), original(input, options));
      assert.deepEqual(
        patched(input, { ...options, expand: true }),
        original(input, { ...options, expand: true }),
      );
      for (const method of ['compile', 'expand', 'stringify']) {
        assert.deepEqual(
          patched[method](patched.parse(input, options), options),
          original[method](original.parse(input, options), options),
        );
      }
    }
  }
  assert.deepEqual(patched(['{a,b}', '{b,c}'], { expand: true, nodupes: true }), ['a', 'b', 'c']);
});

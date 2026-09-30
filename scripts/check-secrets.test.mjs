import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { initSandboxRepository, sandboxGit } from './lib/sandbox-git.mjs';

const SCANNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-secrets.mjs');

const shape = (...parts) => parts.join('');

const STRIPE = shape('rk', '_live_', '51H8xK2eZvKYlo2CqPmXyZ9aB');
const ANTHROPIC = shape('sk', '-ant-', 'api03-R2vQx7LmNp4TzWkYbHgJdF6sCa9eXuP3');
const OPENAI = shape('sk', '-proj-', 'RealLiveKeyMaterialXyzQwerty99');
const GROQ = shape('gsk', '_', 'T7mQpZ4xLvBn2WsKdRfHjCyU8aEgN3tVbXqM6zPwYkJi5oDl');
const XAI = shape('xai', '-', 'Qz7LmNp4TzWkYbHgJdF6sCa9eXuP3vRtBnMkLqWsZxCvBnMk');
const SLACK = shape('xox', 'b-', '2154781203941-2154781203942-QzLmNpTzWkYbHgJdF6sCa9eX');
const GITHUB_PAT = shape(
  'github',
  '_pat_',
  '11ABQZ7LMNP4TZ_WkYbHgJdF6sCa9eXuP3vRtBnMkLqWsZxCvBnMkQzLmNpTzWk',
);
const GITHUB = shape('gh', 'p_', 'QzLmNpTzWkYbHgJdF6sCa9eXuP3vRtBnMkLq');
const AWS_DOC = shape('AK', 'IA', 'IOSFODNN7EXAMPLE');
const AWS_LIVE = shape('AK', 'IA', 'V7QW3RTYUIOPLKJH');
const GOOGLE_LIVE = shape('AI', 'za', 'SyB1nQ7xKpR4mZ2tWvC8jL5dEfGhJkMnPqR');
const SUPABASE_LIVE = shape('sbp', '_', '9f3a7c2e1b5d8046af29c73e5b1d0847e6a2f9c4');
const PEM = shape('-----BEGIN RSA ', 'PRIVATE KEY-----');
const ANTHROPIC_MARKED_PREFIX = shape(
  'sk',
  '-ant-',
  'EXAMPLE-api03-R2vQx7LmNp4TzWkYbHgJdF6sCa9eXuP3vRtBnMkLqWsZxCvBnMkQzLmNpTzWkYbHgJd',
);
const OPENAI_MARKED_PREFIX = shape(
  'sk',
  '-proj-',
  'FAKE-R2vQx7LmNp4TzWkYbHgJdF6sCa9eXuP3vRtBnMkLqWsZxCvBnMk',
);
const ANTHROPIC_SEPARATED = shape(
  'sk',
  '-ant-',
  'api03-R2vQx7LmNp4Tz_WkYbHgJdF6s-Ca9eXuP3vRtBnMk_LqWsZxCvBnMkQz-LmNpTzWkYbHgJd_F6sCa9eXuP3AA',
);
const GITHUB_SPLIT = shape('gh', 'p_', 'QzLmNpTzWkYbHgJdF6', 'EXAMPLE', 'sCa9eXuP3vRtBnMkLq');
const url = (password, host) => shape('postgres', '://', 'admin', ':', password, '@', host);

function scan(files, allowlist) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));
  try {
    initSandboxRepository(dir, { stdio: 'ignore' });
    const written = { ...files };
    if (allowlist) written['scripts/secret-scan-allowlist.json'] = JSON.stringify(allowlist);
    for (const [rel, body] of Object.entries(written)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    const run = spawnSync(process.execPath, [SCANNER], { cwd: dir, encoding: 'utf8' });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const reported = (body, format) => {
  const result = scan({ 'src/config.ts': body });
  assert.equal(result.status, 1, `expected a finding, got:\n${result.output}`);
  assert.match(result.output, new RegExp(format));
};

const clean = (body) => {
  const result = scan({ 'src/config.ts': body });
  assert.equal(result.status, 0, `expected no finding, got:\n${result.output}`);
};

test('a marker appended to live key material does not exempt it', async (t) => {
  await t.test('Stripe', () => reported(`const k = '${STRIPE}_SAMPLE';`, 'Stripe live key'));
  await t.test('Anthropic', () =>
    reported(`const k = '${ANTHROPIC}-sample';`, 'Anthropic API key'),
  );
  await t.test('OpenAI', () => reported(`const k = '${OPENAI}-example';`, 'OpenAI project key'));
  await t.test('Groq', () => reported(`const k = '${GROQ}sample';`, 'Groq API key'));
  await t.test('xAI', () => reported(`const k = '${XAI}example';`, 'xAI API key'));
  await t.test('Slack', () => reported(`const k = '${SLACK}-example';`, 'Slack token'));
  await t.test('GitHub PAT', () =>
    reported(`const k = '${GITHUB_PAT}_EXAMPLE';`, 'GitHub fine-grained PAT'),
  );
  await t.test('GitHub token', () => reported(`const k = '${GITHUB}Example';`, 'GitHub token'));
});

test('filler appended to a key of a format whose floor is its exact length is reported', async (t) => {
  await t.test('AWS', () => reported(`const k = '${AWS_LIVE}IJKLM';`, 'AWS access key id'));
  await t.test('GitHub', () => reported(`const k = '${GITHUB}rstuv';`, 'GitHub token'));
  await t.test('GitHub, case folded', () =>
    reported(`const k = '${GITHUB}RSTUV';`, 'GitHub token'),
  );
  await t.test('Google', () => reported(`const k = '${GOOGLE_LIVE}STUVW';`, 'Google API key'));
  await t.test('Supabase', () =>
    reported(`const k = '${SUPABASE_LIVE}56789';`, 'Supabase personal access token'),
  );
});

test('key material the filler is truncated back off is reported', () => {
  reported(`const AWS_ACCESS_KEY_ID = '${AWS_LIVE}IJKLM'.slice(0, 20);`, 'AWS access key id');
});

test('filler prepended to or spliced into key material does not exempt it', () => {
  reported(`const k = '${shape('AK', 'IA', 'QRSTU')}V7QW3RTYUIOPLKJH';`, 'AWS access key id');
  reported(`const k = '${shape('AK', 'IA', 'V7QW3R')}STUVWTYUIOPLKJH';`, 'AWS access key id');
});

test('filler followed by a marker does not exempt the key material before it', () => {
  reported(`const k = '${AWS_LIVE}IJKLMEXAMPLE';`, 'AWS access key id');
});

test('a marker written between the vendor prefix and the key does not hide the key', () => {
  reported(`const k = '${shape('AK', 'IA', 'sample')}V7QW3RTYUIOPLKJH';`, 'AWS access key id');
  reported(
    `const k = '${shape('sbp', '_', 'EXAMPLE')}9f3a7c2e1b5d8046af29c73e5b1d0847e6a2f9c4';`,
    'Supabase personal access token',
  );
});

test('a marker in the vendor prefix position does not suppress the detector', () => {
  reported(`const k = '${ANTHROPIC_MARKED_PREFIX}';`, 'Anthropic API key');
  reported(`const k = '${OPENAI_MARKED_PREFIX}';`, 'OpenAI project key');
});

test('a marker written between two halves of intact key material does not exempt it', () => {
  reported(`const k = '${GITHUB_SPLIT}';`, 'GitHub token');
});

test('key material broken up by its own separators is still measured whole', () => {
  reported(`const k = '${ANTHROPIC_SEPARATED}';`, 'Anthropic API key');
  reported(`const k = '${ANTHROPIC_SEPARATED}SAMPLE';`, 'Anthropic API key');
});

test('a marker prepended to live key material does not exempt it', () => {
  reported(`const k = '${shape('rk', '_live_', 'SAMPLE')}51H8xK2eZvKYlo2CqPmXyZ9aB';`, 'Stripe');
});

test('a marker in a trailing comment does not exempt the credential', () => {
  reported(`const STRIPE_KEY = '${STRIPE}'; // sample key for now`, 'Stripe live key');
});

test('an unrelated placeholder-shaped run on the line does not exempt the credential', () => {
  reported(`const k = '${STRIPE}';\nconst retryAfterMs = 123456;`.replace('\n', ' '), 'Stripe');
});

test('a marker cannot exempt a format the scanner matches without capturing material', () => {
  reported(`const pem = '${PEM}'; // dummy fixture`, 'PEM private key');
});

test('a reserved suffix glued to a routable host does not exempt a connection string', () => {
  reported(`const u = '${url('S3cr3tPr0dPass', 'prod-db.internal.test')}';`, 'Postgres/Redis');
  reported(`const u = '${url('S3cr3tPr0dPass', 'prod-db.internal.example.com')}';`, 'Postgres');
});

test('a documentation host appended after a real one does not exempt a connection string', () => {
  reported(`const u = '${url('S3cr3t', 'postgres@db.example.com')}';`, 'Postgres/Redis');
  reported(`const u = '${url('S3cr3t', 'db@db.example.com')}';`, 'Postgres/Redis');
});

test('a live credential with no marker at all is still reported', () => {
  reported(`const k = '${STRIPE}';`, 'Stripe live key');
  reported(`const u = '${url('S3cr3t', 'prod-db.internal:5432/app')}';`, 'Postgres/Redis');
});

test('a marker that displaces the key material still exempts the fixture', () => {
  clean(`const k = '${AWS_DOC}';`);
  clean(`const k = '${shape('sk', '_live_', 'EXAMPLEEXAMPLE0001')}';`);
  clean(`const k = '${shape('xox', 'b-', '1234567890-abcdefghijklmnop')}';`);
  clean(`const k = '${shape('gh', 'p_', '1234567890abcdefghijklmnopqrstuvwxyz')}';`);
});

test('a run of filler inside the key material still exempts the fixture', () => {
  clean(`const k = '${shape('sk', '-ant-', 'EXAMPLE-AAAAAAAAAAAAAAAAAAAA')}';`);
  clean(`const k = '${shape('sk', '-ant-', 'EXAMPLENOTAREALANTHROPICKEY00000')}';`);
  clean(`const k = '${shape('xox', 'b-', '1234567890-0987654321-AbCdEfGhIjKlMnOpQrSt')}';`);
  clean(`const k = '${shape('sk', '_live_', '0000000000000000_never_issued_secret_value')}';`);
});

test('a counting run that wraps past 9 is filler over its whole length', () => {
  clean(`const k = '${shape('AI', 'za', 'SyA1234567890abcdefghijklmnopqrstuv')}';`);
  clean(`const k = '${shape('gh', 'p_', 'AAA123456789012345678901234567890123')}';`);
});

test('material a marker only partly covers is still reported', () => {
  reported(
    `const k = '${shape('sk', '_live_', 'EXAMPLE_ThIsIsAReAlLoOkInGsEcReT0123456789abcdef')}';`,
    'Stripe',
  );
});

test('markers threaded through the whole key do not exempt it', () => {
  const threaded = 'api03-R2vQx7LmNp4TzWkYbHgJdF6sCa9eXuP3'.replace(/(.{4})/g, '$1EXAMPLE');
  reported(`const k = '${shape('sk', '-ant-', threaded)}';`, 'Anthropic API key');
});

test('a password no policy would reject is reported even behind a documentation host', () => {
  reported(`const u = '${url('Pr0dP4ssw0rdReal', 'db.example.com:5432/app')}';`, 'Postgres/Redis');
});

test('a documentation host still exempts a connection string', () => {
  clean(`const u = '${url('hunter2', 'db.example.com:5432/app')}';`);
  clean(`const u = '${url('hunter2', 'db.example.invalid:5432/app')}';`);
  clean(`const u = '${url('hunter2', '192.0.2.7:5432/app')}';`);
});

test('a password that is nothing but a placeholder exempts a connection string', () => {
  clean(`const u = '${url('PLACEHOLDER', 'prod-db.internal:5432/app')}';`);
  clean(`const u = '${url('xxxxxxxxxxxx', 'prod-db.internal:5432/app')}';`);
});

test('a password of nothing but punctuation does not exempt a connection string', () => {
  reported(`const u = '${url('!#$%^&*(_+~[]|;<>,.?=', 'prod-db.acme.io/db')}';`, 'Postgres/Redis');
});

test('filler that abuts realistic material in a fixture still exempts it', () => {
  clean(`const k = '${shape('sk', '_live_', '0123456789abcdef_supersecretvalue')}';`);
  clean(
    `const k = '${shape('git', 'hub_pat_', '11ABCDEFG0abcdefghijklmnopqrstuvwxyz0123456789')}';`,
  );
  clean(`const u = '${url('hunter2', 'db.example.com:5432/app')}';`);
});

test('a reviewed allowlist entry exempts a finding', () => {
  const result = scan(
    { 'src/config.ts': `const k = '${STRIPE}';` },
    {
      entries: [
        {
          path: 'src/config.ts',
          format: 'Stripe live key',
          reason: 'Reviewed fixture kept realistic on purpose for this test.',
        },
      ],
    },
  );
  assert.equal(result.status, 0, result.output);
});

test('an allowlist entry that matches nothing fails the scan', () => {
  const result = scan(
    { 'src/config.ts': 'const k = 1;' },
    {
      entries: [
        {
          path: 'src/config.ts',
          format: 'Stripe live key',
          reason: 'Reviewed fixture kept realistic on purpose for this test.',
        },
      ],
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.output, /stale allowlist entry/);
});

test('an allowlist entry without a real reason fails the scan', () => {
  const result = scan(
    { 'src/config.ts': `const k = '${STRIPE}';` },
    { entries: [{ path: 'src/config.ts', format: 'Stripe live key', reason: 'ok' }] },
  );
  assert.equal(result.status, 1);
  assert.match(result.output, /has no real reason/);
});

test('the CI gate runs this suite before it can report a pass', () => {
  const repo = path.dirname(path.dirname(SCANNER));
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const gate = pkg.scripts['check:secrets'];
  assert.ok(
    gate.startsWith('node --test scripts/check-secrets.test.mjs && '),
    `check:secrets must run this suite first, got: ${gate}`,
  );
  assert.ok(gate.endsWith('node scripts/check-secrets.mjs'), `check:secrets got: ${gate}`);
  const ci = fs.readFileSync(path.join(repo, '.github/workflows/ci.yml'), 'utf8');
  const direct = /^ +run: pnpm check:secrets$/m.test(ci);
  const viaChain =
    /^ +run: pnpm check:llm-operability$/m.test(ci) &&
    (pkg.scripts['check:llm-operability'] ?? '').includes('pnpm check:secrets');
  assert.ok(
    direct || viaChain,
    'ci.yml must reach the secret scan, either as its own step or through check:llm-operability',
  );
});

// This product holds keys for providers the table did not name, which is not a
// theoretical gap: on 2026-09-12 a live provider error quoting an account back
// at the caller was written into a committed file and this scan passed it.
const OPENROUTER = shape(
  'sk',
  '-or-v1-',
  '9f3b2c7d8e1a4056b7c9d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
);
const PERPLEXITY = shape('pplx', '-', '7a2b9c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081');
const VENDOR_SK = shape('sk', '-', '3f8a1b2c9d4e5f6071829a3b4c5d6e7f80');
const VENDOR_AK = shape('ak', '-', '9f3b2c7d8e1a4056');

test('the providers this product actually uses are recognised', async (t) => {
  await t.test('OpenRouter', () => reported(`const k = '${OPENROUTER}';`, 'OpenRouter API key'));
  await t.test('Perplexity', () => reported(`const k = '${PERPLEXITY}';`, 'Perplexity API key'));
  // DeepSeek, Moonshot and Alibaba all issue a bare sk- key.
  await t.test('bare vendor key', () => reported(`const k = '${VENDOR_SK}';`, 'Vendor API key'));
  // The identifier half of a Moonshot credential, which its errors quote back.
  await t.test('vendor access key id', () =>
    reported(`const k = '${VENDOR_AK}';`, 'Vendor access key id'),
  );
});

test('a bare vendor key does not swallow the keys that have their own row', async (t) => {
  // sk-ant- and sk-proj- carry a second dashed segment, so the bare sk- pattern
  // cannot match them and each is still reported under its own vendor name.
  await t.test('Anthropic keeps its own name', () =>
    reported(`const k = '${ANTHROPIC}';`, 'Anthropic API key'),
  );
  await t.test('OpenAI keeps its own name', () =>
    reported(`const k = '${OPENAI}';`, 'OpenAI project key'),
  );
});

test('an unmistakably fake key for the new formats is still allowed', async (t) => {
  await t.test('marker filled', () => clean(`const k = '${shape('sk', '-', 'EXAMPLE')}';`));
  await t.test('counting filler', () =>
    clean(`const k = '${shape('ak', '-', '000000000000000000')}';`),
  );
});

const HISTORY_A = 'a'.repeat(40);
const HISTORY_B = 'b'.repeat(40);

function historyRecord(sha, type, body) {
  const bytes = Buffer.from(body);
  return Buffer.concat([Buffer.from(`${sha} ${type} ${bytes.length}\n`), bytes, Buffer.from('\n')]);
}

function scanWithGitOutput({ failure = null, inventory, batch }, history = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-git-read-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const calls = path.join(dir, 'calls.jsonl');
    const config = {
      failure,
      inventory,
      batch: Buffer.from(batch ?? '').toString('base64'),
      calls,
    };
    const executable = String.raw`#!${process.execPath}
const fs = require('node:fs');
const config = ${JSON.stringify(config)};
const args = process.argv.slice(2);
fs.appendFileSync(config.calls, JSON.stringify(args) + '\n');
if (args[0] === config.failure) {
  process.stderr.write('sensitive-subprocess-stderr');
  process.exit(2);
}
if (args[0] === 'rev-list') process.stdout.write(config.inventory ?? '');
if (args[0] === 'cat-file') {
  const input = fs.readFileSync(0, 'utf8');
  fs.appendFileSync(config.calls, JSON.stringify({ input }) + '\n');
  process.stdout.write(Buffer.from(config.batch, 'base64'));
}
`;
    fs.writeFileSync(path.join(bin, 'git'), executable, { mode: 0o700 });
    const run = spawnSync(process.execPath, [SCANNER, ...(history ? ['--history'] : [])], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    return {
      status: run.status,
      output: `${run.stdout}${run.stderr}`,
      calls: fs.readFileSync(calls, 'utf8'),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const fakeGitOptions = { skip: process.platform === 'win32' };

for (const failure of ['ls-files', 'rev-list', 'cat-file']) {
  test(`Git ${failure} failure cannot report a clean scan`, fakeGitOptions, () => {
    const result = scanWithGitOutput({
      failure,
      inventory: `${HISTORY_A} src/read.ts\n`,
      batch: historyRecord(HISTORY_A, 'blob', 'clean'),
    });
    assert.equal(result.status, 1, 'unread Git input must fail the scan');
    assert.match(result.output, /Secret scan FAILED/);
    assert.doesNotMatch(result.output, /Secret scan passed|sensitive-subprocess-stderr/);
    assert.ok(result.calls.includes(failure), 'the fixture must reach the failed Git operation');
  });
}

const invalidHistory = [
  ['missing object', Buffer.from(`${HISTORY_A} missing\n`)],
  ['empty response', Buffer.alloc(0)],
  ['truncated header', Buffer.from(`${HISTORY_A} blob 4`)],
  ['truncated body', Buffer.from(`${HISTORY_A} blob 10\nshort\n`)],
  ['missing separator', Buffer.from(`${HISTORY_A} blob 4\nbody`)],
  ['wrong object', historyRecord(HISTORY_B, 'blob', 'body')],
  [
    'extra object',
    Buffer.concat([
      historyRecord(HISTORY_A, 'blob', 'body'),
      historyRecord(HISTORY_B, 'blob', 'body'),
    ]),
  ],
  ['invalid size', Buffer.from(`${HISTORY_A} blob NaN\nbody\n`)],
];
for (const [name, batch] of invalidHistory) {
  test(`history ${name} cannot report a clean scan`, fakeGitOptions, () => {
    const result = scanWithGitOutput({ inventory: `${HISTORY_A} src/read.ts\n`, batch });
    assert.equal(result.status, 1, 'incomplete or invalid content must fail the scan');
    assert.match(result.output, /Secret scan FAILED/);
    assert.doesNotMatch(result.output, /Secret scan passed/);
    assert.ok(
      result.calls.includes(JSON.stringify({ input: `${HISTORY_A}\n` })),
      'cat-file must receive the enumerated object',
    );
  });
}

test('a malformed history inventory cannot report a clean scan', fakeGitOptions, () => {
  const result = scanWithGitOutput({ inventory: 'not-an-object src/read.ts\n' });
  assert.equal(result.status, 1);
  assert.match(result.output, /Secret scan FAILED/);
});

test('tree payloads cannot hide the next blob', fakeGitOptions, () => {
  const body = shape('-----BEGIN RSA ', 'PRIVATE KEY-----');
  const result = scanWithGitOutput({
    inventory: `${HISTORY_A} src\n${HISTORY_B} src/read.ts\n`,
    batch: Buffer.concat([
      historyRecord(
        HISTORY_A,
        'tree',
        Buffer.concat([
          Buffer.from('100644 name\nembedded blob 9999999\nentry\0'),
          Buffer.alloc(20, 1),
        ]),
      ),
      historyRecord(HISTORY_B, 'blob', body),
    ]),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /src\/read.ts.*PEM private key/);
  assert.ok(!result.output.includes(body), 'findings must not contain credential material');
});

test(
  'a complete clean history response passes and proves a blob was inspected',
  fakeGitOptions,
  () => {
    const result = scanWithGitOutput({
      inventory: `${HISTORY_A} src/read.ts\n`,
      batch: historyRecord(HISTORY_A, 'blob', 'clean'),
    });
    assert.equal(result.status, 0);
    assert.match(result.output, /1 history objects/);
  },
);

test(
  'oversized excluded history still requires complete framing and reports its count',
  fakeGitOptions,
  () => {
    const body = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);
    const complete = historyRecord(HISTORY_A, 'blob', body);
    const input = { inventory: `${HISTORY_A} src/large.ts\n`, batch: complete };
    const result = scanWithGitOutput(input);
    assert.equal(result.status, 0);
    assert.match(result.output, /1 oversized history objects excluded/);
    const truncated = scanWithGitOutput({
      ...input,
      batch: complete.subarray(0, complete.length - 1),
    });
    assert.equal(truncated.status, 1);
  },
);

test('oversized excluded working-tree files are counted explicitly', () => {
  const result = scan({ 'src/large.ts': 'a'.repeat(2 * 1024 * 1024 + 1) });
  assert.equal(result.status, 0);
  assert.match(result.output, /1 oversized working-tree files excluded/);
});

test('finding reports contain the type and path without a credential prefix', () => {
  const result = scan({ 'src/config.ts': STRIPE });
  assert.equal(result.status, 1);
  assert.match(result.output, /src\/config.ts.*Stripe live key/);
  assert.ok(
    !result.output.includes(STRIPE.slice(0, 12)),
    'credential prefixes must not be printed',
  );
});

test(
  'a batch cannot omit the last requested object after returning valid earlier content',
  fakeGitOptions,
  () => {
    const result = scanWithGitOutput({
      inventory: `${HISTORY_A} src/first.ts\n${HISTORY_B} src/second.ts\n`,
      batch: historyRecord(HISTORY_A, 'blob', 'clean'),
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /Secret scan FAILED/);
    assert.ok(result.calls.includes(JSON.stringify({ input: `${HISTORY_A}\n${HISTORY_B}\n` })));
  },
);

for (const [type, inventory] of [
  ['tag', `${HISTORY_A} v-cli-1.0.0\n`],
  ['commit', `${HISTORY_A}\n`],
]) {
  test(
    `clean ${type} history is inspected without rejecting valid Git objects`,
    fakeGitOptions,
    () => {
      const result = scanWithGitOutput({
        inventory,
        batch: historyRecord(HISTORY_A, type, 'clean'),
      });
      assert.equal(result.status, 0);
      assert.match(result.output, /1 history objects/);
      assert.ok(result.calls.includes(JSON.stringify({ input: `${HISTORY_A}\n` })));
    },
  );

  test(`a ${type} message cannot hide credentials from history inspection`, fakeGitOptions, () => {
    const result = scanWithGitOutput({
      inventory,
      batch: historyRecord(HISTORY_A, type, VENDOR_SK),
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /Vendor API key/);
    assert.ok(!result.output.includes(VENDOR_SK.slice(0, 12)));
  });
}

for (const label of ['release.lock', 'build/release', 'scripts/check-secrets.mjs']) {
  test(`a tag named ${label} is not a file exclusion`, fakeGitOptions, () => {
    const result = scanWithGitOutput({
      inventory: `${HISTORY_A} ${label}\n`,
      batch: historyRecord(HISTORY_A, 'tag', VENDOR_SK),
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /Vendor API key/);
    assert.ok(result.calls.includes(JSON.stringify({ input: `${HISTORY_A}\n` })));
  });
}

test('a credential-bearing tag name is never used as a diagnostic label', fakeGitOptions, () => {
  const result = scanWithGitOutput({
    inventory: `${HISTORY_A} ${VENDOR_SK}\n`,
    batch: historyRecord(HISTORY_A, 'tag', `tag ${VENDOR_SK}\n\nrelease`),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /git tag [a-f0-9]+.*Vendor API key/);
  assert.ok(!result.output.includes(VENDOR_SK.slice(0, 12)));
});

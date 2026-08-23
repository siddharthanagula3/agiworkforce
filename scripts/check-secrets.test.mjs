import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCANNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-secrets.mjs');

// The scanner scans this file too. Every credential shape is assembled at run time so no literal
// one is committed here — a fixture that looks live is the defect this suite exists to catch.
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
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
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
  assert.match(ci, /^ +run: pnpm check:secrets$/m);
});

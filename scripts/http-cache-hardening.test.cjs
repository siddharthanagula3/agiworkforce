'use strict';

// Run from the repository root after its frozen pnpm install. The exact current
// patched store entry is mandatory; an unpatched or alternate module cannot pass.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const repoRoot = process.cwd();
const packageKey = 'http-cache-semantics@4.2.0';
const registeredPatchPath = 'patches/http-cache-semantics@4.2.0.patch';
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
assert.equal(
  manifest.pnpm?.patchedDependencies?.[packageKey],
  registeredPatchPath,
  'the current source patch must be registered for exactly http-cache-semantics@4.2.0',
);
const lockfile = fs.readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
const patchSection = lockfile.match(/^patchedDependencies:\r?\n([\s\S]*?)(?=^\S)/m)?.[1];
assert.ok(patchSection, 'the lockfile must register patched dependencies');
const patchEntry = patchSection.match(
  /^  http-cache-semantics@4\.2\.0:\r?\n    hash: ([a-z0-9]+)\r?\n    path: ([^\r\n]+)$/m,
);
assert.ok(patchEntry, 'the lockfile must pin the exact http-cache-semantics@4.2.0 patch hash');
assert.equal(patchEntry[2], registeredPatchPath);
const installedDirectory = path.join(
  repoRoot,
  'node_modules',
  '.pnpm',
  `${packageKey}_patch_hash=${patchEntry[1]}`,
  'node_modules',
  'http-cache-semantics',
);
const installedManifest = JSON.parse(
  fs.readFileSync(path.join(installedDirectory, 'package.json'), 'utf8'),
);
assert.equal(installedManifest.name, 'http-cache-semantics');
assert.equal(installedManifest.version, '4.2.0');
const installedIndex = path.join(installedDirectory, 'index.js');
assert.ok(
  fs
    .realpathSync(installedDirectory)
    .startsWith(fs.realpathSync(path.join(repoRoot, 'node_modules', '.pnpm')) + path.sep),
  'the installed test target must remain inside this workspace pnpm directory',
);
const CachePolicy = require(installedIndex);

// Reconstruct the vulnerable upstream source offline from that exact installed
// package. No downloaded or vendored original can substitute for this control.
const upstreamDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-cache-upstream-'));
const cleanupUpstream = () => fs.rmSync(upstreamDirectory, { recursive: true, force: true });
after(cleanupUpstream);
let OriginalCachePolicy;
try {
  fs.cpSync(installedDirectory, upstreamDirectory, { recursive: true });
  const gitEnvironment = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) {
    delete gitEnvironment[name];
  }
  const reverse = spawnSync(
    'git',
    ['apply', '--reverse', path.join(repoRoot, registeredPatchPath)],
    {
      cwd: upstreamDirectory,
      encoding: 'utf8',
      env: gitEnvironment,
      timeout: 10000,
    },
  );
  assert.equal(
    reverse.status,
    0,
    `the registered patch must reverse cleanly against the installed module: ${reverse.stderr || reverse.error || ''}`,
  );
  const originalManifest = JSON.parse(
    fs.readFileSync(path.join(upstreamDirectory, 'package.json'), 'utf8'),
  );
  assert.equal(originalManifest.name, 'http-cache-semantics');
  assert.equal(originalManifest.version, '4.2.0');
  OriginalCachePolicy = require(path.join(upstreamDirectory, 'index.js'));
} catch (error) {
  cleanupUpstream();
  throw error;
}

const URL = 'https://cache.example.test/account';
const HOST = 'cache.example.test';
const VALIDATOR = '"account-v1"';
const MODIFIED = 'Wed, 01 Oct 2025 00:00:00 GMT';
const EXTENSIONS = 'max-age=600, stale-while-revalidate=300, stale-if-error=300';

class TestPolicy extends CachePolicy {
  now() {
    return Date.UTC(2026, 9, 3, 0, 0, 0);
  }
}

function request(headers = {}, overrides = {}) {
  return { url: URL, method: 'GET', headers: { host: HOST, ...headers }, ...overrides };
}

function response(headers = {}, status = 200) {
  return { status, headers: { etag: VALIDATOR, 'last-modified': MODIFIED, ...headers } };
}

function fixture({ requestHeaders, responseHeaders, options, method, status } = {}) {
  const req = request(requestHeaders, method ? { method } : {});
  const policy = new TestPolicy(req, response(responseHeaders, status), options);
  const receivedAt = policy.now();
  let elapsed = 0;
  policy.now = () => receivedAt + elapsed * 1000;
  return {
    req,
    policy,
    advance(seconds) {
      elapsed = seconds;
    },
    restore() {
      const restored = CachePolicy.fromObject(JSON.parse(JSON.stringify(policy.toObject())));
      restored.now = policy.now;
      return restored;
    },
  };
}

const forbiddenCases = [
  [
    'shared Set-Cookie',
    {
      responseHeaders: {
        'cache-control': EXTENSIONS,
        'set-cookie': 'session=alice-secret; HttpOnly',
      },
    },
  ],
  [
    'shared Set-Cookie with s-maxage only',
    {
      responseHeaders: {
        'cache-control': `${EXTENSIONS}, s-maxage=600`,
        'set-cookie': 'session=alice-secret; HttpOnly',
      },
    },
  ],
  ['shared private response', { responseHeaders: { 'cache-control': `private, ${EXTENSIONS}` } }],
  ['response no-store', { responseHeaders: { 'cache-control': `no-store, ${EXTENSIONS}` } }],
  [
    'request no-store',
    {
      requestHeaders: { 'cache-control': 'no-store' },
      responseHeaders: { 'cache-control': EXTENSIONS },
    },
  ],
  [
    'authenticated response without shared-cache opt-in',
    {
      requestHeaders: { authorization: 'Bearer alice-secret' },
      responseHeaders: { 'cache-control': EXTENSIONS },
    },
  ],
  ['Vary star', { responseHeaders: { 'cache-control': EXTENSIONS, vary: '*' } }],
  [
    'unsupported request method',
    { method: 'DELETE', responseHeaders: { 'cache-control': EXTENSIONS } },
  ],
  [
    'unsupported response status',
    { status: 206, responseHeaders: { 'cache-control': EXTENSIONS } },
  ],
];

const validationRequiredCases = [
  ['response no-cache', { responseHeaders: { 'cache-control': `no-cache, ${EXTENSIONS}` } }],
  [
    'shared proxy-revalidate',
    { responseHeaders: { 'cache-control': `proxy-revalidate, ${EXTENSIONS}` } },
  ],
];

const staleRequests = [
  undefined,
  'max-stale',
  'max-stale=2147483647',
  'max-stale=9999999999999999999999999999999999999999999',
];

for (const [name, config] of [...forbiddenCases, ...validationRequiredCases]) {
  test(`${name}: client max-stale and stale extensions cannot override policy restrictions`, () => {
    const value = fixture(config);
    for (const seconds of [0, 10, 610]) {
      value.advance(seconds);
      for (const policy of [value.policy, value.restore()]) {
        for (const cacheControl of staleRequests) {
          const req = request(
            { cookie: 'session=bob', ...(cacheControl ? { 'cache-control': cacheControl } : {}) },
            config.method ? { method: config.method } : {},
          );
          const result = policy.evaluateRequest(req);
          assert.equal(
            result.response,
            undefined,
            `${name}: cached body must not be offered at age ${seconds}, ${cacheControl}`,
          );
          assert.equal(result.revalidation.synchronous, true);
          assert.equal(policy.satisfiesWithoutRevalidation(req), false);
        }
        assert.equal(policy.maxAge(), 0);
        assert.equal(policy.timeToLive(), 0, 'stale extensions cannot retain a forbidden entry');
        assert.equal(policy.useStaleWhileRevalidate(), false);
        assert.equal(policy._useStaleIfError(), false);
      }
    }
  });

  test(`${name}: origin failures cannot select the old body`, () => {
    const value = fixture(config);
    value.advance(10);
    for (const policy of [value.policy, value.restore()]) {
      for (const status of [500, 502, 503, 504]) {
        const result = policy.revalidatedPolicy(
          request({ cookie: 'session=bob' }),
          response({}, status),
        );
        assert.equal(result.modified, true, `status ${status} cannot reuse the old body`);
        assert.equal(result.matches, false);
        assert.notEqual(result.policy, policy);
      }
      assert.throws(
        () => policy.revalidatedPolicy(request(), undefined),
        /Response headers missing/,
      );
    }
  });
}

for (const [name, config] of forbiddenCases) {
  test(`${name}: matching 304 cannot revive a prohibited stored body`, () => {
    const value = fixture(config);
    value.advance(10);
    for (const policy of [value.policy, value.restore()]) {
      const req = request({
        cookie: 'session=bob',
        'if-none-match': VALIDATOR,
        'if-modified-since': MODIFIED,
      });
      const headers = policy.revalidationHeaders(req);
      assert.equal(headers['if-none-match'], undefined);
      assert.equal(headers['if-modified-since'], undefined);
      assert.equal(headers.cookie, 'session=bob');
      const result = policy.revalidatedPolicy(req, response({ etag: VALIDATOR }, 304));
      assert.equal(
        result.modified,
        true,
        'the old body cannot be selected even for a matching validator',
      );
      assert.equal(result.matches, false);
      assert.equal(result.policy.storable(), false);
      assert.equal(result.policy.evaluateRequest(req).response, undefined);
    }
  });
}

for (const [name, config] of validationRequiredCases) {
  test(`${name}: actual synchronous origin validation remains supported`, () => {
    const value = fixture(config);
    value.advance(10);
    const req = request();
    assert.equal(value.policy.revalidationHeaders(req)['if-none-match'], VALIDATOR);
    const result = value.policy.revalidatedPolicy(req, response({ etag: VALIDATOR }, 304));
    assert.equal(result.modified, false);
    assert.equal(result.matches, true);
    assert.equal(result.policy.storable(), true);
    assert.equal(
      result.policy.evaluateRequest(request({ 'cache-control': 'max-stale' })).response,
      undefined,
    );
    assert.equal(result.policy.timeToLive(), 0);
  });
}

test('legacy Pragma no-cache cannot be overridden by unbounded max-stale', () => {
  const value = fixture({ responseHeaders: { pragma: 'no-cache' } });
  value.advance(10);
  const req = request({ 'cache-control': 'max-stale' });
  assert.equal(value.policy.evaluateRequest(req).response, undefined);
  assert.equal(value.restore().satisfiesWithoutRevalidation(req), false);
});

test('a full replacement response may explicitly opt into shared caching', () => {
  const value = fixture({
    responseHeaders: { 'cache-control': EXTENSIONS, 'set-cookie': 'session=alice-secret' },
  });
  const result = value.policy.revalidatedPolicy(
    request(),
    response({ 'cache-control': 'public, max-age=600' }),
  );
  assert.equal(result.modified, true);
  assert.equal(result.matches, false);
  assert.notEqual(result.policy, value.policy);
  assert.equal(result.policy.satisfiesWithoutRevalidation(request()), true);
});

test('ordinary public fresh caching, TTL and JSON restoration are unchanged', () => {
  const value = fixture({ responseHeaders: { 'cache-control': 'public, max-age=600' } });
  value.advance(10);
  for (const policy of [value.policy, value.restore()]) {
    assert.equal(policy.maxAge(), 600);
    assert.equal(policy.timeToLive(), 590000);
    assert.equal(policy.satisfiesWithoutRevalidation(request()), true);
    assert.ok(policy.evaluateRequest(request()).response);
  }
});

test('a personal cache may reuse private cookies and authenticated responses', () => {
  const value = fixture({
    requestHeaders: { authorization: 'Bearer alice-secret' },
    responseHeaders: {
      'cache-control': 'private, max-age=600',
      'set-cookie': 'session=alice-secret',
    },
    options: { shared: false },
  });
  value.advance(10);
  assert.equal(value.policy.maxAge(), 600);
  assert.equal(value.policy.timeToLive(), 590000);
  assert.equal(value.policy.satisfiesWithoutRevalidation(request()), true);
});

for (const optIn of ['public', 'immutable']) {
  test(`shared Set-Cookie explicitly marked ${optIn} retains existing opt-in behavior`, () => {
    const value = fixture({
      responseHeaders: {
        'cache-control': `${optIn}, max-age=600`,
        'set-cookie': 'session=explicitly-shareable',
      },
    });
    value.advance(10);
    assert.equal(value.policy.maxAge(), 600);
    assert.equal(value.policy.satisfiesWithoutRevalidation(request()), true);
  });
}

test('public max-age=0 remains eligible for client-authorized stale reuse', () => {
  const value = fixture({ responseHeaders: { 'cache-control': 'public, max-age=0' } });
  value.advance(10);
  assert.equal(value.policy.evaluateRequest(request()).response, undefined);
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale' })),
    true,
  );
  assert.equal(
    value.restore().satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale=11' })),
    true,
  );
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale=9' })),
    false,
  );
});

test('a personal private max-age=0 cache retains valid stale reuse', () => {
  const value = fixture({
    responseHeaders: { 'cache-control': 'private, max-age=0' },
    options: { shared: false },
  });
  value.advance(10);
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale' })),
    true,
  );
});

test('ordinary public max-age=0 stale-while-revalidate remains asynchronous', () => {
  const value = fixture({
    responseHeaders: { 'cache-control': 'public, max-age=0, stale-while-revalidate=300' },
  });
  value.advance(10);
  assert.equal(value.policy.timeToLive(), 290000);
  const result = value.policy.evaluateRequest(request());
  assert.ok(result.response);
  assert.equal(result.revalidation.synchronous, false);
  assert.equal(value.policy.useStaleWhileRevalidate(), true);
});

test('ordinary public max-age=0 stale-if-error retains validated fallback behavior', () => {
  const value = fixture({
    responseHeaders: { 'cache-control': 'public, max-age=0, stale-if-error=300' },
  });
  value.advance(10);
  assert.equal(value.policy.timeToLive(), 290000);
  const result = value.policy.revalidatedPolicy(request(), response({}, 503));
  assert.equal(result.modified, false);
  assert.equal(result.matches, true);
  assert.equal(result.policy, value.policy);
});

test('client max-stale bounds for an ordinary expired entry are preserved', () => {
  const value = fixture({ responseHeaders: { 'cache-control': 'public, max-age=60' } });
  value.advance(90);
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale=31' })),
    true,
  );
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale=20' })),
    false,
  );
});

test('cache-key, Vary and request no-cache restrictions continue to apply', () => {
  const value = fixture({
    requestHeaders: { 'accept-language': 'en' },
    responseHeaders: { 'cache-control': 'public, max-age=600', vary: 'accept-language' },
  });
  const req = request({ 'accept-language': 'en' });
  assert.equal(value.policy.satisfiesWithoutRevalidation(req), true);
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(request({ 'accept-language': 'fr' })),
    false,
  );
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(
      request({ 'accept-language': 'en' }, { url: `${URL}/other` }),
    ),
    false,
  );
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(
      request({ host: 'other.example.test', 'accept-language': 'en' }),
    ),
    false,
  );
  assert.equal(
    value.policy.satisfiesWithoutRevalidation(
      request({ 'accept-language': 'en', 'cache-control': 'no-cache' }),
    ),
    false,
  );
});

test('a newly supplied 304 Set-Cookie is retained and blocks subsequent cross-user cache reuse', () => {
  const value = fixture();
  value.advance(10);
  assert.ok(value.policy.maxAge() > 0, 'the original response has valid heuristic freshness');
  const result = value.policy.revalidatedPolicy(
    request({ cookie: 'session=bob' }),
    response(
      {
        'set-cookie': 'session=bob-origin-secret; HttpOnly',
      },
      304,
    ),
  );
  assert.equal(result.modified, false, 'the actual origin 304 validates the current response');
  assert.equal(result.matches, true);
  assert.equal(
    result.policy.responseHeaders()['set-cookie'],
    'session=bob-origin-secret; HttpOnly',
  );
  assert.equal(result.policy.maxAge(), 0);
  assert.equal(result.policy.timeToLive(), 0);
  assert.equal(result.policy.useStaleWhileRevalidate(), false);
  assert.equal(result.policy._useStaleIfError(), false);
  const otherUser = request({ cookie: 'session=carol', 'cache-control': 'max-stale' });
  assert.equal(result.policy.evaluateRequest(otherUser).response, undefined);
  assert.equal(result.policy.satisfiesWithoutRevalidation(otherUser), false);
  const restored = TestPolicy.fromObject(JSON.parse(JSON.stringify(result.policy.toObject())));
  assert.equal(restored.satisfiesWithoutRevalidation(otherUser), false);
});

test('newly supplied 304 Cache-Control no-cache cannot be discarded or bypassed with stale allowances', () => {
  const value = fixture();
  value.advance(10);
  const result = value.policy.revalidatedPolicy(
    request(),
    response(
      {
        'cache-control': `no-cache, ${EXTENSIONS}`,
      },
      304,
    ),
  );
  assert.equal(result.modified, false);
  assert.equal(result.matches, true);
  assert.equal(result.policy.responseHeaders()['cache-control'], `no-cache, ${EXTENSIONS}`);
  assert.equal(result.policy.maxAge(), 0);
  assert.equal(result.policy.timeToLive(), 0);
  assert.equal(result.policy.useStaleWhileRevalidate(), false);
  assert.equal(result.policy._useStaleIfError(), false);
  assert.equal(
    result.policy.satisfiesWithoutRevalidation(
      request({ 'cache-control': 'max-stale=2147483647' }),
    ),
    false,
  );
  const fallback = result.policy.revalidatedPolicy(request(), response({}, 503));
  assert.equal(fallback.modified, true);
  assert.equal(fallback.matches, false);
  assert.notEqual(fallback.policy, result.policy);
  const revalidated = result.policy.revalidatedPolicy(request(), response({}, 304));
  assert.equal(
    revalidated.modified,
    false,
    'a subsequent actual origin validation is still supported',
  );
  assert.equal(revalidated.matches, true);
});

test('a matching 304 may introduce public freshness and valid end-to-end response metadata', () => {
  const value = fixture();
  const result = value.policy.revalidatedPolicy(
    request(),
    response(
      {
        'cache-control': 'public, max-age=600',
        'content-type': 'application/json',
        'x-origin-version': 'v2',
        date: new Date(TestPolicy.prototype.now()).toUTCString(),
      },
      304,
    ),
  );
  assert.equal(result.modified, false);
  assert.equal(result.matches, true);
  assert.equal(result.policy.maxAge(), 600);
  assert.equal(result.policy.satisfiesWithoutRevalidation(request()), true);
  const headers = result.policy.responseHeaders();
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(headers['x-origin-version'], 'v2');
  assert.equal(
    result.policy.toObject().resh.date,
    new Date(TestPolicy.prototype.now()).toUTCString(),
  );
});

test('new 304 representation and hop-by-hop headers cannot overwrite or introduce excluded body metadata', () => {
  for (const oldHeaders of [
    {},
    { 'content-length': '100', 'content-encoding': 'gzip', 'content-range': 'bytes 0-99/100' },
  ]) {
    const value = fixture({
      responseHeaders: { 'cache-control': 'public, max-age=600', ...oldHeaders },
    });
    const result = value.policy.revalidatedPolicy(
      request(),
      response(
        {
          'content-length': '999',
          'content-encoding': 'br',
          'content-range': 'bytes 0-998/999',
          'transfer-encoding': 'chunked',
          connection: 'X-Origin-Session, Date',
          'x-origin-session': 'hop-only',
          date: new Date(TestPolicy.prototype.now()).toUTCString(),
          'keep-alive': 'timeout=5',
          'x-origin-version': 'v2',
        },
        304,
      ),
    );
    const storedHeaders = result.policy.toObject().resh;
    for (const name of ['content-length', 'content-encoding', 'content-range']) {
      assert.equal(
        storedHeaders[name],
        oldHeaders[name],
        `${name} must describe the existing cached body`,
      );
    }
    for (const name of [
      'transfer-encoding',
      'connection',
      'x-origin-session',
      'keep-alive',
      'date',
    ]) {
      assert.equal(storedHeaders[name], undefined, `${name} must not be newly retained from 304`);
    }
    assert.equal(storedHeaders['x-origin-version'], 'v2');
    assert.equal(result.modified, false);
    assert.equal(result.matches, true);
    assert.equal(result.policy.satisfiesWithoutRevalidation(request()), true);
  }
});

test('a newly supplied 304 Date remains the reference for newly supplied Expires', () => {
  const value = fixture();
  const serverDate = TestPolicy.prototype.now() - 60000;
  const result = value.policy.revalidatedPolicy(
    request(),
    response(
      {
        date: new Date(serverDate).toUTCString(),
        expires: new Date(serverDate + 600000).toUTCString(),
      },
      304,
    ),
  );
  assert.equal(result.matches, true);
  assert.equal(result.modified, false);
  assert.equal(result.policy.date(), serverDate);
  assert.equal(result.policy.maxAge(), 600);
});

for (const [name, headers] of [
  ['private', { 'cache-control': `private, ${EXTENSIONS}` }],
  ['no-store', { 'cache-control': `no-store, ${EXTENSIONS}` }],
  ['Vary star', { vary: '*' }],
]) {
  test(`newly supplied 304 ${name} remains effective for subsequent policy decisions`, () => {
    const value = fixture();
    const result = value.policy.revalidatedPolicy(request(), response(headers, 304));
    assert.equal(result.matches, true);
    assert.equal(result.modified, false);
    const policy = result.policy;
    assert.equal(policy.maxAge(), 0);
    assert.equal(policy.timeToLive(), 0);
    assert.equal(policy.useStaleWhileRevalidate(), false);
    assert.equal(policy._useStaleIfError(), false);
    assert.equal(
      policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale' })),
      false,
    );
    const followup304 = policy.revalidatedPolicy(request(), response({}, 304));
    assert.equal(followup304.modified, true, 'the newly prohibited body cannot be revived');
    assert.equal(followup304.matches, false);
  });
}

class OriginalTestPolicy extends OriginalCachePolicy {
  now() {
    return TestPolicy.prototype.now();
  }
}

test("offline original control: client max-stale reuses another user's shared Set-Cookie", () => {
  const original = new OriginalTestPolicy(
    request({ cookie: 'session=alice' }),
    response({
      'cache-control': EXTENSIONS,
      'set-cookie': 'session=alice-secret; HttpOnly',
    }),
  );
  assert.equal(original.maxAge(), 0);
  assert.equal(original.storable(), true);
  for (const cacheControl of ['max-stale', 'max-stale=2147483647']) {
    const otherUser = request({ cookie: 'session=bob', 'cache-control': cacheControl });
    const reused = original.evaluateRequest(otherUser);
    assert.equal(
      reused.response.headers['set-cookie'],
      'session=alice-secret; HttpOnly',
      'the reconstructed original must reproduce the credential reuse bypass',
    );
    assert.equal(original.satisfiesWithoutRevalidation(otherUser), true);
  }
});

test('offline original control: a newly introduced 304 Set-Cookie is discarded', () => {
  const original = new OriginalTestPolicy(request(), response());
  const result = original.revalidatedPolicy(
    request({ cookie: 'session=bob' }),
    response(
      {
        'set-cookie': 'session=bob-origin-secret; HttpOnly',
      },
      304,
    ),
  );
  assert.equal(result.matches, true);
  assert.equal(result.modified, false);
  assert.equal(
    result.policy.responseHeaders()['set-cookie'],
    undefined,
    'the original must demonstrate its lost 304 security header',
  );
  assert.ok(result.policy.maxAge() > 0);
  assert.ok(
    result.policy.evaluateRequest(
      request({ cookie: 'session=carol', 'cache-control': 'max-stale' }),
    ).response,
    'the original must permit subsequent reuse after losing the new cookie restriction',
  );
});

test('offline original control: newly introduced 304 no-cache is discarded', () => {
  const original = new OriginalTestPolicy(request(), response());
  const result = original.revalidatedPolicy(
    request(),
    response(
      {
        'cache-control': `no-cache, ${EXTENSIONS}`,
      },
      304,
    ),
  );
  assert.equal(result.matches, true);
  assert.equal(result.modified, false);
  assert.equal(
    result.policy.responseHeaders()['cache-control'],
    undefined,
    'the original must demonstrate its lost 304 validation requirement',
  );
  assert.ok(result.policy.maxAge() > 0);
  assert.equal(
    result.policy.satisfiesWithoutRevalidation(request({ 'cache-control': 'max-stale' })),
    true,
  );
});

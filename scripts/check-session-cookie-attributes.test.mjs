import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COOKIE_ROOTS,
  REPO_ROOT,
  checkSessionCookieAttributes,
  cookieWritesIn,
  sourceFiles,
} from './check-session-cookie-attributes.mjs';

const roots = [];

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'cookie-attributes-'));
  roots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function check(files, options = {}) {
  return checkSessionCookieAttributes(tree(files), {
    roots: ['app'],
    minimumWrites: 0,
    ...options,
  });
}

const GOOD_WRITE =
  'const cookieStore = await cookies();\n' +
  "cookieStore.set('session', value, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });\n";

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a cookie carrying every attribute passes', () => {
  const { errors, report } = check({ 'app/api/a/route.ts': GOOD_WRITE });
  assert.deepEqual(errors, []);
  assert.equal(report.writes, 1);
});

test('a cookie without HttpOnly fails and says so', () => {
  const { errors } = check({
    'app/api/a/route.ts':
      "cookieStore.set('session', v, { secure: true, sameSite: 'lax', path: '/' });\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /without HttpOnly/);
});

test('a cookie missing several attributes names all of them', () => {
  const { errors } = check({
    'app/api/a/route.ts': "cookieStore.set('session', v, { path: '/' });\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /HttpOnly, Secure, SameSite/);
});

test('a cookie widened to a Domain fails', () => {
  const { errors } = check({
    'app/api/a/route.ts':
      "cookieStore.set('session', v, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', domain: '.example.com' });\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sibling host/);
});

test('an attribute turned off is not an attribute set', () => {
  const { errors } = check({
    'app/api/a/route.ts':
      "cookieStore.set('session', v, { httpOnly: false, secure: true, sameSite: 'none', path: '/' });\n",
  });
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /httpOnly: false/);
  assert.match(errors.join('\n'), /sameSite: 'none'/);
});

test('attributes held in a shared options object still count as set', () => {
  const { errors, report } = check({
    'app/api/a/route.ts':
      "const OPTS = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' };\n" +
      "cookieStore.set('session', v, OPTS);\n" +
      "cookieStore.set('other', v, { ...OPTS, maxAge: 60 });\n",
  });
  assert.deepEqual(errors, []);
  assert.equal(report.writes, 2);
});

test('a Set-Cookie header string is swept like any other write', () => {
  const { errors, report } = check({
    'app/api/a/route.ts':
      "response.headers.set('Set-Cookie', `${NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=60`);\n",
  });
  assert.equal(report.writes, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /without Secure/);
});

test('a header string that widens to a Domain fails', () => {
  const { errors } = check({
    'app/api/a/route.ts':
      "const c = 'sid=1; Path=/; HttpOnly; Secure; SameSite=Strict; Domain=.example.com';\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sibling host/);
});

test('clearing a cookie needs only its path, and fails without one', () => {
  const cleared = check({
    'app/api/a/route.ts':
      "cookieStore.set({ name: 'session', value: '', maxAge: 0, path: '/' });\n",
  });
  assert.deepEqual(cleared.errors, []);
  assert.equal(cleared.report.deletions, 1);

  const pathless = check({
    'app/api/a/route.ts': "cookieStore.set({ name: 'session', value: '', maxAge: 0 });\n",
  });
  assert.equal(pathless.errors.length, 1);
  assert.match(pathless.errors[0], /the cookie survives/);
});

test('a sweep that stops finding cookie writes fails rather than passing empty', () => {
  const { errors } = check(
    { 'app/api/a/route.ts': 'export const GET = () => null;\n' },
    {
      minimumWrites: 1,
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected at least 1/);
});

test('tests and generated directories are never swept', () => {
  const { report } = check({
    'app/api/a/route.test.ts': "cookieStore.set('session', v, {});\n",
    'app/api/__tests__/a.ts': "cookieStore.set('session', v, {});\n",
    'app/api/node_modules/p/index.ts': "cookieStore.set('session', v, {});\n",
    'app/api/a/route.ts': GOOD_WRITE,
  });
  assert.equal(report.writes, 1);
});

test('the repository itself passes and the sweep reaches real files', () => {
  const files = sourceFiles(REPO_ROOT, COOKIE_ROOTS);
  assert.ok(files.length > 500, `swept ${files.length} files`);

  const { errors, report } = checkSessionCookieAttributes();
  assert.deepEqual(errors, []);
  assert.ok(report.writes >= 5, `found ${report.writes} cookie writes`);
});

test('every cookie write it finds is a real one, quoted back for the reader', () => {
  const writes = cookieWritesIn(
    "cookieStore.set('a', v, { path: '/' });\nconst greeting = 'hello; world';\n",
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0].text, /path/);
});

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  PERSONAL_SEGMENTS,
  REPO_ROOT,
  checkLogRedaction,
  classifyField,
  codeOfCall,
  loadBaseline,
  loggedFields,
  logCallSites,
  scan,
} from './check-log-redaction.mjs';
import { FIELDS_NEVER_LOGGED } from '../apps/web/lib/identity/log-hygiene.ts';
import { neverLoggedSet } from '../apps/web/lib/observability/log-field-policy.ts';

const roots = [];
const neverLogged = neverLoggedSet(FIELDS_NEVER_LOGGED);

function fixture({ files, baseline = { known: [] } }) {
  const root = mkdtempSync(path.join(tmpdir(), 'log-redaction-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(BASELINE_PATH)), { recursive: true });
  writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  for (const [relative, source] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a log call that names a person fails', () => {
  const root = fixture({
    files: { 'src/route.ts': "logger.warn({ userId, email: customer.email }, 'no match');" },
  });
  const { errors } = checkLogRedaction(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /names a person/);
  assert.match(errors[0], /src\/route\.ts:1/);
});

test('every declared personal segment is refused', () => {
  for (const segment of PERSONAL_SEGMENTS) {
    const root = fixture({ files: { 'src/route.ts': `logger.info({ customer_${segment} });` } });
    const { errors } = checkLogRedaction(root, ['src']);
    assert.equal(errors.length, 1, segment);
    assert.match(errors[0], /names a person/);
  }
});

test('a field the redactor throws away fails', () => {
  const root = fixture({
    files: { 'src/a.ts': "logger.error({ apiKey: provider.apiKey }, 'refused');" },
  });
  const { errors } = checkLogRedaction(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /replaces \n?with \[redacted\]|replaces with \[redacted\]/);
});

test('an identifier and a count pass', () => {
  const root = fixture({
    files: {
      'src/a.ts': [
        "logger.info({ idempotencyKey, objectKey: object.key }, 'settled');",
        "logger.info({ hasSecret: Boolean(secret), query: q.length }, 'unconfigured');",
        "logger.info({ revoked: result.revokedCount }, 'revoked');",
      ].join('\n'),
    },
  });
  const { errors } = checkLogRedaction(root, ['src']);
  assert.deepEqual(errors, []);
});

test('a baselined entry passes and an entry with no reason or fix fails', () => {
  const files = { 'src/a.ts': "logger.warn({ email: person.email }, 'x');" };
  const entry = { file: 'src/a.ts', field: 'email', reason: 'why', fix: 'how' };
  assert.deepEqual(
    checkLogRedaction(fixture({ files, baseline: { known: [entry] } }), ['src']).errors,
    [],
  );

  const noReason = { ...entry, reason: '  ' };
  const withoutReason = checkLogRedaction(fixture({ files, baseline: { known: [noReason] } }), [
    'src',
  ]);
  assert.ok(withoutReason.errors.some((error) => /carries no reason/.test(error)));

  const noFix = { ...entry, fix: '' };
  const withoutFix = checkLogRedaction(fixture({ files, baseline: { known: [noFix] } }), ['src']);
  assert.ok(withoutFix.errors.some((error) => /names no fix/.test(error)));
});

test('the baseline cannot keep an entry that no longer occurs', () => {
  const root = fixture({
    files: { 'src/a.ts': "logger.info({ userId }, 'ok');" },
    baseline: { known: [{ file: 'src/a.ts', field: 'email', reason: 'r', fix: 'f' }] },
  });
  const { errors } = checkLogRedaction(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer occurs/);
});

test('a scanned root with no product file fails rather than passing silently', () => {
  const { errors } = checkLogRedaction(fixture({ files: {} }), ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no product file was read/);
});

test('a name inside a message string is prose, and an interpolation is not a field', () => {
  assert.equal(codeOfCall("logger.info({ a }, 'the email failed')"), "logger.info({ a }, '')");
  const fields = loggedFields('logger.error(`${SLACK_SIGNING_SECRET_ENV} is not set`)');
  assert.deepEqual(
    fields.filter((field) => field.name === 'SLACK_SIGNING_SECRET_ENV'),
    [],
  );
});

test('call sites are found for every logger shape and nested calls do not repeat', () => {
  const sites = logCallSites(
    ['logger.info({ a }, one(two()));', 'console.error({ b });', 'log.debug({ c });'].join('\n'),
  );
  assert.deepEqual(
    sites.map((site) => site.line),
    [1, 2, 3],
  );
});

test('shorthand and explicit properties are both read', () => {
  const fields = loggedFields('logger.info({ apiKey, objectKey: row.key })');
  assert.deepEqual(
    fields.map((field) => field.name),
    ['apiKey', 'objectKey'],
  );
  assert.equal(classifyField(fields[0], neverLogged), 'redacted-field');
  assert.equal(classifyField(fields[1], neverLogged), null);
});

test('the guard measures the repository and its baseline accounts for every finding', () => {
  const { findings, files } = scan(REPO_ROOT);
  assert.ok(files > 500, `expected the web tree, read ${files} files`);
  const known = new Set(loadBaseline().known.map((entry) => `${entry.file}:${entry.field}`));
  for (const finding of findings) {
    assert.ok(known.has(`${finding.file}:${finding.field}`), `${finding.file} ${finding.field}`);
  }
  const { errors } = checkLogRedaction();
  assert.deepEqual(errors, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { quotingErrors } from './check-neon-migrations.mjs';

const path = 'apps/web/db/neon/0000_probe.sql';

test('a doubled apostrophe inside a literal is valid', () => {
  assert.deepEqual(quotingErrors(path, "insert into t values ('quarter''s numbers');"), []);
});

test('a bare apostrophe inside a literal is reported with its line', () => {
  const errors = quotingErrors(path, "insert into t values (\n  'quarter's numbers'\n);");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /:2 /);
  assert.match(errors[0], /never closed/);
});

test('dollar-quoted bodies may contain bare apostrophes', () => {
  const sql =
    "create function f() returns text as $$ select 'it''s'; select 'plain'; $$ language sql;";
  assert.deepEqual(quotingErrors(path, sql), []);
});

test('an unterminated dollar-quote is reported', () => {
  const errors = quotingErrors(path, 'create function f() as $body$ select 1;');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\$body\$/);
});

test('apostrophes inside line and block comments are ignored', () => {
  assert.deepEqual(quotingErrors(path, "-- the visitor's behalf\nselect 1;"), []);
  assert.deepEqual(quotingErrors(path, "/* the visitor's behalf */\nselect 1;"), []);
});

test('a doubled quote inside a quoted identifier is valid', () => {
  assert.deepEqual(quotingErrors(path, 'alter table "od""d" add column x int;'), []);
});

test('an unterminated block comment is reported', () => {
  const errors = quotingErrors(path, '/* never closed\nselect 1;');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /block comment/);
});

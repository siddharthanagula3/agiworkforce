import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REPO_ROOT,
  ROOT_MODULES,
  checkScheduleClockInjection,
  importClosure,
} from './check-schedule-clock-injection.mjs';

const roots = [];
const DIR = 'apps/web/lib/schedules';
const ROOT = [`${DIR}/schedule-time.ts`];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const TIME = `
import { nextDaypartStart } from './dayparts';
import { parseRecurrenceRule } from './recurrence-rule';

export function getNextExecutionAt(timing: ScheduleTiming, after: Date, now: Date = after): Date {
  return nextDaypartStart(after, timing.timezone) ?? new Date(now.getTime() + 60_000);
}
`;

const DAYPARTS = `
import { localParts } from './zoned-time';
export function nextDaypartStart(after: Date, timezone: string) {
  return localParts(timezone, after);
}
`;

const RECURRENCE = `
export function parseRecurrenceRule(rule: string) {
  return { rule };
}
`;

const ZONED = `
export function localParts(timezone: string, at: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}
`;

function fixture(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'schedule-clock-'));
  roots.push(root);
  write(root, `${DIR}/schedule-time.ts`, overrides.time ?? TIME);
  write(root, `${DIR}/dayparts.ts`, overrides.dayparts ?? DAYPARTS);
  write(root, `${DIR}/recurrence-rule.ts`, overrides.recurrence ?? RECURRENCE);
  write(root, `${DIR}/zoned-time.ts`, overrides.zoned ?? ZONED);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('walks the whole closure, not only the module it was pointed at', () => {
  const closure = importClosure(fixture(), ROOT).map((file) => path.basename(file));
  assert.deepEqual(closure.sort(), [
    'dayparts.ts',
    'recurrence-rule.ts',
    'schedule-time.ts',
    'zoned-time.ts',
  ]);
});

test('passes when every module takes the instant as an argument', () => {
  const { errors } = checkScheduleClockInjection(fixture(), ROOT);
  assert.deepEqual(errors, []);
});

test('fails on Date.now() in the module it was pointed at', () => {
  const time = TIME.replace('now.getTime()', 'Date.now()');
  const { errors } = checkScheduleClockInjection(fixture({ time }), ROOT);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /schedule-time\.ts:\d+ reads the clock directly \(Date\.now\(\)\)/);
});

test('fails on an ambient new Date() two imports deep', () => {
  const zoned = ZONED.replace('at)', 'at ?? new Date())');
  const { errors } = checkScheduleClockInjection(fixture({ zoned }), ROOT);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /zoned-time\.ts:\d+ reads the clock directly \(new Date\(\)\)/);
});

test('allows a Date built from a value the caller supplied', () => {
  const time = TIME.replace('new Date(now.getTime() + 60_000)', 'new Date(after.getTime())');
  const { errors } = checkScheduleClockInjection(fixture({ time }), ROOT);
  assert.deepEqual(errors, []);
});

test('reports a root that is not there rather than passing on an empty closure', () => {
  const { errors } = checkScheduleClockInjection(fixture(), [`${DIR}/absent.ts`]);
  assert.ok(errors.some((error) => /named as a root of the calculation/.test(error)));
  assert.ok(errors.some((error) => /closure is empty/.test(error)));
});

test('the repository itself satisfies the guard', () => {
  const { errors, report } = checkScheduleClockInjection(REPO_ROOT, ROOT_MODULES);
  assert.deepEqual(errors, []);
  assert.ok(report.modules >= 3);
});

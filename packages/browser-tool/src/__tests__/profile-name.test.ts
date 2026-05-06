/**
 * Regression tests for profile-name validation in `resolveProfileDir`.
 *
 * Background: prior versions accepted any string as a profile name and
 * `path.join`'d it onto the profile root. A name like `'../../tmp/poison'`
 * resolved outside the root, breaking the package's stated isolation
 * guarantee. These tests pin the regex + relative-path guard.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BrowserProfileNameError, resolveProfileDir } from '../profile';

let prevRoot: string | undefined;
let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'browser-tool-profile-'));
  prevRoot = process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'];
  process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = testRoot;
});

afterEach(async () => {
  if (prevRoot === undefined) delete process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'];
  else process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = prevRoot;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe('resolveProfileDir name validation', () => {
  it('rejects `../../tmp` traversal', () => {
    expect(() => resolveProfileDir('../../tmp')).toThrow(BrowserProfileNameError);
  });

  it('rejects names containing path separators', () => {
    expect(() => resolveProfileDir('agi/../escape')).toThrow(BrowserProfileNameError);
    expect(() => resolveProfileDir('agi\\\\escape')).toThrow(BrowserProfileNameError);
  });

  it('rejects names containing whitespace', () => {
    expect(() => resolveProfileDir('foo bar')).toThrow(BrowserProfileNameError);
  });

  it('rejects empty name', () => {
    expect(() => resolveProfileDir('')).toThrow(BrowserProfileNameError);
  });

  it('rejects names longer than 48 chars', () => {
    expect(() => resolveProfileDir('a'.repeat(49))).toThrow(BrowserProfileNameError);
  });

  it('rejects names with shell metachars', () => {
    expect(() => resolveProfileDir('foo;rm-rf')).toThrow(BrowserProfileNameError);
    expect(() => resolveProfileDir('foo|bar')).toThrow(BrowserProfileNameError);
    expect(() => resolveProfileDir('foo$bar')).toThrow(BrowserProfileNameError);
  });

  it('accepts a typical valid profile name', () => {
    const out = resolveProfileDir('valid-profile_1.test');
    expect(out).toBe(resolve(testRoot, 'valid-profile_1.test'));
  });

  it('accepts the implicit default name', () => {
    const out = resolveProfileDir();
    expect(out).toBe(resolve(testRoot, 'agiworkforce'));
  });

  it('error includes the offending name and code', () => {
    try {
      resolveProfileDir('../escape');
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(BrowserProfileNameError);
      const e = err as BrowserProfileNameError;
      expect(e.code).toBe('invalid_profile_name');
      expect(e.attemptedName).toBe('../escape');
    }
  });
});

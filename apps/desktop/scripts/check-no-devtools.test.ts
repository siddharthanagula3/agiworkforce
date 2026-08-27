import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  findDevtoolsActivation,
  parseCargoFeatureArgs,
  parseFeatureTable,
  resolveFeatureClosure,
  // @ts-expect-error -- plain ESM guard script, checked by its own assertions
} from './check-no-devtools.mjs';

const manifestText = readFileSync(
  path.resolve(import.meta.dirname, '../src-tauri/Cargo.toml'),
  'utf8',
);

describe('cargo feature table parsing', () => {
  it('reads the shipped manifest feature graph', () => {
    const table = parseFeatureTable(manifestText);
    expect(table.get('default')).toEqual(['shell', 'updater', 'billing', 'vad']);
    expect(table.get('devtools')).toEqual(['tauri/devtools']);
  });

  it('ignores assignments outside the features table', () => {
    const table = parseFeatureTable('[dependencies]\ndevtools = "1.0"\n[features]\nvad = []\n');
    expect(table.has('devtools')).toBe(false);
    expect(table.has('vad')).toBe(true);
  });

  it('reads a feature list spread over several lines', () => {
    const table = parseFeatureTable('[features]\nbig = [\n  "one",\n  "two",\n]\n');
    expect(table.get('big')).toEqual(['one', 'two']);
  });

  it('follows every hop of a feature chain', () => {
    const table = parseFeatureTable('[features]\na = ["b"]\nb = ["c"]\nc = []\n');
    expect([...resolveFeatureClosure(table, ['a'])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('terminates on a cyclic feature graph', () => {
    const table = parseFeatureTable('[features]\na = ["b"]\nb = ["a"]\n');
    expect([...resolveFeatureClosure(table, ['a'])].sort()).toEqual(['a', 'b']);
  });
});

describe('bundler feature argument parsing', () => {
  it('reads the comma list and the default-features switch the release jobs pass', () => {
    expect(
      parseCargoFeatureArgs(['--no-default-features', '--features', 'shell,updater,billing,vad']),
    ).toEqual({
      requested: ['shell', 'updater', 'billing', 'vad'],
      noDefaultFeatures: true,
    });
  });

  it('reads the inline and package-qualified forms clippy lanes use', () => {
    expect(parseCargoFeatureArgs(['--features=agiworkforce-desktop/devtools']).requested).toEqual([
      'devtools',
    ]);
  });

  it('treats an absent --features as the default feature set', () => {
    expect(parseCargoFeatureArgs([])).toEqual({ requested: [], noDefaultFeatures: false });
  });
});

describe('devtools activation guard', () => {
  it('rejects the feature set the Windows installer was built with', () => {
    const { requested, noDefaultFeatures } = parseCargoFeatureArgs([
      '--no-default-features',
      '--features',
      'shell,updater,billing,devtools,vad,remote-databases',
    ]);
    expect(findDevtoolsActivation(manifestText, requested, { noDefaultFeatures })).toContain(
      'devtools',
    );
  });

  it('accepts the release feature set with devtools removed', () => {
    const { requested, noDefaultFeatures } = parseCargoFeatureArgs([
      '--no-default-features',
      '--features',
      'shell,updater,billing,vad',
    ]);
    expect(findDevtoolsActivation(manifestText, requested, { noDefaultFeatures })).toEqual([]);
  });

  it('keeps the manifest default feature set free of the inspector', () => {
    expect(findDevtoolsActivation(manifestText, [], { noDefaultFeatures: false })).toEqual([]);
  });

  it('catches devtools reached through an intermediate feature, which a grep cannot', () => {
    const chained = '[features]\ndefault = ["shell"]\nshell = ["hop"]\nhop = ["devtools"]\n';
    expect(findDevtoolsActivation(chained, [], { noDefaultFeatures: false })).toContain('devtools');
  });
});

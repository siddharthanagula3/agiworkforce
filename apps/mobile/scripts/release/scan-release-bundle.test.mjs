import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  readLegalAttributionBodies,
  readProductionOrigins,
  parseHermesStrings,
  scanBundleDirectory as scanDirectory,
  scanText,
} from './scan-release-bundle.mjs';

const ORIGINS = ['https://agiworkforce.com', 'https://api.agiworkforce.com'];
const require = createRequire(import.meta.url);

function scanBundleDirectory(directory) {
  return scanDirectory(directory, ORIGINS);
}

const CLEAN_BUNDLE = `
var API_URL="https://agiworkforce.com";
var GATEWAY_URL="https://api.agiworkforce.com";
var CLERK_KEY="pk_live_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ";
`;

function bundleDirectory(files) {
  const directory = mkdtempSync(join(tmpdir(), 'release-bundle-'));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  return directory;
}

function bytecodeDirectory(source) {
  const directory = bundleDirectory({});
  const sourcePath = join(mkdtempSync(join(tmpdir(), 'release-bytecode-source-')), 'index.js');
  const bytecodePath = join(directory, 'index.hbc');
  const reactNativePackage = require.resolve('react-native/package.json');
  const compilerPackage = dirname(
    require.resolve('hermes-compiler/package.json', { paths: [reactNativePackage] }),
  );
  const binaryDirectory = { darwin: 'osx-bin', linux: 'linux64-bin', win32: 'win64-bin' }[
    process.platform
  ];
  const compiler = join(
    compilerPackage,
    'hermesc',
    binaryDirectory,
    process.platform === 'win32' ? 'hermesc.exe' : 'hermesc',
  );
  writeFileSync(sourcePath, source);
  const compiled = spawnSync(compiler, ['-emit-binary', `-out=${bytecodePath}`, sourcePath], {
    encoding: 'utf8',
  });
  assert.equal(compiled.status, 0, compiled.stderr);
  return directory;
}

test('a production bundle that resolves to the production backend passes', () => {
  const directory = bundleDirectory({ '_expo/static/js/ios/index.js': CLEAN_BUNDLE });

  const { scannedFiles, problems } = scanBundleDirectory(directory);

  assert.equal(problems.length, 0);
  assert.equal(scannedFiles, 1);
});

test("the release workflow scanner accepts pnpm's argument separator", () => {
  const directory = bundleDirectory({ '_expo/static/js/ios/index.js': CLEAN_BUNDLE });
  const result = spawnSync(
    process.execPath,
    [new URL('./scan-release-bundle.mjs', import.meta.url).pathname, '--', directory],
    {
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file\(s\) clean/u);
});

test('a development server URL fails the scan', () => {
  const directory = bundleDirectory({
    'index.js': `${CLEAN_BUNDLE}var DEV="http://localhost:8081";`,
  });

  const { problems } = scanBundleDirectory(directory);

  assert.ok(problems.some((problem) => problem.finding.includes('localhost')));
});

test('a development server URL adjacent to Hermes string-table bytes fails the scan', () => {
  assert.deepEqual(scanText('prefixhttp://localhost:8081/path'), [
    'a localhost endpoint',
    'a cleartext URL (localhost:8081)',
  ]);
});

test('an unparseable cleartext string fails the scan without crashing it', () => {
  assert.deepEqual(scanText('http://*[sS]*?*/*openai/media_assets://'), [
    'a cleartext URL (unparseable)',
  ]);
});

test('a test API endpoint fails the scan', () => {
  const directory = bundleDirectory({
    'index.js': `${CLEAN_BUNDLE}var API="https://staging.agiworkforce.com";`,
  });

  const { problems } = scanBundleDirectory(directory);

  assert.ok(problems.some((problem) => problem.finding.includes('staging')));
});

test('an embedded secret fails the scan and is never printed', () => {
  const findings = scanText('const key = "sk_live_0123456789abcdefghij";');

  assert.deepEqual(findings, ['a Clerk secret key']);
});

test('every secret shape the release must not carry is caught', () => {
  assert.deepEqual(scanText('pk_test_abcdefghij'), ['a Clerk test key']);
  assert.deepEqual(scanText('AKIAIOSFODNN7EXAMPLE'), ['an AWS access key id']);
  assert.deepEqual(scanText('ghp_0123456789abcdefghijklmnopqrstuv'), ['a GitHub token']);
  assert.deepEqual(scanText('-----BEGIN PRIVATE KEY-----'), ['a private key']);
  assert.deepEqual(scanText('{"type": "service_account"}'), ['a Google service account key']);
});

test('a bundle pointing at no production backend fails rather than passing empty', () => {
  const directory = bundleDirectory({ 'index.js': 'var nothing = 1;' });

  const { problems } = scanBundleDirectory(directory);

  assert.ok(problems.some((problem) => problem.finding.includes('no production backend')));
});

test('an empty export directory fails instead of reporting a clean scan', () => {
  const directory = bundleDirectory({});

  const { problems } = scanBundleDirectory(directory);

  assert.ok(problems.some((problem) => problem.finding.includes('nothing was verified')));
});

test('Hermes bytecode is scanned, and a source map is not', () => {
  const withBytecode = bytecodeDirectory(`${CLEAN_BUNDLE}var DEV="http://localhost:8081/custom";`);

  assert.ok(
    scanBundleDirectory(withBytecode).problems.some((problem) =>
      problem.finding.includes('localhost'),
    ),
  );

  const withMapOnly = bundleDirectory({
    'index.js': CLEAN_BUNDLE,
    'index.js.map': '{"sourcesContent":["// talk to http://localhost:8081 in dev"]}',
  });

  assert.deepEqual(scanBundleDirectory(withMapOnly).problems, []);
});

test('a complete generated legal attribution is data, while another cleartext URL still fails', () => {
  const bodies = readLegalAttributionBodies(
    readFileSync(
      new URL('../../src/features/legal/licenses.generated.ts', import.meta.url),
      'utf8',
    ),
  );
  const attribution = bodies.find((body) => body.includes('http://www.cwi.nl'));
  assert.ok(attribution);
  const directory = bytecodeDirectory(`${CLEAN_BUNDLE}var NOTICE=${JSON.stringify(attribution)};`);
  assert.deepEqual(scanBundleDirectory(directory).problems, []);

  const withExtraUrl = bytecodeDirectory(
    `${CLEAN_BUNDLE}var NOTICE=${JSON.stringify(attribution)};var ENDPOINT="http://untrusted.example/";`,
  );
  assert.ok(
    scanBundleDirectory(withExtraUrl).problems.some((problem) =>
      problem.finding.includes('cleartext URL'),
    ),
  );
});

test('Hermes string parsing refuses a truncated dump', () => {
  assert.throws(
    () => parseHermesStrings('String count: 1\nGlobal String Table:\n'),
    /complete global string table/u,
  );
});

test('the production backends come from the app constants, not from this script', () => {
  const constants = [
    "export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://agiworkforce.com';",
    "export const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL ?? 'https://api.agiworkforce.com';",
  ].join('\n');

  assert.deepEqual(readProductionOrigins(constants), ORIGINS);
  assert.throws(
    () => readProductionOrigins('export const API_URL = process.env.EXPO_PUBLIC_API_URL;'),
    /could not read the production API_URL/u,
  );
});

test('XML namespaces are not mistaken for a cleartext endpoint', () => {
  assert.deepEqual(scanText('xmlns="http://www.w3.org/2000/svg"'), []);
  assert.deepEqual(scanText('"http://schemas.android.com/apk/res/android"'), []);
});

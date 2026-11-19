import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  readLegalAttributionBodies,
  readLegalAttributionFields,
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
  return bytecodeBundles({ 'index.hbc': source });
}

function bytecodeBundles(bundles) {
  const directory = bundleDirectory({});
  for (const [name, source] of Object.entries(bundles)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    compileBytecode(source, join(directory, name));
  }
  return directory;
}

function findings(directory) {
  return scanBundleDirectory(directory).problems.map((problem) => problem.finding);
}

function compileBytecode(source, bytecodePath) {
  const sourcePath = join(mkdtempSync(join(tmpdir(), 'release-bytecode-source-')), 'index.js');
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

test('the Word export and media provenance identifiers are accepted, and lookalikes are not', () => {
  for (const identifier of [
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    'http://schemas.microsoft.com/office/word/2010/wordml',
    'http://purl.org/dc/elements/1.1/',
    'http://ns.adobe.com/xap/1.0/\0',
    'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  ]) {
    assert.deepEqual(scanText(identifier), [], identifier);
  }
  for (const [endpoint, host] of [
    ['http://schemas.microsoft.com.evil.example/', 'schemas.microsoft.com.evil.example'],
    ['http://schemas.microsoft.com/api/upload', 'schemas.microsoft.com'],
    ['http://schemas.openxmlformats.org.evil.example/x', 'schemas.openxmlformats.org.evil.example'],
    ['http://purl.org/not-dc/x', 'purl.org'],
    ['http://purl.org/dcx/x', 'purl.org'],
    ['http://ns.adobe.com/xap/2.0/', 'ns.adobe.com'],
    ['http://cv.iptc.org/newscodes/other/', 'cv.iptc.org'],
    ['http://cv.iptc.org.evil.example/newscodes/digitalsourcetype/', 'cv.iptc.org.evil.example'],
  ]) {
    assert.deepEqual(scanText(endpoint), [`a cleartext URL (${host})`], endpoint);
  }
});

test('a package link from the generated attribution is data, and a lookalike is not', () => {
  const fields = readLegalAttributionFields(
    readFileSync(
      new URL('../../src/features/legal/licenses.generated.ts', import.meta.url),
      'utf8',
    ),
  );
  const attributedLinks = fields
    .flatMap((field) => field.split(/[\s()]+/))
    .flatMap((token) => {
      try {
        return [new URL(token)];
      } catch {
        return [];
      }
    });
  const isAttributedLink = (host, pathname) =>
    attributedLinks.some(
      (link) => link.protocol === 'http:' && link.host === host && link.pathname === pathname,
    );
  assert.ok(isAttributedLink('github.com', '/brix/crypto-js'));
  assert.ok(isAttributedLink('github.com', '/productiontype/Newsreader'));

  const attributed = bytecodeDirectory(
    `${CLEAN_BUNDLE}var LINKS=${JSON.stringify(fields.filter((field) => field.includes('http://')))};`,
  );
  assert.deepEqual(scanBundleDirectory(attributed).problems, []);

  for (const lookalike of [
    'http://github.com/brix/crypto-js/raw/main/payload',
    'http://github.com/attacker/crypto-js',
    'see http://github.com/brix/crypto-js',
  ]) {
    assert.deepEqual(
      findings(bytecodeDirectory(`${CLEAN_BUNDLE}var LINK=${JSON.stringify(lookalike)};`)),
      ['a cleartext URL (github.com)'],
      lookalike,
    );
  }
});

test('attribution text is exempt from the cleartext check only', () => {
  assert.deepEqual(scanText('http://localhost:8081/', { includeCleartext: false }), [
    'a localhost endpoint',
  ]);
  assert.deepEqual(scanText('pk_test_abcdefghij http://x.example/', { includeCleartext: false }), [
    'a Clerk test key',
  ]);
});

test('each platform bundle may carry the React Native dev-server fallback once', () => {
  const fallback = 'var DEV="http://localhost:8081/";';
  const bothPlatforms = bytecodeBundles({
    'ios/index.hbc': `${CLEAN_BUNDLE}${fallback}`,
    'android/index.hbc': `${CLEAN_BUNDLE}${fallback}`,
  });

  assert.deepEqual(scanBundleDirectory(bothPlatforms).problems, []);
});

test('a second localhost address beside the fallback in one bundle still fails', () => {
  const directory = bytecodeBundles({
    'ios/index.hbc': `${CLEAN_BUNDLE}var DEV="http://localhost:8081/";`,
    'android/index.hbc': `${CLEAN_BUNDLE}var DEV="http://localhost:8081/";var OTHER="http://localhost:8081/api";`,
  });

  const { problems } = scanBundleDirectory(directory);

  assert.ok(
    problems.some(
      (problem) =>
        problem.file === join('android', 'index.hbc') && problem.finding === 'a localhost endpoint',
    ),
  );
  assert.ok(!problems.some((problem) => problem.file === join('ios', 'index.hbc')));
});

test('a Clerk test key or a staging host in Hermes bytecode fails the scan', () => {
  assert.ok(
    findings(bytecodeDirectory(`${CLEAN_BUNDLE}var KEY="pk_test_Y2xlcmsuZXhhbXBsZSQ";`)).includes(
      'a Clerk test key',
    ),
  );
  assert.ok(
    findings(
      bytecodeDirectory(`${CLEAN_BUNDLE}var API="https://staging.agiworkforce.com";`),
    ).includes('a staging or preview backend'),
  );
});

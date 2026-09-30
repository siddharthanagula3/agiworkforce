#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const MOBILE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEGAL_BODIES_PATH = join(MOBILE_ROOT, 'src', 'features', 'legal', 'licenses.generated.ts');
const require = createRequire(import.meta.url);

export function readLegalAttributionBodies(source) {
  const file = ts.createSourceFile('licenses.generated.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements
    .flatMap((statement) =>
      ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
    )
    .find((entry) => entry.name.getText(file) === 'OSS_LICENSE_BODIES');
  if (!declaration || !ts.isObjectLiteralExpression(declaration.initializer)) {
    throw new Error('could not read generated legal attribution bodies');
  }
  return declaration.initializer.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
      throw new Error('generated legal attribution contains an unexpected body');
    }
    return property.initializer.text;
  });
}

function maskLegalAttribution(text, bodies) {
  let masked = text;
  for (const body of bodies) {
    if (body.includes('http://')) masked = masked.replace(body, '\0'.repeat(body.length));
  }
  return masked;
}

/**
 * The backends the app actually ships with, read from lib/constants.ts rather
 * than restated here, so a moved host cannot leave this guard checking the old
 * one. An unreadable constant fails instead of assuming.
 */
export function readProductionOrigins(constantsSource) {
  const origins = [];
  for (const name of ['API_URL', 'GATEWAY_URL']) {
    const match = constantsSource.match(
      new RegExp(`export const ${name}[^=]*=[^?]*\\?\\?\\s*'(https://[^']+)'`, 'u'),
    );
    if (!match) throw new Error(`could not read the production ${name} from lib/constants.ts`);
    origins.push(match[1]);
  }
  return origins;
}

// Source maps carry source comments and never reach the archive.
const SCANNED_EXTENSIONS = new Set([
  '.js',
  '.hbc',
  '.bundle',
  '.json',
  '.html',
  '.txt',
  '.plist',
  '.xml',
]);
const BINARY_EXTENSIONS = new Set(['.hbc', '.bundle']);
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const HERMES_DUMP_MAX_BYTES = 256 * 1024 * 1024;

const HERMES_REFERENCE_HASHES = new Set([
  'c7860bb2e8c3fe3bf9a55cee64fabf7454c72edacc6f3c6e84a9eab5471e5b8b',
  '75fd46f6966570b4f843f7bc8be80c2d6b666d17734322822e26511e49d7a547',
  '5d1222845e6d8f706cf3c619195af0b4631d4a5bcf410dfab4ea233bf6fd63b6',
  '1bcec1d1b7c10699bd882719e6a1eb7fc5468002830ac87fe5d5ac1abf22e2e9',
  'e865402243566540f70eb58aa7694e0c7b802031d3c0994335cc2c43dfbd0d6a',
  '9b620462e4554bbd37282ac6607e86a3b7b5b4c09e891553fcc8593691fb7d3b',
  'dd47c910e24e3a8b465584a63ff52f40333082add135aba120c93203b2536901',
  '8c8dac95aa0a16cdc1d9219faf6edef368449abe8bc11404601ca000013efe9d',
  'e8784fffe0498e4aed52d83b318a58ba810512ca0a80a7651bcd630f742a242c',
  '21652b0fc5f7a66a17c1fcd783c57f0bda57806528a4238e09684828a851b170',
  '0e5178f5dcc20d0b0c03a2996580308beaaad626bec2d6379bfa2e09aec87622',
  'df37e04c89e1dc317a2c91193d47704984a0287225318c58a2fe28809b885a58',
  '9f06b2ae1ae6dd13b36990eced1f16cb4434ab2402d57be729b18e29790697ae',
  '95483243f2c760d02ce9f8eba064a77a81b68b90dcc9962bb4d02bc71b0863f6',
  '10e6b7602e9b3aa457b8eda6495b700968c6f83bcfcb9605d07671e3fa503a12',
  'e4ad626d05172b6fef3f148f18b151616042092f4436902575d491b3d048949d',
  '44a584c9b7094b10b671922cf9e8773f31cb701fc86f05f1cb14d9d2bdb088cd',
  '47516097ab4b76a2085e69ed0427fe09300ccea46a051f8089320c54e4acf7db',
  '580bf6fee1950375a1ec9ee378591b4b4546201905009024d2c120c0faafa924',
  'a946d26fd836393616ea6ca001ebc1d705eb925f6a655ab1f6ae5148ceeb80cf',
]);
const HERMES_DEVELOPMENT_FALLBACK_HASHES = new Set([
  '6b79a1fa134b9d6750459d4e2e91a81378b1a7c1056bd275d0880ba68d86e99d',
  'f1de9e489ba88cb15968b97f40f59e8ef0da5ca03ad1f37fc13a2aa45a2512a9',
]);

const HERMES_DEVELOPMENT_FALLBACK_OWNERS = new Map([
  [
    '6b79a1fa134b9d6750459d4e2e91a81378b1a7c1056bd275d0880ba68d86e99d',
    ['react-native', 'Libraries/Core/Devtools/getDevServer.js', 'http://localhost:8081/'],
  ],
  [
    'f1de9e489ba88cb15968b97f40f59e8ef0da5ca03ad1f37fc13a2aa45a2512a9',
    ['expo-router', 'build/head/url.js', 'http://localhost:3000'],
  ],
]);

function hermesCompilerPath() {
  const reactNativePackage = require.resolve('react-native/package.json');
  const packageDirectory = dirname(
    require.resolve('hermes-compiler/package.json', { paths: [reactNativePackage] }),
  );
  const binaryDirectory = {
    darwin: 'osx-bin',
    linux: 'linux64-bin',
    win32: 'win64-bin',
  }[process.platform];
  if (!binaryDirectory) throw new Error(`unsupported Hermes scanner platform: ${process.platform}`);
  return join(
    packageDirectory,
    'hermesc',
    binaryDirectory,
    process.platform === 'win32' ? 'hermesc.exe' : 'hermesc',
  );
}

export function parseHermesStrings(dump) {
  const count = Number(dump.match(/^  String count: (\d+)$/mu)?.[1]);
  const start = dump.indexOf('Global String Table:\n');
  if (!Number.isSafeInteger(count) || start < 0) {
    throw new Error('Hermes dump has no complete global string table');
  }
  const entries = dump
    .slice(start + 'Global String Table:\n'.length)
    .split('\n')
    .slice(0, count);
  if (entries.length !== count || entries.some((line) => !/^[si]\d+\[/u.test(line))) {
    throw new Error('Hermes string table count does not match bytecode header');
  }
  return entries.map((line) => {
    const separator = line.indexOf(': ');
    if (separator < 0) throw new Error('Hermes string entry has no value');
    return line
      .slice(separator + 2)
      .replace(/\\x([0-9A-F]{2})/gu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\');
  });
}

function readHermesStrings(file) {
  const result = spawnSync(hermesCompilerPath(), ['-b', '-dump-bytecode', file], {
    encoding: 'latin1',
    maxBuffer: HERMES_DUMP_MAX_BYTES,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Hermes bytecode inspection failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`,
    );
  }
  return parseHermesStrings(result.stdout);
}

function inspectDevelopmentFallbacks(seenDevelopmentFallbacks) {
  const findings = [];
  for (const [hash, count] of seenDevelopmentFallbacks) {
    const [packageName, sourcePath, literal] = HERMES_DEVELOPMENT_FALLBACK_OWNERS.get(hash);
    const packageRoot = dirname(require.resolve(`${packageName}/package.json`));
    if (count !== 1 || !readFileSync(join(packageRoot, sourcePath), 'utf8').includes(literal)) {
      findings.push(
        `Hermes development fallback ${hash.slice(0, 12)} cannot be attributed to its dependency`,
      );
    }
  }
  for (const sourceDirectory of ['app', 'src', 'lib', 'services']) {
    for (const file of walk(join(MOBILE_ROOT, sourceDirectory))) {
      if (
        !/\.[jt]sx?$/u.test(file) ||
        /(?:\.test\.|__tests__)/u.test(file) ||
        file === LEGAL_BODIES_PATH
      )
        continue;
      if (
        /http:\/\/|https:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)\b/iu.test(
          readFileSync(file, 'utf8'),
        )
      ) {
        findings.push(
          `mobile source contains a cleartext or development endpoint: ${relative(MOBILE_ROOT, file)}`,
        );
      }
    }
  }
  return findings;
}

// Namespaces and DTDs are URLs that are never fetched, so a cleartext match on
// one of them is not a dev server.
const CLEARTEXT_ALLOWED = [
  'http://www.w3.org/',
  'http://www.apple.com/DTDs/',
  'http://schemas.android.com/',
  'http://www.google.com/',
  'http://json-schema.org/',
  'http://www.openarchives.org/',
];

export const FORBIDDEN_PATTERNS = Object.freeze([
  {
    name: 'a localhost endpoint',
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/iu,
  },
  { name: 'an Android emulator host', pattern: /\bhttps?:\/\/10\.0\.2\.2\b/u },
  { name: 'a LAN development host', pattern: /\bhttps?:\/\/(?:192\.168|10\.)\d[\d.]*:\d+/u },
  { name: 'a Metro development server', pattern: /\b(?:exp|exps):\/\//u },
  {
    name: 'a tunnelled development server',
    pattern: /\b[\w-]+\.(?:ngrok(?:-free)?\.(?:io|app)|trycloudflare\.com)\b/u,
  },
  {
    name: 'a staging or preview backend',
    pattern: /https:\/\/[\w-]*(?:staging|preview|sandbox|test)[\w-]*\.agiworkforce\.com/iu,
  },
  { name: 'a Clerk test key', pattern: /\bpk_test_[A-Za-z0-9]/u },
  { name: 'a Clerk secret key', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]/u },
  { name: 'an OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9]{20}/u },
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20}/u },
  { name: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9]/u },
  { name: 'a Google service account key', pattern: /"type"\s*:\s*"service_account"/u },
  { name: 'a private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
]);

function cleartextFindings(text) {
  const matches = text.match(/http:\/\/[^\s"'`<>\\]+/gu) ?? [];
  return matches.filter((url) => !CLEARTEXT_ALLOWED.some((allowed) => url.startsWith(allowed)));
}

export function scanText(text, { includeEndpoints = true } = {}) {
  const findings = [];
  for (const { name, pattern } of includeEndpoints
    ? FORBIDDEN_PATTERNS
    : FORBIDDEN_PATTERNS.slice(6)) {
    if (pattern.test(text)) findings.push(name);
  }
  const cleartext = includeEndpoints ? cleartextFindings(text) : [];
  if (cleartext.length > 0) {
    let host = 'unparseable';
    try {
      host = new URL(cleartext[0]).host;
    } catch {
      // Hermes may place unrelated strings adjacent to a URL in its string table.
    }
    findings.push(`a cleartext URL (${host})`);
  }
  return findings;
}

export function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export function scanBundleDirectory(directory, productionOrigins) {
  const problems = [];
  let scannedFiles = 0;
  let sawProductionOrigin = false;
  const legalBodies = readLegalAttributionBodies(readFileSync(LEGAL_BODIES_PATH, 'utf8'));
  const legalBodySet = new Set(legalBodies);
  const seenDevelopmentFallbacks = new Map();

  for (const file of walk(directory)) {
    if (!SCANNED_EXTENSIONS.has(extname(file))) continue;
    if (statSync(file).size > MAX_FILE_BYTES) {
      problems.push({ file: relative(directory, file), finding: 'a file too large to scan' });
      continue;
    }
    const extension = extname(file);
    const text = readFileSync(file, BINARY_EXTENSIONS.has(extension) ? 'latin1' : 'utf8');
    scannedFiles += 1;
    if (productionOrigins.some((origin) => text.includes(origin))) sawProductionOrigin = true;
    // Only the complete, generated attribution body is masked; a second URL
    // occurrence remains visible to the endpoint and secret checks.
    const inspected = BINARY_EXTENSIONS.has(extension)
      ? maskLegalAttribution(text, legalBodies)
      : text;
    for (const finding of scanText(inspected, { includeEndpoints: extension !== '.hbc' })) {
      problems.push({ file: relative(directory, file), finding });
    }
    if (extension !== '.hbc') continue;
    try {
      for (const entry of readHermesStrings(file)) {
        if (legalBodySet.has(entry)) continue;
        const hash = createHash('sha256').update(entry).digest('hex');
        if (HERMES_REFERENCE_HASHES.has(hash)) continue;
        if (HERMES_DEVELOPMENT_FALLBACK_HASHES.has(hash)) {
          seenDevelopmentFallbacks.set(hash, (seenDevelopmentFallbacks.get(hash) ?? 0) + 1);
          continue;
        }
        for (const finding of scanText(entry)) {
          problems.push({ file: relative(directory, file), finding });
        }
      }
    } catch (error) {
      problems.push({ file: relative(directory, file), finding: error.message });
    }
  }

  for (const finding of inspectDevelopmentFallbacks(seenDevelopmentFallbacks)) {
    problems.push({ file: '.', finding });
  }

  if (scannedFiles === 0) {
    problems.push({ file: '.', finding: 'no bundle files to scan, so nothing was verified' });
  } else if (!sawProductionOrigin) {
    problems.push({
      file: '.',
      finding: `no production backend (${productionOrigins[0]}) in the bundle`,
    });
  }

  return { scannedFiles, problems };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const directory = process.argv[2] === '--' ? process.argv[3] : process.argv[2];
  if (!directory) {
    console.error('[scan-release-bundle] ERROR: pass the exported bundle directory');
    process.exit(1);
  }
  const origins = readProductionOrigins(
    readFileSync(join(MOBILE_ROOT, 'lib', 'constants.ts'), 'utf8'),
  );
  const { scannedFiles, problems } = scanBundleDirectory(directory, origins);
  for (const { file, finding } of problems) {
    console.error(`[scan-release-bundle] ${file}: ${finding}`);
  }
  if (problems.length > 0) {
    console.error(`[scan-release-bundle] ERROR: ${problems.length} problem(s) in ${directory}`);
    process.exit(1);
  }
  console.log(
    `[scan-release-bundle] ${scannedFiles} file(s) clean, ${origins[0]} present in the bundle`,
  );
}

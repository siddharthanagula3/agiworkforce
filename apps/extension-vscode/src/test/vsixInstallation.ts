import { timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export interface ExtensionIdentity {
  name: string;
  publisher: string;
  version: string;
}

export interface ExtensionHostTestRunner {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Could not parse JSON file ${filePath}: ${String(error)}`);
  }
}

function readManifestIdentity(manifestPath: string): ExtensionIdentity | undefined {
  const value = readJsonFile(manifestPath);
  if (!isRecord(value)) return undefined;
  const { name, publisher, version } = value;
  if (typeof name !== 'string' || typeof publisher !== 'string' || typeof version !== 'string') {
    return undefined;
  }
  return { name, publisher, version };
}

function listRegularFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const metadata = fs.lstatSync(absolutePath);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Installed extension contains a symbolic link: ${absolutePath}`);
      }
      if (metadata.isDirectory()) visit(absolutePath);
      else if (metadata.isFile()) files.push(path.relative(root, absolutePath));
      else throw new Error(`Installed extension contains a non-file entry: ${absolutePath}`);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function buffersMatch(left: Buffer, right: Buffer): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function verifyInstalledPackageJson(extractedPath: string, installedPath: string): void {
  const extracted = readJsonFile(extractedPath);
  const installed = readJsonFile(installedPath);
  if (!isRecord(extracted) || !isRecord(installed)) {
    throw new Error('VSIX package.json must contain a JSON object');
  }

  const { __metadata: metadata, ...installedManifest } = installed;
  if (metadata !== undefined && !isRecord(metadata)) {
    throw new Error('VS Code attached malformed installation metadata to package.json');
  }
  if (!isDeepStrictEqual(installedManifest, extracted)) {
    throw new Error('Installed package.json differs from the verified VSIX manifest');
  }
}

export function verifyPublicExtensionList(output: string, identity: ExtensionIdentity): void {
  const installed = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const expected = `${identity.publisher}.${identity.name}@${identity.version}`.toLowerCase();
  const matches = installed.filter((entry) => entry.toLowerCase() === expected);
  if (matches.length !== 1) {
    throw new Error(
      `VS Code public extension listing did not contain exactly one ${expected}: ${JSON.stringify(installed)}`,
    );
  }
}

export function findInstalledExtensionRoot(
  extensionsDirectory: string,
  identity: ExtensionIdentity,
): string {
  const matches: string[] = [];
  for (const entry of fs.readdirSync(extensionsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extensionsDirectory, entry.name);
    const manifestPath = path.join(candidate, 'package.json');
    if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) continue;
    const candidateIdentity = readManifestIdentity(manifestPath);
    if (
      candidateIdentity?.publisher === identity.publisher &&
      candidateIdentity.name === identity.name &&
      candidateIdentity.version === identity.version
    ) {
      matches.push(fs.realpathSync(candidate));
    }
  }
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected one installed ${identity.publisher}.${identity.name}@${identity.version}, found ${matches.length}`,
    );
  }
  return match;
}

export function verifyInstalledExtension(
  extractedExtensionRoot: string,
  extractedVsixManifestPath: string,
  installedExtensionRoot: string,
): void {
  const expectedFiles = listRegularFiles(extractedExtensionRoot);
  const installedFiles = listRegularFiles(installedExtensionRoot);
  const expectedInstalledFiles = [...expectedFiles, '.vsixmanifest'].sort((left, right) =>
    left.localeCompare(right),
  );
  if (!isDeepStrictEqual(installedFiles, expectedInstalledFiles)) {
    throw new Error(
      `Installed extension file set differs from the verified VSIX:\nexpected=${JSON.stringify(expectedInstalledFiles)}\nactual=${JSON.stringify(installedFiles)}`,
    );
  }

  for (const relativePath of expectedFiles) {
    const extractedPath = path.join(extractedExtensionRoot, relativePath);
    const installedPath = path.join(installedExtensionRoot, relativePath);
    if (relativePath === 'package.json') {
      verifyInstalledPackageJson(extractedPath, installedPath);
      continue;
    }
    if (!buffersMatch(fs.readFileSync(extractedPath), fs.readFileSync(installedPath))) {
      throw new Error(`Installed extension file differs from the verified VSIX: ${relativePath}`);
    }
  }

  if (
    !buffersMatch(
      fs.readFileSync(extractedVsixManifestPath),
      fs.readFileSync(path.join(installedExtensionRoot, '.vsixmanifest')),
    )
  ) {
    throw new Error('Installed .vsixmanifest differs from the verified VSIX manifest');
  }
}

export function verifyInstalledExtensionRegistry(
  extensionsDirectory: string,
  installedExtensionRoot: string,
  identity: ExtensionIdentity,
): void {
  const registryPath = path.join(extensionsDirectory, 'extensions.json');
  const registry = readJsonFile(registryPath);
  if (!Array.isArray(registry)) {
    throw new Error(`VS Code extension registry is not an array: ${registryPath}`);
  }
  const extensionId = `${identity.publisher}.${identity.name}`;
  const matches = registry.filter((entry) => {
    if (!isRecord(entry) || !isRecord(entry.identifier)) return false;
    return entry.identifier.id === extensionId && entry.version === identity.version;
  });
  if (matches.length !== 1 || !isRecord(matches[0])) {
    throw new Error(`Expected one ${extensionId}@${identity.version} entry in extensions.json`);
  }
  const entry = matches[0];
  if (!isRecord(entry.location) || typeof entry.location.fsPath !== 'string') {
    throw new Error(`Installed ${extensionId} registry entry has no filesystem location`);
  }
  if (fs.realpathSync(entry.location.fsPath) !== fs.realpathSync(installedExtensionRoot)) {
    throw new Error(`Installed ${extensionId} registry entry points at unexpected bytes`);
  }
  if (!isRecord(entry.metadata) || entry.metadata.source !== 'vsix') {
    throw new Error(`Installed ${extensionId} registry entry is not marked as a VSIX install`);
  }
}

export function writeExtensionHostTestRunner(
  root: string,
  compiledTestRoot: string,
): ExtensionHostTestRunner {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'agi-vsix-e2e-runner',
        displayName: 'AGI VSIX E2E Runner',
        publisher: 'agiworkforce-test',
        version: '0.0.0',
        private: true,
        engines: { vscode: '^1.106.0' },
        activationEvents: ['*'],
        main: './extension.js',
      },
      null,
      2,
    )}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(root, 'extension.js'),
    "'use strict';\nexports.activate = function activate() {};\nexports.deactivate = function deactivate() {};\n",
    { flag: 'wx', mode: 0o600 },
  );

  const compiledFiles = [
    'localModelFixture.js',
    path.join('suite', 'extension.smoke.test.js'),
    path.join('suite', 'index.js'),
  ];
  const copiedTestRoot = path.join(root, 'out', 'test');
  for (const relativePath of compiledFiles) {
    const source = path.join(compiledTestRoot, relativePath);
    const metadata = fs.lstatSync(source);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Compiled Extension Host test must be a regular file: ${source}`);
    }
    const destination = path.join(copiedTestRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (process.platform !== 'win32') fs.chmodSync(destination, 0o600);
  }

  return {
    extensionDevelopmentPath: fs.realpathSync(root),
    extensionTestsPath: fs.realpathSync(path.join(copiedTestRoot, 'suite', 'index.js')),
  };
}

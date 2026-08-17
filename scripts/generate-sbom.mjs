#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CYCLONEDX_SPEC_VERSION = '1.6';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

export function parseCargoLock(contents) {
  const packages = [];
  for (const block of contents.split('[[package]]').slice(1)) {
    const entry = {};
    for (const line of block.split('\n')) {
      const match = /^(name|version|source)\s*=\s*"(.*)"$/u.exec(line.trim());
      if (match) {
        entry[match[1]] = match[2];
      }
      if (line.trim() === '' && entry.name && entry.version) {
        break;
      }
    }
    if (entry.name && entry.version) {
      packages.push(entry);
    }
  }
  return packages;
}

export function flattenPnpmTree(tree) {
  const found = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [name, entry] of Object.entries(node)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.version === 'string' && !entry.version.startsWith('link:')) {
        found.set(`${name}@${entry.version}`, { name, version: entry.version });
      }
      visit(entry.dependencies);
    }
  };
  for (const project of Array.isArray(tree) ? tree : [tree]) {
    if (!project || typeof project !== 'object') continue;
    visit(project.dependencies);
    visit(project.optionalDependencies);
  }
  return [...found.values()];
}

function npmPurl(name, version) {
  const encoded = name.startsWith('@')
    ? `${encodeURIComponent(name.split('/')[0])}/${name.split('/')[1]}`
    : name;
  return `pkg:npm/${encoded}@${version}`;
}

export function buildSbom({ component, version, cargoPackages, npmPackages }) {
  const components = [
    ...cargoPackages.map((entry) => ({
      type: 'library',
      name: entry.name,
      version: entry.version,
      purl: `pkg:cargo/${entry.name}@${entry.version}`,
      ...(entry.source
        ? { externalReferences: [{ type: 'distribution', url: entry.source }] }
        : {}),
    })),
    ...npmPackages.map((entry) => ({
      type: 'library',
      name: entry.name,
      version: entry.version,
      purl: npmPurl(entry.name, entry.version),
    })),
  ].sort((left, right) => left.purl.localeCompare(right.purl));

  return {
    bomFormat: 'CycloneDX',
    specVersion: CYCLONEDX_SPEC_VERSION,
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: component,
        version,
        purl: npmPurl(component, version),
      },
      tools: [{ name: 'agiworkforce-generate-sbom' }],
    },
    components,
  };
}

function readJsonIfPresent(filePath) {
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const required of ['component', 'version', 'out']) {
    if (!options[required]) {
      throw new Error(`--${required} is required`);
    }
  }

  const cargoLockPath = options['cargo-lock'];
  const cargoPackages = cargoLockPath ? parseCargoLock(fs.readFileSync(cargoLockPath, 'utf8')) : [];
  const npmTree = readJsonIfPresent(options['node-tree']);
  const npmPackages = npmTree ? flattenPnpmTree(npmTree) : [];

  if (cargoPackages.length === 0 && npmPackages.length === 0) {
    throw new Error('refusing to write an empty SBOM: no cargo or npm components were resolved');
  }

  const sbom = buildSbom({
    component: options.component,
    version: options.version,
    cargoPackages,
    npmPackages,
  });

  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(sbom, null, 2)}\n`);
  process.stdout.write(
    `${options.out}: ${sbom.components.length} components (${cargoPackages.length} cargo, ${npmPackages.length} npm)\n`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exit(1);
  }
}

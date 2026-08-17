#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SURFACE_MANIFESTS = [
  ['Mobile', 'apps/mobile/package.json'],
  ['Web', 'apps/web/package.json'],
  ['Desktop', 'apps/desktop/package.json'],
  ['Chrome Extension', 'apps/extension/package.json'],
  ['VS Code Extension', 'apps/extension-vscode/package.json'],
];

const CLI_MANIFEST = 'apps/cli/Cargo.toml';

const PROVIDER_LABELS = {
  managed_cloud: 'AGI managed cloud',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot',
  perplexity: 'Perplexity',
  zhipu: 'ZhipuAI',
  bedrock: 'AWS Bedrock',
  nvidia_nim: 'NVIDIA NIM',
  open_router: 'OpenRouter',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  llamacpp: 'llama.cpp',
  vllm: 'vLLM',
  runway: 'Runway',
  minimax: 'MiniMax',
};

function countPackages(root, dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules') continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(root, child, 'package.json'))) total += 1;
    total += countPackages(root, child);
  }
  return total;
}

function countCrates(root) {
  const absolute = path.join(root, 'crates');
  if (!fs.existsSync(absolute)) return 0;
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(absolute, entry.name, 'Cargo.toml')),
    ).length;
}

function readCargoVersion(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

export function collectFacts(root) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/contracts/types/src/models.json'), 'utf8'),
  );
  const providerKeys = Object.keys(catalog.providers ?? {});
  const adapterPackages = countPackages(root, 'packages/ai/providers');
  const versions = {};
  for (const [surface, manifest] of SURFACE_MANIFESTS) {
    const absolute = path.join(root, manifest);
    if (!fs.existsSync(absolute)) continue;
    versions[surface] = JSON.parse(fs.readFileSync(absolute, 'utf8')).version ?? null;
  }
  const cliVersion = readCargoVersion(root, CLI_MANIFEST);
  if (cliVersion) versions.CLI = cliVersion;
  const rootManifestPath = path.join(root, 'package.json');
  const rootManifest = fs.existsSync(rootManifestPath)
    ? JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'))
    : {};
  return {
    repositoryUrl: rootManifest.repository?.url ?? null,
    modelCount: Object.keys(catalog.models ?? {}).length,
    providerCount: providerKeys.length,
    providerLabels: providerKeys.map((key) => PROVIDER_LABELS[key] ?? key),
    unlabelledProviders: providerKeys.filter((key) => !PROVIDER_LABELS[key]),
    adapterPackages,
    sharedPackages: countPackages(root, 'packages') - adapterPackages,
    crateCount: countCrates(root),
    versions,
  };
}

function claim(readme, pattern, label) {
  const match = readme.match(pattern);
  if (!match) return { label, missing: true };
  return { label, value: Number(match[1]) };
}

export function collectReadmeFactErrors(readme, facts) {
  const errors = [];
  const numeric = [
    [
      claim(readme, /unifies (\d+) catalog providers/, 'catalog provider count (intro)'),
      facts.providerCount,
    ],
    [claim(readme, /Catalog of (\d+) models/, 'catalog model count'), facts.modelCount],
    [
      claim(
        readme,
        /Catalog of \d+ models across (\d+) providers/,
        'catalog provider count (features)',
      ),
      facts.providerCount,
    ],
    [
      claim(readme, /(\d+) shared TypeScript packages/, 'shared TypeScript package count'),
      facts.sharedPackages,
    ],
    [
      claim(readme, /(\d+) per-provider adapter packages/, 'provider adapter package count'),
      facts.adapterPackages,
    ],
    [claim(readme, /(\d+) Rust crates/, 'Rust crate count'), facts.crateCount],
  ];

  for (const [found, expected] of numeric) {
    if (found.missing) {
      errors.push(`README.md no longer states its ${found.label}; the guard cannot verify it.`);
      continue;
    }
    if (found.value !== expected) {
      errors.push(
        `README.md states a ${found.label} of ${found.value}, but the repository has ${expected}.`,
      );
    }
  }

  for (const label of facts.providerLabels) {
    if (!readme.includes(label)) {
      errors.push(`README.md does not name the catalog provider ${label}.`);
    }
  }

  for (const key of facts.unlabelledProviders) {
    errors.push(
      `Catalog provider ${key} has no README label in PROVIDER_LABELS; add one and name it in README.md.`,
    );
  }

  const statusTable = readme.match(
    /^\|\s*Surface\s*\|\s*Version\s*\|\s*Status\s*\|$[\s\S]*?(?=\n\n)/m,
  )?.[0];
  if (!statusTable) {
    errors.push(
      'README.md no longer has a "| Surface | Version | Status |" table; the guard cannot verify versions.',
    );
  } else {
    for (const [surface, version] of Object.entries(facts.versions)) {
      const row = statusTable.match(
        new RegExp(`^\\|\\s*${surface}\\s*\\|\\s*([^|\\s]+)\\s*\\|`, 'm'),
      );
      if (!row) {
        errors.push(`README.md has no status-table row for ${surface}.`);
        continue;
      }
      if (row[1] !== version) {
        errors.push(`README.md lists ${surface} at ${row[1]}, but its manifest says ${version}.`);
      }
    }
  }

  if (/will be added here/i.test(readme)) {
    errors.push('README.md promises content that does not exist ("will be added here").');
  }

  const cloneUrl = readme.match(/git clone (https:\/\/github\.com\/\S+?)(?:\.git)?\s/)?.[1];
  if (!cloneUrl) {
    errors.push(
      'README.md has no `git clone https://github.com/...` line; the guard cannot verify the repository.',
    );
  } else if (!facts.repositoryUrl) {
    errors.push('package.json declares no repository.url.');
  } else if (facts.repositoryUrl.replace(/\.git$/, '') !== cloneUrl) {
    errors.push(
      `package.json repository.url is ${facts.repositoryUrl}, but README.md clones ${cloneUrl}. ` +
        'One of them points at a repository that is not this one.',
    );
  }

  return errors;
}

export function main() {
  const root = process.cwd();
  const readmePath = path.join(root, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.error('README.md not found.');
    process.exit(1);
  }
  const facts = collectFacts(root);
  const errors = collectReadmeFactErrors(fs.readFileSync(readmePath, 'utf8'), facts);

  if (errors.length > 0) {
    console.error('README fact check failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      '\nREADME.md states counts, provider names, and surface versions that must match the model ' +
        'catalog and the surface manifests. Update the README, not this guard.',
    );
    process.exit(1);
  }

  console.log(
    `README fact check passed (${facts.modelCount} models, ${facts.providerCount} providers, ` +
      `${facts.sharedPackages} shared packages, ${facts.adapterPackages} provider adapters, ` +
      `${facts.crateCount} crates, ${Object.keys(facts.versions).length} surface versions).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();

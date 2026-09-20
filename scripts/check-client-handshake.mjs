#!/usr/bin/env node

// A client that never says which build it is gets served as though it were the
// newest one. This guard enumerates every product surface from the surface
// vocabulary, finds the modules on each one that build an outbound API request,
// and fails on a surface that omits a header the handshake needs or on a
// recorded omission that has quietly been fixed.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/client-handshake-contract.json';
export const SURFACE_VOCABULARY_PATH = 'packages/contracts/types/src/suite-contracts.ts';

const CLIENT_EXTENSIONS = new Set(['.ts', '.tsx', '.rs']);
const HEADER_NAMES = ['surface', 'clientVersion', 'apiVersion'];

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

export function repositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** The product surfaces, read from the vocabulary rather than listed here. */
export function readSurfaces(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, SURFACE_VOCABULARY_PATH);
  if (source === null) return null;
  const match = /export type SourceSurface =([^;]*);/.exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function isTestPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(relativePath) ||
    /_test\.rs$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|tests|e2e|fixtures)\//.test(relativePath)
  );
}

function mentions(source, header) {
  const pattern = new RegExp(`${header.value.replace(/-/g, '[-]')}|\\b${header.symbol}\\b`, 'i');
  return pattern.test(source);
}

/**
 * Every module on a surface that builds a request carrying the surface header.
 * Discovered rather than listed, so a new client that forgets the rest of the
 * handshake is measured the day it is written.
 */
export function findRequestBuilders({ repoRoot, files, client, headers }) {
  const found = [];
  for (const relativePath of files) {
    if (!client.roots.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!CLIENT_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isTestPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    if (mentions(source, headers.surface)) found.push({ file: relativePath, source });
  }
  return found;
}

function checkHeaderConstants({ contract, repoRoot, errors }) {
  for (const name of HEADER_NAMES) {
    const header = contract.headers[name];
    if (header === undefined) {
      errors.push(`${CONTRACT_PATH}: the handshake names no ${name} header.`);
      continue;
    }
    if (typeof header.answers !== 'string' || header.answers.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: the ${name} header does not say what it answers.`);
    }
    const source = readSource(repoRoot, header.declaredIn);
    if (source === null) {
      errors.push(
        `${CONTRACT_PATH}: the ${name} header points at ${header.declaredIn}, which does not exist.`,
      );
      continue;
    }
    const declaration = new RegExp(`export const ${header.symbol} = '([^']+)'`).exec(source);
    if (declaration === null) {
      errors.push(
        `${header.declaredIn}: no longer declares ${header.symbol}, so the handshake names a header ` +
          'nothing spells.',
      );
      continue;
    }
    if (declaration[1].toLowerCase() !== header.value) {
      errors.push(
        `${header.declaredIn}: ${header.symbol} is "${declaration[1]}" and ${CONTRACT_PATH} expects ` +
          `"${header.value}".`,
      );
    }
  }
}

function checkClients({ contract, repoRoot, files, surfaces, errors, report }) {
  const declared = new Map(contract.clients.map((client) => [client.surface, client]));

  for (const surface of surfaces ?? []) {
    if (!declared.has(surface)) {
      errors.push(
        `${CONTRACT_PATH}: surface "${surface}" reaches the API and the handshake does not describe it.`,
      );
    }
  }
  for (const surface of declared.keys()) {
    if (!(surfaces ?? []).includes(surface)) {
      errors.push(
        `${CONTRACT_PATH}: describes surface "${surface}", which the vocabulary does not define.`,
      );
    }
  }

  for (const client of contract.clients) {
    const where = `${CONTRACT_PATH}#${client.surface}`;
    const builders = findRequestBuilders({ repoRoot, files, client, headers: contract.headers });
    report.builders += builders.length;

    if (builders.length === 0) {
      errors.push(
        `${where}: no module under ${client.roots.join(', ')} sets the surface header, so nothing ` +
          'tells the server which surface this is.',
      );
      continue;
    }

    const carriers = new Map(
      HEADER_NAMES.map((name) => [
        name,
        builders.filter((builder) => mentions(builder.source, contract.headers[name])),
      ]),
    );

    const defects = new Map((client.defects ?? []).map((entry) => [entry.header, entry]));

    for (const name of HEADER_NAMES) {
      const sends = client.sends.includes(name);
      const sending = carriers.get(name);

      if (sends) {
        const missing = builders.filter((builder) => !sending.includes(builder));
        if (missing.length > 0) {
          errors.push(
            `${where}: claims to send the ${name} header and ` +
              `${missing.map((builder) => builder.file).join(', ')} does not, so a request from there ` +
              'arrives unlabelled.',
          );
        }
        if (defects.has(name)) {
          errors.push(
            `${where}: sends the ${name} header and records it as a defect at the same time.`,
          );
        }
        continue;
      }

      const defect = defects.get(name);
      if (defect === undefined) {
        errors.push(
          `${where}: does not send the ${name} header and records no defect for it. ` +
            `${contract.headers[name].answers} is then unanswerable for this surface.`,
        );
        continue;
      }
      if (typeof defect.fix !== 'string' || defect.fix.trim().length === 0) {
        errors.push(`${where}: the ${name} defect names no fix.`);
      }
      if (sending.length === builders.length) {
        errors.push(
          `${where}: the ${name} defect is stale, every request builder now sets it. Move ${name} into ` +
            'sends and delete the defect.',
        );
      }
      report.defects += 1;
    }

    for (const name of defects.keys()) {
      if (!HEADER_NAMES.includes(name)) {
        errors.push(
          `${where}: records a defect for "${name}", which is not part of the handshake.`,
        );
      }
    }
  }
}

function checkServer({ contract, repoRoot, errors }) {
  const server = contract.server;
  const latest = readSource(repoRoot, server.latest.file);
  if (latest === null) {
    errors.push(
      `${CONTRACT_PATH}: the latest contract version points at ${server.latest.file}, which does not exist.`,
    );
  } else if (!new RegExp(`export const ${server.latest.symbol}\\b`).test(latest)) {
    errors.push(
      `${server.latest.file}: no longer declares ${server.latest.symbol}, so the server advertises no ` +
        'newest contract.',
    );
  }

  const advertised = readSource(repoRoot, server.advertisedOn.file);
  if (advertised === null) {
    errors.push(
      `${CONTRACT_PATH}: the advertisement points at ${server.advertisedOn.file}, which does not exist.`,
    );
  } else {
    for (const symbol of [server.advertisedOn.symbol, server.latest.symbol]) {
      if (!new RegExp(`\\b${symbol}\\b`).test(advertised)) {
        errors.push(
          `${server.advertisedOn.file}: does not name ${symbol}, so a response carries no version for a ` +
            'client to compare itself against.',
        );
      }
    }
  }

  const defects = new Map((server.defects ?? []).map((entry) => [entry.claim, entry]));

  if (server.minimumSupported === null) {
    const defect = defects.get('minimumSupported');
    if (defect === undefined) {
      errors.push(
        `${CONTRACT_PATH}: the server advertises no minimum supported contract and records no defect. ` +
          'An old client then cannot tell that it is out of date until a shape it never saw breaks it.',
      );
    } else if (typeof defect.fix !== 'string' || defect.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: the minimumSupported defect names no fix.`);
    }
  } else {
    const floor = readSource(repoRoot, server.minimumSupported.file);
    if (
      floor === null ||
      !new RegExp(`export const ${server.minimumSupported.symbol}\\b`).test(floor)
    ) {
      errors.push(
        `${CONTRACT_PATH}: the minimum supported contract names ${server.minimumSupported.symbol}, which ` +
          `${server.minimumSupported.file} does not declare.`,
      );
    }
    if (defects.has('minimumSupported')) {
      errors.push(
        `${CONTRACT_PATH}: the server advertises a floor and records it as a defect at the same time.`,
      );
    }
  }
}

function checkNegotiation({ contract, repoRoot, errors }) {
  const negotiation = contract.negotiation;
  const source = readSource(repoRoot, negotiation.module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: the negotiation module ${negotiation.module} does not exist.`);
    return;
  }

  const states = new RegExp(`export const ${negotiation.statesSymbol} = \\[([\\s\\S]*?)\\]`).exec(
    source,
  );
  if (states === null) {
    errors.push(`${negotiation.module}: no longer declares ${negotiation.statesSymbol}.`);
  } else {
    const members = new Set([...states[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]));
    for (const required of negotiation.requiredStates) {
      if (!members.has(required)) {
        errors.push(
          `${negotiation.module}: ${negotiation.statesSymbol} omits "${required}", so a client in that ` +
            'state has no answer to act on.',
        );
      }
    }
  }

  for (const handler of negotiation.unknownHandlers) {
    if (!new RegExp(`export function ${handler}\\b`).test(source)) {
      errors.push(
        `${negotiation.module}: no longer exports ${handler}, so nothing turns an unknown capability, ` +
          'block or version into a decision.',
      );
    }
  }
}

export function checkClientHandshake(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = repositoryFiles(repoRoot);
  const surfaces = readSurfaces(repoRoot);
  const report = { surfaces: surfaces?.length ?? 0, builders: 0, defects: 0 };

  if (surfaces === null) {
    errors.push(`${SURFACE_VOCABULARY_PATH}: no SourceSurface vocabulary to enumerate.`);
  }

  checkHeaderConstants({ contract, repoRoot, errors });
  checkClients({ contract, repoRoot, files, surfaces, errors, report });
  checkServer({ contract, repoRoot, errors });
  checkNegotiation({ contract, repoRoot, errors });

  return { errors, report };
}

function main() {
  const { errors, report } = checkClientHandshake(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Client handshake check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-client-handshake: OK (${report.surfaces} surfaces, ${report.builders} request builders, ` +
      `${report.defects} recorded omission(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

#!/usr/bin/env node

// A client that never says which build it is gets served as though it were the
// newest one. This enumerates every surface and fails on one that omits a
// header the handshake needs, or on an omission that has quietly been fixed.

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

/** Importing a header name is not sending it, so the import block is not evidence. */
function withoutImports(source) {
  return source.replace(/(^|\n)import\b[\s\S]*?from\s+['"][^'"]+['"];/g, '$1');
}

function mentions(source, header) {
  const pattern = new RegExp(`${header.value.replace(/-/g, '[-]')}|\\b${header.symbol}\\b`, 'i');
  return pattern.test(source);
}

/**
 * Calling the builder, not importing it: an import a refactor left behind is
 * how a hand-rolled header block hides behind a dead line at the top of a file.
 */
function namesSymbol(source, symbol) {
  return new RegExp(`(^|[^\\w$])${symbol.replace(/[:]/g, '[:]')}\\s*(\\(|[:][:])`).test(source);
}

/**
 * Every module on a surface that touches the handshake, discovered rather than
 * listed, so a client that forgets half of it is measured the day it is written.
 */
export function findRequestBuilders({ repoRoot, files, client, headers }) {
  const found = [];
  const builderSymbol = client.builder?.symbol;
  for (const relativePath of files) {
    if (!client.roots.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!CLIENT_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isTestPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const touches =
      HEADER_NAMES.some((name) => mentions(source, headers[name])) ||
      (builderSymbol !== undefined && namesSymbol(source, builderSymbol));
    if (touches) found.push({ file: relativePath, source });
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

/**
 * The one module a surface routes every platform request through: it spells a
 * header or delegates to the shared helper, and a caller inherits both.
 */
function checkBuilder({ contract, repoRoot, client, where, errors }) {
  const builder = client.builder;
  if (builder === undefined) {
    errors.push(`${where}: names no shared header builder, so each request site invents one.`);
    return null;
  }
  const source = readSource(repoRoot, builder.file);
  if (source === null) {
    errors.push(`${where}: the header builder ${builder.file} does not exist.`);
    return null;
  }
  const helper = readSource(repoRoot, contract.helper.module);
  const body = withoutImports(source);
  const delegates = namesSymbol(body, contract.helper.symbol);
  for (const name of builder.sets ?? []) {
    if (mentions(body, contract.headers[name])) continue;
    if (delegates && helper !== null && mentions(withoutImports(helper), contract.headers[name])) {
      continue;
    }
    errors.push(
      `${builder.file}: is this surface's header builder and sets no ${name} header, so every ` +
        `request from it arrives without one. ${contract.headers[name].answers} is then unanswerable.`,
    );
  }
  return builder;
}

function checkHelper({ contract, repoRoot, errors }) {
  const helper = contract.helper;
  const source = readSource(repoRoot, helper.module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: the shared header helper ${helper.module} does not exist.`);
    return;
  }
  const declaration = new RegExp(`export function ${helper.symbol}\\b`).exec(source);
  if (declaration === null) {
    errors.push(
      `${helper.module}: no longer exports ${helper.symbol}, so each surface would settle the ` +
        'header names for itself.',
    );
    return;
  }
  // Only what the function attaches counts: declaring a name above it and
  // never putting it on a request is the defect this whole contract is about.
  const attached = source.slice(declaration.index);
  for (const name of HEADER_NAMES) {
    if (!mentions(attached, contract.headers[name])) {
      errors.push(
        `${helper.module}: ${helper.symbol} attaches no ${name} header, so every surface that ` +
          'goes through it sends a request without one.',
      );
    }
  }
}

/** A surface that cannot import the contract keeps a copy, compared here rather than trusted. */
function checkMirror({ contract, repoRoot, errors }) {
  const mirror = contract.mirror;
  if (mirror === undefined) return;
  const source = readSource(repoRoot, mirror.file);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: the mirror ${mirror.file} does not exist.`);
    return;
  }
  for (const [name, symbol] of Object.entries(mirror.headerConstants)) {
    const declared = new RegExp(`const ${symbol}: &str = "([^"]+)"`).exec(source);
    if (declared === null) {
      errors.push(`${mirror.file}: no longer declares ${symbol}.`);
      continue;
    }
    if (declared[1].toLowerCase() !== contract.headers[name].value) {
      errors.push(
        `${mirror.file}: ${symbol} is "${declared[1]}" and the handshake spells the ${name} header ` +
          `"${contract.headers[name].value}", so this surface labels itself with a name nothing reads.`,
      );
    }
  }

  const latest = readSource(repoRoot, contract.server.latest.file);
  const canonical =
    latest === null
      ? null
      : new RegExp(`export const ${contract.server.latest.symbol} = '([^']+)'`).exec(latest);
  const mirrored = new RegExp(`const ${mirror.versionConstant}: &str = "([^"]+)"`).exec(source);
  if (mirrored === null) {
    errors.push(`${mirror.file}: no longer declares ${mirror.versionConstant}.`);
  } else if (canonical !== null && mirrored[1] !== canonical[1]) {
    errors.push(
      `${mirror.file}: claims contract ${mirrored[1]} and the server serves ${canonical[1]}, so this ` +
        'surface would be refused by a floor it is actually current for.',
    );
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

    const builder = checkBuilder({ contract, repoRoot, client, where, errors });

    if (builders.length === 0) {
      errors.push(
        `${where}: no module under ${client.roots.join(', ')} takes part in the handshake, so ` +
          'nothing tells the server which surface this is.',
      );
      continue;
    }

    const routed = new Set(
      builder === null
        ? []
        : builders.filter(
            (entry) => entry.file === builder.file || namesSymbol(entry.source, builder.symbol),
          ),
    );

    // A header the builder does not set is owed only by the modules that spell
    // one themselves; a module that merely calls the builder is not a request.
    const inherited = new Set(builder?.sets ?? []);
    const carriers = new Map(
      HEADER_NAMES.map((name) => [
        name,
        builders.filter((entry) => {
          if (mentions(entry.source, contract.headers[name])) return true;
          if (inherited.has(name)) return routed.has(entry);
          if (entry.file === builder?.file) return true;
          return !HEADER_NAMES.some((other) => mentions(entry.source, contract.headers[other]));
        }),
      ]),
    );

    const defects = new Map((client.defects ?? []).map((entry) => [entry.header, entry]));

    for (const name of HEADER_NAMES) {
      const sends = client.sends.includes(name);
      const sending = carriers.get(name);

      if (sends) {
        const missing = builders.filter((entry) => !sending.includes(entry));
        if (missing.length > 0) {
          errors.push(
            `${where}: claims to send the ${name} header and ` +
              `${missing.map((entry) => entry.file).join(', ')} neither sets it nor goes through ` +
              `${builder?.file ?? 'the shared builder'}, so a request from there arrives unlabelled.`,
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

/** A floor nothing advertises and nothing refuses below leaves an old client guessing. */
function checkFloor({ contract, repoRoot, latest, advertised, errors }) {
  const floor = contract.server.minimumSupported;
  const source = readSource(repoRoot, floor.file);

  const declared =
    source === null ? null : new RegExp(`export const ${floor.symbol} = '([^']+)'`).exec(source);
  const newest =
    latest === null
      ? null
      : new RegExp(`export const ${contract.server.latest.symbol} = '([^']+)'`).exec(latest);
  if (declared !== null && newest !== null && declared[1] > newest[1]) {
    errors.push(
      `${floor.file}: the floor ${declared[1]} is newer than the contract ${newest[1]} this server ` +
        'serves, so every client is refused including the current one.',
    );
  }

  if (advertised !== null && !new RegExp(`\\b${floor.advertisedOn}\\b`).test(advertised)) {
    errors.push(
      `${contract.server.advertisedOn.file}: does not send ${floor.advertisedOn}, so a client is told ` +
        'the newest contract and never the oldest one still answered.',
    );
  }

  const refusal = readSource(repoRoot, contract.server.refusal.file);
  if (refusal === null) {
    errors.push(
      `${CONTRACT_PATH}: the refusal points at ${contract.server.refusal.file}, which does not exist.`,
    );
    return;
  }
  for (const symbol of [contract.server.refusal.symbol, floor.symbol]) {
    if (!new RegExp(`\\b${symbol}\\b`).test(refusal)) {
      errors.push(
        `${contract.server.refusal.file}: does not name ${symbol}, so nothing compares a caller ` +
          'against the floor and a build too old is served anyway.',
      );
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
    checkFloor({ contract, repoRoot, latest, advertised, errors });
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
  checkHelper({ contract, repoRoot, errors });
  checkClients({ contract, repoRoot, files, surfaces, errors, report });
  checkMirror({ contract, repoRoot, errors });
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
    `check-client-handshake: OK (${report.surfaces} surfaces, ${report.builders} modules in the ` +
      `handshake, ${report.defects} recorded omission(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

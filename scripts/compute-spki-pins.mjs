#!/usr/bin/env node
/* global console, process */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pinConfig = require(path.join(repoRoot, 'apps/mobile/native/tlsPinConfig.cjs'));

const USAGE = `Usage: node scripts/compute-spki-pins.mjs [options]

Captures the live certificate chain for every host in apps/mobile/lib/pinning.ts
and prints the SPKI pins plus the native pin config generated from them.

Options:
  --host <name>       Probe this host instead of the table (repeatable).
  --clerk-key <pk>    Probe the Clerk FAPI host encoded in a publishable key
                      (pk_live_… / pk_test_…) instead of the clerk host already
                      in the table. Clerk's SDK does its own networking and
                      never reaches secureFetch, so only the native pin config
                      can cover the auth handshake.
  --port <n>          TLS port (default 443).
  --depth <what>      Which chain positions to put in the printed PINS_BY_HOST
                      block: leaf | intermediate | root | intermediate+root
                      (default). iOS NSPinnedCAIdentities matches certificates
                      ABOVE the leaf only, so a leaf-only table refuses every
                      connection on iOS.
  --json              Emit the captured chains as JSON instead of paste-ready blocks.
  --help              Show this message.
`;

function clerkFapiHost(publishableKey) {
  const encoded = /^pk_(?:live|test)_([A-Za-z0-9+/=]+)$/.exec(publishableKey?.trim() ?? '')?.[1];
  if (!encoded)
    throw new Error('--clerk-key must be a Clerk publishable key (pk_live_… / pk_test_…)');
  const decoded = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(decoded)) {
    throw new Error(`--clerk-key did not decode to a hostname (got "${decoded}")`);
  }
  return decoded.toLowerCase();
}

function parseArgs(argv) {
  const opts = { hosts: [], port: 443, depth: 'intermediate+root', json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--host') opts.hosts.push(argv[(i += 1)]);
    else if (arg === '--clerk-key') opts.hosts.push(clerkFapiHost(argv[(i += 1)]));
    else if (arg === '--port') opts.port = Number(argv[(i += 1)]);
    else if (arg === '--depth') opts.depth = argv[(i += 1)];
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!['leaf', 'intermediate', 'root', 'intermediate+root'].includes(opts.depth)) {
    throw new Error(`--depth must be leaf, intermediate, root or intermediate+root`);
  }
  if (!Number.isInteger(opts.port) || opts.port <= 0) throw new Error('--port must be an integer');
  return opts;
}

function spkiPin(publicKeyDer) {
  return createHash('sha256').update(publicKeyDer).digest('base64');
}

function chainOf(peerCertificate) {
  const chain = [];
  const seen = new Set();
  let node = peerCertificate;
  while (node && node.fingerprint256 && !seen.has(node.fingerprint256)) {
    seen.add(node.fingerprint256);
    chain.push({
      subject: node.subject?.CN ?? node.subject?.O ?? '(unnamed)',
      issuer: node.issuer?.CN ?? node.issuer?.O ?? '(unnamed)',
      validTo: node.valid_to,
      pin: `${pinConfig.PIN_PREFIX}${spkiPin(node.pubkey)}`,
    });
    node = node.issuerCertificate;
  }
  return chain;
}

function labelChain(chain) {
  return chain.map((entry, index) => ({
    ...entry,
    position: index === 0 ? 'leaf' : index === chain.length - 1 ? 'root' : 'intermediate',
  }));
}

function probe(host, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true }, () => {
      const chain = labelChain(chainOf(socket.getPeerCertificate(true)));
      socket.end();
      resolve({ host, chain });
    });
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error(`${host}: TLS handshake timed out`));
    });
    socket.on('error', (err) => reject(new Error(`${host}: ${err.message}`)));
  });
}

function selectPins(chain, depth) {
  const wanted = depth === 'intermediate+root' ? ['intermediate', 'root'] : [depth];
  const selected = chain.filter((entry) => wanted.includes(entry.position)).map((e) => e.pin);
  return selected.length > 0 ? selected : chain.map((e) => e.pin);
}

function printPinsByHostBlock(results, depth) {
  console.log('// apps/mobile/lib/pinning.ts, replace the PINS_BY_HOST literal with:');
  console.log('export const PINS_BY_HOST: PinTable = Object.freeze({');
  for (const { host, chain } of results) {
    console.log(`  '${host}': [`);
    for (const pin of selectPins(chain, depth)) console.log(`    '${pin}',`);
    console.log('  ],');
  }
  console.log('});');
}

function printNativeBlocks(results, depth) {
  const table = Object.fromEntries(
    results.map(({ host, chain }) => [host, selectPins(chain, depth)]),
  );
  const pins = pinConfig.provisionedPins(table);

  console.log('\n// ios Info.plist, NSAppTransportSecurity, as the plugin would emit it:');
  console.log(JSON.stringify({ NSPinnedDomains: pinConfig.iosPinnedDomains(pins) }, null, 2));

  console.log('\n<!-- android/app/src/main/res/xml/network_security_config.xml -->');
  console.log(pinConfig.androidNetworkSecurityConfigXml(pins));

  console.log(
    '\n// Neither block is written by hand. Both are generated at prebuild once\n' +
      "// './native/withAGITlsPinning.cjs' is in the plugins array of apps/mobile/app.config.js, \n" +
      '// register it BEFORE pasting the table below (with placeholders it emits nothing, so\n' +
      '// registering it changes no build output). Without it the pins are inert: nothing in the\n' +
      '// built app compares a certificate to anything. They are printed here for review only.',
  );
}

function printChainReport(results) {
  for (const { host, chain } of results) {
    console.log(`\n${host}`);
    for (const entry of chain) {
      console.log(
        `  ${entry.position.padEnd(12)} ${entry.pin}  ${entry.subject} (expires ${entry.validTo})`,
      );
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const hosts = opts.hosts.length > 0 ? opts.hosts : Object.keys(pinConfig.readPinTable()).sort();
  if (hosts.length === 0) {
    console.error('[compute-spki-pins] no hosts to probe');
    return 1;
  }
  if (opts.depth === 'leaf') {
    console.error(
      '[compute-spki-pins] WARNING: iOS NSPinnedCAIdentities never matches the leaf certificate, ' +
        'so pasting a leaf-only table refuses every connection the app makes on iOS.',
    );
  }

  const settled = await Promise.allSettled(hosts.map((host) => probe(host, opts.port)));
  const results = [];
  let failed = 0;
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') results.push(outcome.value);
    else {
      failed += 1;
      console.error(`[compute-spki-pins] ${outcome.reason.message}`);
    }
  }
  if (results.length === 0) return 1;

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return failed > 0 ? 1 : 0;
  }

  printChainReport(results);
  console.log('');
  printPinsByHostBlock(results, opts.depth);
  printNativeBlocks(results, opts.depth);
  console.log(
    '\n// Pin at least two keys per host: one in the chain you serve today and one backup\n' +
      '// key you control and can swap to. A pin-set with no reachable key hard-fails every\n' +
      '// installed app at the next rotation, and no over-the-air update can repair it.\n' +
      '//\n' +
      '// Pasting this block turns nothing on. PINNING_ROLLOUT in apps/mobile/lib/pinning.ts\n' +
      "// stays 'report-only', where a release build only logs the hosts enforcement would\n" +
      '// refuse. Ship that build, read those warnings, give every host it names a\n' +
      "// PINS_BY_HOST entry, and only then set PINNING_ROLLOUT to 'enforced' in a separate\n" +
      '// commit and cut a native build. See docs/work/founder-assistance.md, mobile TLS pinning.',
  );
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[compute-spki-pins] ${err.message}`);
    process.exit(1);
  },
);

#!/usr/bin/env node

// What a machine tells the server it can do. A capability a device has and a
// browser does not is only useful to the product if the device can say it has
// it, and `DeviceCapabilitiesSchema` is strict, so a capability with no field
// there cannot be advertised at all: the server has to guess from the surface
// name, which is the thing check-capability-boundaries forbids.
//
// The list of capabilities is enumerated from the platform matrix rather than
// restated here, so a capability added to a device row is advertised or
// recorded as a gap on the day it lands. A gap carries its reason and its
// owner, and closing one without deleting it fails too, so the file cannot rot
// into an allowlist.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CAPABILITY_SOURCE = 'packages/contracts/types/src/capabilities.ts';
export const DEVICE_REGISTRY_SOURCE = 'packages/contracts/cloud-contracts/src/device-registry.ts';
export const HANDSHAKE_CONTRACT = 'packages/contracts/types/src/client-handshake-contract.json';
export const GAPS_PATH = 'scripts/config/capability-advertisement.json';

/**
 * What the heartbeat says about the machine itself, as opposed to what it can
 * do. Each is read out of the request schema, so removing one fails here.
 */
export const REQUIRED_IDENTITY_FIELDS = Object.freeze([
  'surface',
  'installId',
  'os',
  'architecture',
  'appVersion',
  'shell',
]);

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** The capability vocabulary as the matrix declares it, never a copy. */
export function readCapabilities(source) {
  const declaration = /export type PlatformCapability =([\s\S]*?);/.exec(source);
  if (declaration === null) return [];
  return [...declaration[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
}

/** One surface's row of the matrix, as booleans keyed by capability. */
export function readCapabilityRow(source, constant) {
  const block = new RegExp(`const ${constant}: CapabilityRow = \\{([\\s\\S]*?)\\n\\};`).exec(
    source,
  );
  if (block === null) return {};
  const row = {};
  for (const match of block[1].matchAll(/(\w+):\s*(true|false)/g))
    row[match[1]] = match[2] === 'true';
  return row;
}

/**
 * A capability the machine has and the browser does not. Those are the ones a
 * server cannot infer from the request alone, so those are the ones a device
 * has to advertise.
 */
export function deviceScopedCapabilities(source) {
  const desktop = readCapabilityRow(source, 'DESKTOP');
  const mobile = readCapabilityRow(source, 'MOBILE');
  const web = readCapabilityRow(source, 'WEB');
  return readCapabilities(source).filter(
    (capability) =>
      (desktop[capability] === true || mobile[capability] === true) && web[capability] === false,
  );
}

/** The fields a device may send about what it can do. */
export function readAdvertisedFields(source) {
  const block = /export const DeviceCapabilitiesSchema = z\n?\s*\.object\(\{([\s\S]*?)\}\)/.exec(
    source,
  );
  if (block === null) return [];
  return [...block[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
}

export function readRequestFields(source) {
  const block =
    /export const DeviceHeartbeatRequestSchema = z\n?\s*\.object\(\{([\s\S]*?)\n\s*\}\)/.exec(
      source,
    );
  if (block === null) return [];
  return [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((match) => match[1]);
}

export function loadGaps(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, GAPS_PATH);
  return source === null ? null : JSON.parse(source);
}

export function collectViolations(repoRoot = REPO_ROOT) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const capabilitySource = read(repoRoot, CAPABILITY_SOURCE);
  const deviceSource = read(repoRoot, DEVICE_REGISTRY_SOURCE);
  if (capabilitySource === null) {
    fail(`${CAPABILITY_SOURCE} is missing; nothing enumerates what a surface can do.`);
    return violations;
  }
  if (deviceSource === null) {
    fail(`${DEVICE_REGISTRY_SOURCE} is missing; no device can advertise anything.`);
    return violations;
  }

  const scoped = deviceScopedCapabilities(capabilitySource);
  if (scoped.length === 0) {
    fail(`${CAPABILITY_SOURCE}: no capability reads as device-scoped; the matrix shape changed.`);
    return violations;
  }

  const advertised = readAdvertisedFields(deviceSource);
  if (advertised.length === 0) {
    fail(`${DEVICE_REGISTRY_SOURCE}: DeviceCapabilitiesSchema parsed as empty; the shape changed.`);
    return violations;
  }

  const gaps = loadGaps(repoRoot);
  if (gaps === null) {
    fail(`${GAPS_PATH} is missing; every unadvertised capability would pass unmeasured.`);
    return violations;
  }

  const carries = new Map(Object.entries(gaps.advertises ?? {}));
  const declaredGaps = new Map(Object.entries(gaps.gaps ?? {}));

  for (const capability of scoped) {
    const field = carries.get(capability);
    const gap = declaredGaps.get(capability);

    if (field !== undefined && gap !== undefined) {
      fail(`${GAPS_PATH}: "${capability}" is both advertised and recorded as a gap.`);
      continue;
    }

    if (field !== undefined) {
      if (!advertised.includes(field)) {
        fail(
          `${DEVICE_REGISTRY_SOURCE}: DeviceCapabilitiesSchema has no "${field}", which is how a ` +
            `device says it can ${capability}. The schema is strict, so a device cannot send it.`,
        );
      }
      continue;
    }

    if (gap === undefined) {
      fail(
        `${GAPS_PATH}: "${capability}" is a device capability the browser does not have, and ` +
          'nothing says how a device advertises it or why it cannot. The server is left to infer ' +
          'it from the surface name.',
      );
      continue;
    }

    if (typeof gap.why !== 'string' || gap.why.trim().length === 0) {
      fail(`${GAPS_PATH}: the gap for "${capability}" carries no reason.`);
    }
    if (typeof gap.owner !== 'string' || gap.owner.trim().length === 0) {
      fail(`${GAPS_PATH}: the gap for "${capability}" names nobody who answers for it.`);
    }
    if (typeof gap.field === 'string' && advertised.includes(gap.field)) {
      fail(
        `${GAPS_PATH}: "${capability}" is recorded as a gap, but ${DEVICE_REGISTRY_SOURCE} now has ` +
          `"${gap.field}". Move it to "advertises" so the gap list cannot become an allowlist.`,
      );
    }
  }

  for (const capability of carries.keys()) {
    if (!scoped.includes(capability)) {
      fail(`${GAPS_PATH}: "${capability}" is not a device-scoped capability the matrix declares.`);
    }
  }
  for (const capability of declaredGaps.keys()) {
    if (!scoped.includes(capability)) {
      fail(`${GAPS_PATH}: a gap names "${capability}", which the matrix does not declare.`);
    }
  }

  const requestFields = readRequestFields(deviceSource);
  for (const field of REQUIRED_IDENTITY_FIELDS) {
    if (!requestFields.includes(field)) {
      fail(
        `${DEVICE_REGISTRY_SOURCE}: DeviceHeartbeatRequestSchema no longer carries "${field}", so ` +
          'the server cannot tell which build on which machine is calling.',
      );
    }
  }

  const contract = read(repoRoot, HANDSHAKE_CONTRACT);
  if (contract === null) {
    fail(`${HANDSHAKE_CONTRACT} is missing; nothing says which clients send the handshake.`);
  } else {
    const parsed = JSON.parse(contract);
    for (const client of parsed.clients ?? []) {
      if (client.builder?.file === undefined) {
        fail(
          `${HANDSHAKE_CONTRACT}: surface "${client.surface}" names no builder, so its headers are ` +
            'hand-assembled at each call site.',
        );
      }
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('Capability advertisement violations:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log('Capability advertisement: every device capability is sent or has a recorded gap.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

import { isCalendarDate } from './lib/calendar-date.mjs';

const POLICY_PATH = '.github/security-gate-policy.json';
const DENY_PATH = 'deny.toml';
const MANIFEST_PATH = 'package.json';
const LOCKFILE_PATH = 'pnpm-lock.yaml';
const IMPORTER_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const RUNTIME_FIELDS = ['dependencies', 'optionalDependencies'];
const PATCHED_ADVISORIES = {
  'GHSA-ch52-4w7c-c8xp': { package: 'http-cache-semantics', version: '4.2.0' },
  'GHSA-vfj7-8cjw-p6xm': { package: 'braces', version: '3.0.3' },
};

export function pnpmPatchHash(contents) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  // MD5 reproduces pnpm 9's content identifier, never a security integrity check.
  // The registered SHA256 separately verifies the reviewed patch bytes.
  const digest = createHash('md5').update(contents).digest();
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

export function collectContinueOnErrorSteps(workflow) {
  const steps = [];
  for (const [job, definition] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of definition?.steps ?? []) {
      if (step?.['continue-on-error'] === true) {
        steps.push({ job, step: step.name ?? '<unnamed step>' });
      }
    }
  }
  return steps;
}

export function findStep(workflow, job, name) {
  return (workflow?.jobs?.[job]?.steps ?? []).find((step) => step?.name === name);
}

export function parseDenyAdvisoryIgnores(denyToml) {
  const ignores = [];
  for (const section of denyToml.matchAll(/\[advisories\]([\s\S]*?)(?=\n\[|$)/gu)) {
    const ignore = /ignore\s*=\s*\[([\s\S]*?)\]/u.exec(section[1]);
    if (!ignore) continue;
    for (const match of ignore[1].matchAll(/"([^"]+)"/gu)) {
      ignores.push(match[1]);
    }
  }
  return ignores;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lockfilePackageName(key) {
  const reference = key.startsWith('npm:') ? key.slice('npm:'.length) : key;
  return reference.slice(0, reference.indexOf('@', 1));
}

function lockfileDependencyKey(name, version) {
  const rawReference = String(version);
  const reference = rawReference.startsWith('npm:')
    ? rawReference.slice('npm:'.length)
    : rawReference;
  return reference.split('(')[0].lastIndexOf('@') > 0 ? reference : `${name}@${reference}`;
}

function pnpmReferenceNodes(reference) {
  const nodes = [];
  let index = 0;
  const readNode = () => {
    const start = index;
    while (index < reference.length && reference[index] !== '(' && reference[index] !== ')') {
      index++;
    }
    const atom = reference.slice(start, index);
    if (atom.startsWith('patch_hash=')) {
      const hash = atom.slice('patch_hash='.length);
      return /^[a-z2-7]{26}$/u.test(hash) ? { kind: 'hash', hash } : null;
    }
    const separator = atom.indexOf('@', 1);
    const name = atom.slice(0, separator);
    const version = atom.slice(separator + 1);
    if (
      separator < 1 ||
      !/^(?:@[a-z\d~._-]+\/)?[a-z\d~._-]+$/iu.test(name) ||
      version.length === 0 ||
      /\s/u.test(version)
    ) {
      return null;
    }
    const node = { kind: 'package', name, version, patchHash: undefined, hasChildren: false };
    nodes.push(node);
    return node;
  };
  const root = readNode();
  if (root?.kind !== 'package') return null;
  const stack = [root];
  while (index < reference.length) {
    const parent = stack.at(-1);
    const character = reference[index++];
    if (character === '(') {
      if (parent.kind !== 'package') return null;
      const child = readNode();
      if (!child) return null;
      if (child.kind === 'hash') {
        if (parent.hasChildren) return null;
        parent.patchHash = child.hash;
      }
      parent.hasChildren = true;
      stack.push(child);
    } else if (character === ')') {
      if (stack.length === 1) return null;
      stack.pop();
    } else {
      return null;
    }
  }
  return stack.length === 1 ? nodes : null;
}

function snapshotDependencies(snapshot) {
  return RUNTIME_FIELDS.flatMap((field) =>
    Object.entries(snapshot?.[field] ?? {}).map(([name, version]) =>
      lockfileDependencyKey(name, version),
    ),
  );
}

function importerDependencyKeys(lockfile, importer) {
  return IMPORTER_FIELDS.flatMap((field) =>
    Object.entries(lockfile.importers[importer]?.[field] ?? {})
      .map(([name, entry]) => [name, String(entry?.version ?? '')])
      .filter(([, version]) => !version.startsWith('link:'))
      .map(([name, version]) => lockfileDependencyKey(name, version)),
  );
}

function lockfileDependents(lockfile, waivedPackage) {
  const dependents = new Set();
  for (const importer of Object.keys(lockfile.importers)) {
    if (
      importerDependencyKeys(lockfile, importer).some(
        (dependency) => lockfilePackageName(dependency) === waivedPackage,
      )
    ) {
      dependents.add(importer);
    }
  }
  for (const [key, snapshot] of Object.entries(lockfile.snapshots)) {
    if (
      snapshotDependencies(snapshot).some(
        (dependency) => lockfilePackageName(dependency) === waivedPackage,
      )
    ) {
      dependents.add(lockfilePackageName(key));
    }
  }
  return [...dependents].sort();
}

function walkImporters(lockfile, waivedPackage) {
  const reaching = [];
  const unresolved = new Set();
  for (const start of Object.keys(lockfile.importers)) {
    const pending = [];
    const seenImporters = new Set();
    const seenSnapshots = new Set();
    let reaches = false;
    const visitImporter = (importer, fields) => {
      if (seenImporters.has(importer)) return;
      seenImporters.add(importer);
      for (const field of fields) {
        for (const [name, entry] of Object.entries(lockfile.importers[importer]?.[field] ?? {})) {
          const version = String(entry?.version ?? '');
          if (version.startsWith('link:')) {
            visitImporter(path.posix.join(importer, version.slice('link:'.length)), RUNTIME_FIELDS);
          } else {
            pending.push(lockfileDependencyKey(name, version));
          }
        }
      }
    };
    visitImporter(start, IMPORTER_FIELDS);
    while (pending.length > 0) {
      const key = pending.pop();
      if (seenSnapshots.has(key)) continue;
      seenSnapshots.add(key);
      if (lockfilePackageName(key) === waivedPackage) {
        reaches = true;
      } else if (Object.hasOwn(lockfile.snapshots, key)) {
        pending.push(...snapshotDependencies(lockfile.snapshots[key]));
      } else {
        unresolved.add(key);
      }
    }
    if (reaches) reaching.push(start);
  }
  return { reaching: reaching.sort(), unresolved: [...unresolved].sort() };
}

function auditWaiverScopeFailures(entry, lockfile) {
  const scope = entry.dependents;
  if (
    typeof entry.package !== 'string' ||
    !Array.isArray(scope?.packages) ||
    !Array.isArray(scope?.importers)
  ) {
    return [
      `exclusion ${entry.id} must name the waived package and the dependents and importers allowed to reach it`,
    ];
  }
  if (!isRecord(lockfile?.importers) || !isRecord(lockfile?.snapshots)) {
    return [
      `exclusion ${entry.id} cannot be scoped without the importers and snapshots of ${LOCKFILE_PATH}`,
    ];
  }
  const named = (key) => lockfilePackageName(key) === entry.package;
  if (
    !Object.keys(lockfile.snapshots).some(named) &&
    !Object.keys(lockfile.importers).some((importer) =>
      importerDependencyKeys(lockfile, importer).some(named),
    )
  ) {
    return [
      `exclusion ${entry.id} waives ${entry.package}, which ${LOCKFILE_PATH} does not contain; correct the name or delete the waiver`,
    ];
  }
  const failures = [];
  for (const dependent of lockfileDependents(lockfile, entry.package)) {
    if (!scope.packages.includes(dependent)) {
      failures.push(
        `exclusion ${entry.id} waives ${entry.package} for ${scope.packages.join(', ')} only, but ${dependent} also depends on it in ${LOCKFILE_PATH}`,
      );
    }
  }
  const { reaching, unresolved } = walkImporters(lockfile, entry.package);
  for (const importer of reaching) {
    if (!scope.importers.includes(importer)) {
      failures.push(
        `exclusion ${entry.id} waives ${entry.package} for ${scope.importers.join(', ')} only, but ${importer} also reaches it in ${LOCKFILE_PATH}`,
      );
    }
  }
  for (const key of unresolved) {
    failures.push(
      `exclusion ${entry.id} cannot finish its walk: ${LOCKFILE_PATH} reaches ${key} but has no snapshot for it`,
    );
  }
  return failures;
}

function patchedAuditWaiverFailures(entry, binding, manifest, lockfile, patchContents) {
  const failures = [];
  const label = `exclusion ${entry.id}`;
  const advisory = Object.keys(PATCHED_ADVISORIES).find((id) => PATCHED_ADVISORIES[id] === binding);
  if (
    entry.package !== binding.package ||
    !Array.isArray(entry.advisories) ||
    entry.advisories.length !== 1 ||
    entry.advisories[0] !== advisory
  ) {
    failures.push(`${label} must bind ${advisory} only to ${binding.package}@${binding.version}`);
  }
  const key = `${binding.package}@${binding.version}`;
  const patchPath = `patches/${key}.patch`;
  if (
    !isRecord(entry.patch) ||
    entry.patch.version !== binding.version ||
    entry.patch.path !== patchPath ||
    typeof entry.patch.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(entry.patch.sha256)
  ) {
    failures.push(
      `${label} must pin patch version ${binding.version}, path ${patchPath}, and its SHA256`,
    );
    return failures;
  }
  const contents =
    isRecord(patchContents) && Object.hasOwn(patchContents, patchPath)
      ? patchContents[patchPath]
      : undefined;
  if (!(typeof contents === 'string' || Buffer.isBuffer(contents))) {
    failures.push(`${label} cannot verify missing patch contents for ${patchPath}`);
    return failures;
  }
  if (createHash('sha256').update(contents).digest('hex') !== entry.patch.sha256) {
    failures.push(`${label} patch ${patchPath} does not match its registered SHA256`);
  }
  const hash = pnpmPatchHash(contents);
  if (manifest?.pnpm?.patchedDependencies?.[key] !== patchPath) {
    failures.push(
      `${label} requires ${MANIFEST_PATH} pnpm.patchedDependencies[${key}] = ${patchPath}`,
    );
  }
  const lockedPatch = lockfile?.patchedDependencies?.[key];
  if (lockedPatch?.path !== patchPath || lockedPatch?.hash !== hash) {
    failures.push(
      `${label} requires ${LOCKFILE_PATH} patchedDependencies[${key}] with path ${patchPath} and hash ${hash}`,
    );
  }
  for (const [source, patches] of [
    [MANIFEST_PATH, manifest?.pnpm?.patchedDependencies],
    [LOCKFILE_PATH, lockfile?.patchedDependencies],
  ]) {
    for (const selector of Object.keys(patches ?? {})) {
      if (
        (selector === binding.package || lockfilePackageName(selector) === binding.package) &&
        selector !== key
      ) {
        failures.push(
          `${label} cannot use a broader or different ${source} patch selector ${selector}`,
        );
      }
    }
  }
  if (
    !isRecord(lockfile?.packages) ||
    !isRecord(lockfile?.snapshots) ||
    !isRecord(lockfile?.importers)
  ) {
    failures.push(
      `${label} cannot verify the patched package without packages, snapshots, and importers in ${LOCKFILE_PATH}`,
    );
    return failures;
  }
  const packageKeys = Object.keys(lockfile.packages).filter(
    (candidate) => lockfilePackageName(candidate) === binding.package,
  );
  if (packageKeys.length !== 1 || packageKeys[0] !== key) {
    failures.push(`${label} requires exactly ${key} in ${LOCKFILE_PATH} packages`);
  }
  if (!isRecord(lockfile.packages[key])) {
    failures.push(`${label} requires package metadata for ${key} in ${LOCKFILE_PATH}`);
  }
  const validateReference = (reference, source) => {
    if (!reference.includes(`${binding.package}@`)) return;
    const nodes = pnpmReferenceNodes(reference);
    if (!nodes) {
      failures.push(
        `${label} ${source} references ${binding.package} without version ${binding.version} and patch_hash=${hash}: malformed pnpm reference ${reference}`,
      );
      return;
    }
    for (const node of nodes) {
      if (
        node.name === binding.package &&
        (node.version !== binding.version || node.patchHash !== hash)
      ) {
        failures.push(
          `${label} ${source} references ${binding.package} without version ${binding.version} and patch_hash=${hash}: ${reference}`,
        );
      }
    }
  };
  const patchedSnapshots = Object.keys(lockfile.snapshots).filter(
    (candidate) => lockfilePackageName(candidate) === binding.package,
  );
  if (patchedSnapshots.length === 0) {
    failures.push(`${label} has no patched ${key} snapshot in ${LOCKFILE_PATH}`);
  }
  for (const [snapshotKey, snapshot] of Object.entries(lockfile.snapshots)) {
    validateReference(snapshotKey, `snapshot ${snapshotKey}`);
    if (lockfilePackageName(snapshotKey) === binding.package && !isRecord(snapshot)) {
      failures.push(`${label} requires snapshot metadata for ${snapshotKey} in ${LOCKFILE_PATH}`);
    }
    for (const field of IMPORTER_FIELDS) {
      for (const [name, version] of Object.entries(snapshot?.[field] ?? {})) {
        const reference = lockfileDependencyKey(name, version);
        validateReference(reference, `${snapshotKey} ${field}.${name}`);
        if (
          lockfilePackageName(reference) === binding.package &&
          !Object.hasOwn(lockfile.snapshots, reference)
        ) {
          failures.push(`${label} ${snapshotKey} reaches missing patched snapshot ${reference}`);
        }
      }
    }
  }
  for (const [importer, definition] of Object.entries(lockfile.importers)) {
    for (const field of IMPORTER_FIELDS) {
      for (const [name, dependency] of Object.entries(definition?.[field] ?? {})) {
        const reference = lockfileDependencyKey(name, dependency?.version ?? '');
        validateReference(reference, `importer ${importer} ${field}.${name}`);
        if (
          lockfilePackageName(reference) === binding.package &&
          !Object.hasOwn(lockfile.snapshots, reference)
        ) {
          failures.push(
            `${label} importer ${importer} reaches missing patched snapshot ${reference}`,
          );
        }
      }
    }
  }
  if (Array.isArray(entry.dependents?.packages) && Array.isArray(entry.dependents?.importers)) {
    const dependents = lockfileDependents(lockfile, binding.package);
    const { reaching } = walkImporters(lockfile, binding.package);
    for (const [field, actual] of [
      ['packages', dependents],
      ['importers', reaching],
    ]) {
      for (const permitted of entry.dependents[field]) {
        if (!actual.includes(permitted)) {
          failures.push(
            `${label} has a broader dependent ${field} scope than ${LOCKFILE_PATH}: ${permitted}`,
          );
        }
      }
    }
  }
  return failures;
}

export function parsePnpmAuditIgnores(manifest) {
  const auditConfig = manifest?.pnpm?.auditConfig ?? {};
  return [...(auditConfig.ignoreGhsas ?? []), ...(auditConfig.ignoreCves ?? [])];
}

export function checkSecurityGates({
  policy,
  workflow,
  denyToml,
  workflows = {},
  manifest,
  lockfile,
  patchContents = {},
  today = new Date().toISOString().slice(0, 10),
}) {
  const failures = [];

  // A gate may name its own workflow: the container, IaC and DAST scanners need
  // Docker and a booted application, so they cannot live in the pull-request
  // workflow. Without this the registry could only describe one file, and a gate
  // moved out of it would silently stop being registered anywhere.
  const workflowFor = (gate) => (gate.workflow ? workflows[gate.workflow] : workflow);

  for (const gate of policy.gates ?? []) {
    const gateWorkflow = workflowFor(gate);
    if (!gateWorkflow) {
      failures.push(`gate ${gate.id} names workflow ${gate.workflow}, which was not loaded`);
      continue;
    }
    const step = findStep(gateWorkflow, gate.job, gate.step);
    if (!step) {
      failures.push(`gate ${gate.id} is registered but job ${gate.job} has no step "${gate.step}"`);
      continue;
    }
    if (step['continue-on-error'] === true) {
      failures.push(`gate ${gate.id} is registered as blocking but the step is continue-on-error`);
    }
    if (!gate.blocksAt) {
      failures.push(`gate ${gate.id} does not document the severity it blocks at`);
    }
  }

  const registeredExclusions = new Map(
    (policy.exclusions ?? [])
      .filter((entry) => entry.kind === 'continue-on-error')
      .map((entry) => [`${entry.job}::${entry.step}`, entry]),
  );

  for (const found of collectContinueOnErrorSteps(workflow)) {
    const entry = registeredExclusions.get(`${found.job}::${found.step}`);
    if (!entry) {
      failures.push(
        `${found.job} step "${found.step}" is continue-on-error but is not registered in ${POLICY_PATH}`,
      );
      continue;
    }
    for (const field of ['reason', 'owner', 'tracking']) {
      if (!entry[field]) {
        failures.push(`exclusion ${entry.id} must state a ${field}`);
      }
    }
  }

  for (const entry of registeredExclusions.values()) {
    const found = findStep(workflow, entry.job, entry.step);
    if (!found) {
      failures.push(
        `exclusion ${entry.id} names a step that no longer exists: ${entry.job} / ${entry.step}`,
      );
    } else if (found['continue-on-error'] !== true) {
      failures.push(`exclusion ${entry.id} is stale: the step now blocks and must be deregistered`);
    }
  }

  const registeredIgnores = new Set(
    (policy.exclusions ?? [])
      .filter((entry) => entry.kind === 'cargo-deny-advisory-ignore')
      .flatMap((entry) => entry.advisories ?? []),
  );
  for (const advisory of parseDenyAdvisoryIgnores(denyToml)) {
    if (!registeredIgnores.has(advisory)) {
      failures.push(`${DENY_PATH} ignores ${advisory} without registering it in ${POLICY_PATH}`);
    }
  }

  const auditWaivers = (policy.exclusions ?? []).filter(
    (entry) => entry.kind === 'pnpm-audit-advisory-ignore',
  );
  for (const entry of policy.exclusions ?? []) {
    const bindings = new Set([
      ...(Array.isArray(entry.advisories) ? entry.advisories : [])
        .map((advisory) => PATCHED_ADVISORIES[advisory])
        .filter(Boolean),
      ...Object.values(PATCHED_ADVISORIES).filter((binding) => binding.package === entry.package),
    ]);
    for (const binding of bindings) {
      if (entry.kind !== 'pnpm-audit-advisory-ignore') {
        failures.push(
          `exclusion ${entry.id} for ${binding.package} must remain a patched pnpm-audit-advisory-ignore`,
        );
      }
      failures.push(
        ...patchedAuditWaiverFailures(entry, binding, manifest, lockfile, patchContents),
      );
    }
  }
  const waivedAdvisories = new Set(auditWaivers.flatMap((entry) => entry.advisories ?? []));
  const ignoredAdvisories = parsePnpmAuditIgnores(manifest);
  for (const advisory of ignoredAdvisories) {
    if (!waivedAdvisories.has(advisory)) {
      failures.push(
        `${MANIFEST_PATH} ignores ${advisory} without registering it in ${POLICY_PATH}`,
      );
    }
  }
  for (const entry of auditWaivers) {
    for (const field of ['reason', 'owner', 'tracking']) {
      if (!entry[field]) {
        failures.push(`exclusion ${entry.id} must state a ${field}`);
      }
    }
    if (!isCalendarDate(entry.expires)) {
      failures.push(
        `exclusion ${entry.id} must set expires to a real calendar date in YYYY-MM-DD form`,
      );
    } else if (entry.expires < today) {
      failures.push(
        `exclusion ${entry.id} expired on ${entry.expires}: fix the advisory or re-triage the waiver`,
      );
    }
    failures.push(...auditWaiverScopeFailures(entry, lockfile));
    for (const advisory of entry.advisories ?? []) {
      if (!ignoredAdvisories.includes(advisory)) {
        failures.push(
          `exclusion ${entry.id} is stale: ${MANIFEST_PATH} no longer ignores ${advisory}`,
        );
      }
    }
  }

  return failures;
}

function main() {
  const root = process.cwd();
  const policy = JSON.parse(fs.readFileSync(path.join(root, POLICY_PATH), 'utf8'));
  const workflow = parse(fs.readFileSync(path.join(root, policy.workflow), 'utf8'));
  const denyToml = fs.readFileSync(path.join(root, DENY_PATH), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
  const lockfile = parse(fs.readFileSync(path.join(root, LOCKFILE_PATH), 'utf8'));
  const patchContents = {};
  const patchFileFailures = [];
  const realRoot = fs.realpathSync(root);
  for (const entry of policy.exclusions ?? []) {
    if (!isRecord(entry.patch)) continue;
    const relativePath = entry.patch.path;
    if (
      typeof relativePath !== 'string' ||
      path.isAbsolute(relativePath) ||
      relativePath.includes('\\') ||
      relativePath.split('/').includes('..') ||
      path.posix.normalize(relativePath) !== relativePath
    ) {
      patchFileFailures.push(`exclusion ${entry.id} must use a normalized in-root patch path`);
      continue;
    }
    const absolute = path.resolve(root, relativePath);
    try {
      const realPath = fs.realpathSync(absolute);
      const withinRoot = path.relative(realRoot, realPath);
      if (
        withinRoot === '..' ||
        withinRoot.startsWith(`..${path.sep}`) ||
        path.isAbsolute(withinRoot)
      ) {
        patchFileFailures.push(
          `exclusion ${entry.id} patch ${relativePath} resolves outside the repository root`,
        );
      } else if (!fs.lstatSync(absolute).isFile() || !fs.statSync(realPath).isFile()) {
        patchFileFailures.push(
          `exclusion ${entry.id} patch ${relativePath} must be a regular file`,
        );
      } else {
        patchContents[relativePath] = fs.readFileSync(realPath);
      }
    } catch {
      patchFileFailures.push(
        `exclusion ${entry.id} patch ${relativePath} is missing or unreadable`,
      );
    }
  }

  const workflows = {};
  for (const relativePath of new Set(
    (policy.gates ?? []).map((gate) => gate.workflow).filter(Boolean),
  )) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) continue;
    workflows[relativePath] = parse(fs.readFileSync(absolute, 'utf8'));
  }

  const failures = checkSecurityGates({
    policy,
    workflow,
    denyToml,
    workflows,
    manifest,
    lockfile,
    patchContents,
  });
  failures.push(...patchFileFailures);
  for (const entry of policy.exclusions ?? []) {
    if (entry.kind === 'allowlist-file' && !fs.existsSync(path.join(root, entry.path))) {
      failures.push(`exclusion ${entry.id} points at a missing allowlist: ${entry.path}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `${(policy.gates ?? []).length} security gates blocking as documented, ${(policy.exclusions ?? []).length} exclusions registered\n`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}

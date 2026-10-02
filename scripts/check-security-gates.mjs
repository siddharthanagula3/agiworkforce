#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const POLICY_PATH = '.github/security-gate-policy.json';
const DENY_PATH = 'deny.toml';
const MANIFEST_PATH = 'package.json';
const LOCKFILE_PATH = 'pnpm-lock.yaml';
const IMPORTER_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const RUNTIME_FIELDS = ['dependencies', 'optionalDependencies'];

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

function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lockfilePackageName(key) {
  return key.slice(0, key.indexOf('@', 1));
}

function lockfileDependencyKey(name, version) {
  const reference = String(version);
  return reference.split('(')[0].lastIndexOf('@') > 0 ? reference : `${name}@${reference}`;
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
  });
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

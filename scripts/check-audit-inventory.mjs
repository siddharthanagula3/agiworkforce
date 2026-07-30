#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const inventoryPath = path.join(root, 'audit/inventory.json');
const validStatuses = ['built', 'partial', 'stub', 'unwired', 'broken', 'missing', 'unclear'];
const baselineTally = {
  built: 390,
  partial: 62,
  stub: 13,
  unwired: 30,
  broken: 10,
  missing: 144,
  unclear: 5,
};
const expectedSurfaceCounts = {
  'apps/web': 75,
  'apps/desktop': 50,
  'apps/chrome-extension': 49,
  'apps/mobile': 54,
  'apps/cli': 63,
  'apps/ide-extensions': 41,
  'apps/slack-app': 38,
  'apps/github-app': 37,
  'packages/core-agent': 37,
  'packages/extensibility': 21,
  'packages/tools/mcp': 19,
  'packages/permissions': 19,
  'packages/sessions': 19,
  'packages/memory': 15,
  'packages/auth': 22,
  'packages/settings': 14,
  'packages/platform': 31,
  'packages/safety': 12,
  'admin-and-billing': 26,
  'release-infra': 12,
};
const expectedTotal = Object.values(expectedSurfaceCounts).reduce((sum, count) => sum + count, 0);
const expectedIdentitySha256 = 'eaec32f07e1f5aa98c02d4031de422b49cbf309427e161cc2c4d09c82aaf2c8c';

function fail(errors) {
  console.error('Audit inventory check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

function surfaceForSection(section) {
  const mappings = [
    [/^web-/, 'apps/web'],
    [/^desktop-/, 'apps/desktop'],
    [/^chrome-/, 'apps/chrome-extension'],
    [/^mobile-/, 'apps/mobile'],
    [/^cli-/, 'apps/cli'],
    [/^ide-extensions$/, 'apps/ide-extensions'],
    [/^slack-app$/, 'apps/slack-app'],
    [/^github-app$/, 'apps/github-app'],
    [/^core-agent$/, 'packages/core-agent'],
    [/^extensibility$/, 'packages/extensibility'],
    [/^mcp$/, 'packages/tools/mcp'],
    [/^permissions$/, 'packages/permissions'],
    [/^sessions$/, 'packages/sessions'],
    [/^memory$/, 'packages/memory'],
    [/^auth$/, 'packages/auth'],
    [/^settings$/, 'packages/settings'],
    [/^platform$/, 'packages/platform'],
    [/^safety$/, 'packages/safety'],
    [/^admin-and-billing$/, 'admin-and-billing'],
    [/^release-infra$/, 'release-infra'],
  ];

  for (const [pattern, surface] of mappings) {
    if (pattern.test(section)) return surface;
  }
  throw new Error(`No inventory surface mapping for audit section ${JSON.stringify(section)}`);
}

function importInventory(sourcePath) {
  const absoluteSourcePath = path.resolve(sourcePath);
  const source = JSON.parse(fs.readFileSync(absoluteSourcePath, 'utf8'));
  if (!Array.isArray(source.sections)) {
    throw new Error(`${absoluteSourcePath} does not contain a sections array`);
  }

  const records = source.sections.flatMap(({ section, items }) => {
    if (!Array.isArray(items)) {
      throw new Error(`Audit section ${JSON.stringify(section)} does not contain an items array`);
    }
    const surface = surfaceForSection(section);
    return items.map(({ item, status, evidence }) => ({ item, surface, status, evidence }));
  });

  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
  fs.writeFileSync(inventoryPath, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`Imported ${records.length} records into ${path.relative(root, inventoryPath)}.`);
}

function validateInventory({ expectBaseline }) {
  if (!fs.existsSync(inventoryPath)) {
    fail([`Missing ${path.relative(root, inventoryPath)}`]);
  }

  let records;
  try {
    records = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  } catch (error) {
    fail([`inventory.json is not valid JSON: ${error.message}`]);
  }

  const errors = [];
  if (!Array.isArray(records)) {
    fail(['inventory.json must be an array with one record per checklist item']);
  }
  if (records.length !== expectedTotal) {
    errors.push(`Expected ${expectedTotal} records, found ${records.length}`);
  }

  const tally = Object.fromEntries(validStatuses.map((status) => [status, 0]));
  const surfaceCounts = Object.fromEntries(
    Object.keys(expectedSurfaceCounts).map((surface) => [surface, 0]),
  );
  const identities = new Set();
  const expectedKeys = ['evidence', 'item', 'status', 'surface'];

  for (const [index, record] of records.entries()) {
    const label = `record ${index + 1}`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`${label} must be an object`);
      continue;
    }

    const keys = Object.keys(record).sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      errors.push(`${label} must contain exactly item, surface, status, and evidence`);
    }
    if (typeof record.item !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(record.item)) {
      errors.push(`${label} has an invalid item identifier`);
    }
    if (!Object.hasOwn(expectedSurfaceCounts, record.surface)) {
      errors.push(`${label} has unknown surface ${JSON.stringify(record.surface)}`);
    } else {
      surfaceCounts[record.surface] += 1;
    }
    if (!validStatuses.includes(record.status)) {
      errors.push(`${label} has unknown status ${JSON.stringify(record.status)}`);
    } else {
      tally[record.status] += 1;
    }
    if (typeof record.evidence !== 'string' || record.evidence.trim().length < 20) {
      errors.push(`${label} must contain substantive evidence`);
    }

    const identity = `${record.surface}:${record.item}`;
    if (identities.has(identity)) {
      errors.push(`Duplicate checklist identity ${identity}`);
    }
    identities.add(identity);
  }

  for (const [surface, expectedCount] of Object.entries(expectedSurfaceCounts)) {
    if (surfaceCounts[surface] !== expectedCount) {
      errors.push(
        `${surface} must contain ${expectedCount} records, found ${surfaceCounts[surface]}`,
      );
    }
  }

  const identitySha256 = createHash('sha256')
    .update([...identities].sort().join('\n'))
    .digest('hex');
  if (identitySha256 !== expectedIdentitySha256) {
    errors.push(
      'Checklist identities do not match the audited 654-item baseline; item and surface names are immutable',
    );
  }

  if (expectBaseline) {
    for (const status of validStatuses) {
      if (tally[status] !== baselineTally[status]) {
        errors.push(
          `Baseline ${status} tally must be ${baselineTally[status]}, found ${tally[status]}`,
        );
      }
    }
  }

  if (errors.length > 0) fail(errors);
  return { records: records.length, tally, surfaces: surfaceCounts };
}

const args = process.argv.slice(2);
const importIndex = args.indexOf('--import');
if (importIndex !== -1) {
  const sourcePath = args[importIndex + 1];
  if (!sourcePath) fail(['--import requires a checklist-results.json path']);
  try {
    importInventory(sourcePath);
  } catch (error) {
    fail([error.message]);
  }
}

const result = validateInventory({ expectBaseline: args.includes('--expect-baseline') });
if (args.includes('--json')) {
  console.log(JSON.stringify(result));
} else {
  console.log(`Audit inventory valid: ${result.records} records.`);
  for (const status of validStatuses) {
    console.log(`${status.padEnd(7)} ${result.tally[status]}`);
  }
}

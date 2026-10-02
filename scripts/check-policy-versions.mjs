#!/usr/bin/env node
// A published policy says when it last changed. This holds every canonical
// policy page to a dated version history, so its text cannot move while the
// date it prints stays behind.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  REGISTRY as MODEL_REGISTRY,
  declaredProviderIds,
  recipientNames,
} from './check-subprocessor-coverage.mjs';
import {
  ARCHIVE_COMMAND,
  archiveExpectations,
  archiveFile,
  datedVersions,
  lastDigest,
  publicationStanding,
  readGitObjects,
  runPolicyArchiveCheck,
} from './lib/policy-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONSTANTS = 'apps/web/lib/legal-constants.ts';
export const REGISTRY = 'docs/compliance/policy-versions.json';
export const PROVIDER_CATALOG = 'packages/contracts/types/src/models.json';

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_SHAPE = /^[0-9a-f]{40}$/;
const MIN_NOTE_LENGTH = 20;
const SUBPROCESSOR_LIST = 'subprocessors';
const COPY_TOKEN =
  /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|(?<=[>}])[^<>{}]+(?=[<{])/g;

/** The string entries of one `export const NAME = { ... } as const` object. */
export function readConstantObject(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start < 0) return null;
  const end = source.indexOf('} as const', start);
  if (end < 0) return null;
  const body = source.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/^\s+([A-Za-z][A-Za-z0-9]*): '([^']*)',?$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

/**
 * The text a page publishes: prose string literals and JSX text, in order,
 * with comments, imports, styling attributes and single-token strings left
 * out, so a reformat or a styling change does not read as a new version.
 */
export function publishedCopy(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|import\s|\}\s*from\s)/.test(line))
    .join('\n')
    .replace(/\bclassName=(?:"[^"]*"|'[^']*'|\{[^{}]*\})/g, ' ')
    .replace(/\bstyle=\{\{[^{}]*\}\}/g, ' ');
  const pieces = [];
  for (const match of stripped.matchAll(COPY_TOKEN)) {
    let text = match[0];
    if (/^['"`]/.test(text)) {
      text = text.slice(1, -1);
      if (!/\s/.test(text.trim())) continue;
    } else if (!/[A-Za-z]/.test(text) || /=/.test(text)) {
      continue;
    }
    pieces.push(text.replace(/\s+/g, ' ').trim());
  }
  return pieces.join('\n');
}

export function copyDigest(source) {
  return crypto.createHash('sha256').update(publishedCopy(source)).digest('hex').slice(0, 16);
}

export function pageFor(route) {
  return `apps/web/app${route}/page.tsx`;
}

function listedName(name) {
  return name.split(' (')[0];
}

function listChange(before, after) {
  const added = after.filter((name) => !before.includes(name));
  const removed = before.filter((name) => !after.includes(name));
  return {
    names: [...added, ...removed],
    text: [
      ...(added.length > 0 ? [`added ${added.join(', ')}`] : []),
      ...(removed.length > 0 ? [`removed ${removed.join(', ')}`] : []),
    ].join('; '),
  };
}

function compact(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function namesInWords(summary, name) {
  const target = compact(name);
  const words = summary
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return (
    target.length > 0 &&
    words.some((_, start) => {
      let joined = '';
      for (const word of words.slice(start)) {
        joined += word;
        if (joined === target) return true;
        if (!target.startsWith(joined)) return false;
      }
      return false;
    })
  );
}

const SUBPROCESSOR_RECORDS = [
  {
    field: 'subprocessorNames',
    subject: 'the subprocessor list',
    listed: (source) => recipientNames(source),
    display: listedName,
    named: (summary, name) => summary.includes(listedName(name)),
  },
  {
    field: 'subprocessorProviders',
    subject: 'the set of providers the subprocessor list names',
    listed: (source) =>
      [...declaredProviderIds(source).declared].map((id) => id.replace(/_anthropic$/, '')),
    display: (id) => id,
    named: (summary, id, labels) =>
      [id, labels.get(id)].some((name) => namesInWords(summary, name ?? '')),
  },
];

function providerLabels(root, failures) {
  try {
    const { gateways = {} } = JSON.parse(fs.readFileSync(path.join(root, MODEL_REGISTRY), 'utf8'));
    const { providers = {} } = JSON.parse(
      fs.readFileSync(path.join(root, PROVIDER_CATALOG), 'utf8'),
    );
    return new Map([
      ...Object.values(gateways).map((gateway) => [gateway.id, gateway.displayName]),
      ...Object.entries(providers).map(([id, provider]) => [id, provider.label]),
    ]);
  } catch (error) {
    failures.push(
      `the provider labels in ${PROVIDER_CATALOG} and ${MODEL_REGISTRY} could not be read, so a summary can name a provider only by its id: ${error.message}`,
    );
    return new Map();
  }
}

function checkSubprocessorRecord(page, source, versions, record, labels, failures) {
  const where = `${REGISTRY} "${SUBPROCESSOR_LIST}"`;
  let recorded = null;
  for (const [position, version] of versions.entries()) {
    const values = version[record.field];
    if (values === undefined) continue;
    const at = `${where} version ${position + 1}`;
    if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) {
      failures.push(`${at}: ${record.field} must list what the page showed`);
      continue;
    }
    const listed = [...new Set(values)].sort();
    const change = recorded ? listChange(recorded, listed) : null;
    if (change && change.names.length > 0) {
      if (version.date === versions[position - 1]?.date) {
        failures.push(
          `${at}: ${record.subject} changed (${change.text}) under an entry whose date did not move, so /changelog never lists it; move POLICY_LAST_UPDATED.${SUBPROCESSOR_LIST} and record ${record.field} on the entry that moves it`,
        );
      } else {
        const unnamed = change.names.filter(
          (value) => !record.named(version.summary ?? '', value, labels),
        );
        if (unnamed.length > 0) {
          failures.push(
            `${at}: the summary does not name ${unnamed.map(record.display).join(', ')}, which this version ${change.text}`,
          );
        }
      }
    }
    recorded = listed;
  }
  if (recorded === null) {
    failures.push(
      `${where}: no version records ${record.field}, so a change to ${record.subject} cannot be held to a dated entry; record what ${page} lists on its latest version`,
    );
    return;
  }
  const change = listChange(recorded, [...new Set(record.listed(source))].sort());
  if (change.names.length > 0) {
    failures.push(
      `${page}: ${record.subject} changed and the registry has not recorded it (${change.text}); append a version that moves the date, with ${record.field} and a summary naming the change`,
    );
  }
}

function checkDocument(root, key, route, date, entry, failures) {
  const where = `${REGISTRY} "${key}"`;
  const page = pageFor(route);
  if (entry.page !== page) {
    failures.push(`${where}: page is "${entry.page}", the route ${route} is served by "${page}"`);
    return;
  }
  const target = path.join(root, page);
  if (!fs.existsSync(target)) {
    failures.push(`${where}: ${page} does not exist`);
    return;
  }
  const source = fs.readFileSync(target, 'utf8');
  if (date !== null && !source.includes(`POLICY_LAST_UPDATED.${key}`)) {
    failures.push(
      `${page}: does not print POLICY_LAST_UPDATED.${key}, so the date /legal shows is not the one the page shows`,
    );
  }

  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  if (versions.length === 0) {
    failures.push(`${where}: records no version`);
    return;
  }
  let previous = null;
  for (const [position, version] of versions.entries()) {
    const at = `${where} version ${position + 1}`;
    if (version.date !== null && !DATE_SHAPE.test(version.date ?? '')) {
      failures.push(`${at}: date is neither a date nor null`);
    }
    if (!/^[0-9a-f]{16}$/.test(version.digest ?? '')) {
      failures.push(`${at}: digest is not 16 hex characters`);
    }
    const unmoved = previous === null || version.date === previous.date;
    if (
      unmoved &&
      (typeof version.note !== 'string' || version.note.trim().length < MIN_NOTE_LENGTH)
    ) {
      failures.push(
        previous === null
          ? `${at}: the first recorded version must say what it records`
          : `${at}: the text changed and the date did not, which needs a note saying why the change is editorial`,
      );
    }
    if (
      previous !== null &&
      version.date !== null &&
      previous.date !== null &&
      version.date < previous.date
    ) {
      failures.push(`${at}: dated ${version.date}, before the version it follows`);
    }
    previous = version;
  }

  const latest = versions[versions.length - 1];
  if (latest.date !== date) {
    failures.push(
      `${where}: the latest version is dated ${latest.date}, while POLICY_LAST_UPDATED.${key} is ${date}; record the version the page now prints`,
    );
  }
  const digest = copyDigest(source);
  if (latest.digest !== digest) {
    failures.push(
      `${page}: the published text changed since its last recorded version. If the change is substantive, move POLICY_LAST_UPDATED.${key} to the day it ships; either way append {"date", "digest": "${digest}"} to ${REGISTRY}, with a note when the date does not move`,
    );
  }
  if (key === SUBPROCESSOR_LIST) {
    const labels = providerLabels(root, failures);
    for (const record of SUBPROCESSOR_RECORDS) {
      checkSubprocessorRecord(page, source, versions, record, labels, failures);
    }
  }
}

export function runPolicyVersionsCheck(root) {
  const failures = [];
  const constantsPath = path.join(root, CONSTANTS);
  const registryPath = path.join(root, REGISTRY);
  if (!fs.existsSync(constantsPath)) return [`${CONSTANTS} does not exist`];
  if (!fs.existsSync(registryPath)) return [`${REGISTRY} does not exist`];

  const constants = fs.readFileSync(constantsPath, 'utf8');
  const routes = readConstantObject(constants, 'CANONICAL_POLICY_ROUTES');
  const dates = readConstantObject(constants, 'POLICY_LAST_UPDATED');
  if (!routes || Object.keys(routes).length === 0 || !dates) {
    return [`${CONSTANTS}: CANONICAL_POLICY_ROUTES or POLICY_LAST_UPDATED could not be read`];
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (error) {
    return [`${REGISTRY} is not valid JSON: ${error.message}`];
  }
  const documents = registry.documents ?? {};
  if (!DATE_SHAPE.test(registry.recordedSince ?? '')) {
    failures.push(
      `${REGISTRY}: recordedSince must be the date these version histories began, so a policy first published after it is listed on /changelog`,
    );
  }

  for (const key of Object.keys(dates)) {
    if (!(key in routes))
      failures.push(`${CONSTANTS}: POLICY_LAST_UPDATED.${key} dates no canonical route`);
  }
  for (const [key, route] of Object.entries(routes)) {
    const entry = documents[key];
    if (!entry) {
      failures.push(`${REGISTRY}: ${route} is a canonical policy route with no recorded version`);
      continue;
    }
    checkDocument(root, key, route, dates[key] ?? null, entry, failures);
  }
  for (const key of Object.keys(documents)) {
    if (!(key in routes))
      failures.push(`${REGISTRY}: "${key}" is not a canonical policy route any more`);
  }
  return failures;
}

function onHistory(root, commit) {
  return (
    spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', commit, 'HEAD'], {
      stdio: 'ignore',
    }).status === 0
  );
}

export function readPublications(root, registry) {
  const where = `${REGISTRY} "publications"`;
  const entries = Array.isArray(registry.publications) ? registry.publications : [];
  if (entries.length === 0) {
    return {
      records: [],
      failures: [
        `${where}: record what production served on at least one day, so each replaced version can say whether this site published it`,
      ],
    };
  }
  const failures = [];
  const checks = entries.map((entry, index) => {
    const at = `${where} record ${index + 1}`;
    if (!DATE_SHAPE.test(entry.checkedOn ?? '')) {
      failures.push(`${at}: checkedOn must be the day production was checked`);
    }
    if (index > 0 && entry.checkedOn < entries[index - 1].checkedOn) {
      failures.push(`${at}: checked on ${entry.checkedOn}, before the record it follows`);
    }
    if (typeof entry.note !== 'string' || entry.note.trim().length < MIN_NOTE_LENGTH) {
      failures.push(`${at}: the note must say how production was checked`);
    }
    for (const role of ['served', 'main']) {
      if (!COMMIT_SHAPE.test(entry[role] ?? '')) {
        failures.push(`${at}: ${role} must be a full commit id`);
      }
    }
    return { at, entry };
  });
  if (failures.length > 0) return { records: [], failures };

  let constants;
  try {
    constants = readGitObjects(
      root,
      entries.flatMap((entry) => [`${entry.served}:${CONSTANTS}`, `${entry.main}:${CONSTANTS}`]),
    );
  } catch (error) {
    return {
      records: [],
      failures: [`${where}: the recorded commits could not be read: ${error.message}`],
    };
  }

  const records = [];
  for (const [index, { at, entry }] of checks.entries()) {
    const dates = {};
    for (const [offset, role] of ['served', 'main'].entries()) {
      const source = constants[index * 2 + offset];
      const printed = source === null ? null : readConstantObject(source, 'POLICY_LAST_UPDATED');
      if (!printed) {
        failures.push(
          `${at}: ${role} names commit ${entry[role]}, which this clone does not hold with ${CONSTANTS}; fetch the full history`,
        );
      } else if (!onHistory(root, entry[role])) {
        failures.push(
          `${at}: ${role} names commit ${entry[role]}, which is not on the history of this branch, so a clone of the branch, such as the one CI checks, cannot read it; record a commit on main with the same policy dates`,
        );
      } else {
        dates[role] = printed;
      }
    }
    if (!dates.served || !dates.main) continue;
    for (const [key, date] of Object.entries(dates.served)) {
      const recorded = datedVersions(registry.documents?.[key] ?? {});
      if (recorded.length > 0 && !recorded.some((version) => version.date === date)) {
        failures.push(
          `${REGISTRY} "${key}": production served the version dated ${date} when ${at} was checked, and the history does not record it; add it as the version it was, with the digest of its text at ${entry.served}`,
        );
      }
    }
    records.push({ checkedOn: entry.checkedOn, served: dates.served, main: dates.main });
  }
  return { records, failures };
}

export function runPolicyArchiveSourceCheck(root, registry, routes) {
  const exists = (key, date) => fs.existsSync(path.join(root, archiveFile(key, date)));
  const sources = Object.entries(archiveExpectations(registry, routes, exists)).flatMap(
    ([key, policy]) =>
      policy.versions
        .filter((version) => version.status === 'archived')
        .map((version) => {
          const file = archiveFile(key, version.date);
          const { commit } = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
          return { key, date: version.date, file, commit, page: registry.documents[key].page };
        }),
  );
  let objects;
  try {
    objects = readGitObjects(
      root,
      sources.flatMap((source) => [
        `${source.commit}:${source.page}`,
        `${source.commit}:${CONSTANTS}`,
      ]),
    );
  } catch (error) {
    return [`the archived policy versions' source commits could not be read: ${error.message}`];
  }
  const failures = [];
  for (const [index, source] of sources.entries()) {
    const [page, constants] = objects.slice(index * 2, index * 2 + 2);
    if (page === null || constants === null) {
      failures.push(
        `${source.file}: names commit ${source.commit}, which this clone does not hold with ${source.page}; fetch the full history, or if that commit is gone, delete the file and run ${ARCHIVE_COMMAND}`,
      );
      continue;
    }
    if (!onHistory(root, source.commit)) {
      failures.push(
        `${source.file}: names commit ${source.commit}, which is not on the history of this branch, so a clone of the branch, such as the one CI checks, cannot read it once the branch that held it is gone; delete the file and run ${ARCHIVE_COMMAND}`,
      );
      continue;
    }
    const printed = readConstantObject(constants, 'POLICY_LAST_UPDATED')?.[source.key] ?? null;
    if (printed !== source.date) {
      failures.push(
        `${source.file}: renders ${source.page} at ${source.commit}, which printed ${printed ?? 'no date'} rather than ${source.date}; delete it and run ${ARCHIVE_COMMAND}`,
      );
      continue;
    }
    const digest = copyDigest(page);
    const expected = lastDigest(registry.documents[source.key], source.date);
    if (digest !== expected) {
      const recordedOn = registry.documents[source.key].versions.find(
        (version) => version.digest === digest,
      )?.date;
      failures.push(
        `${source.file}: holds the text with digest ${digest}${recordedOn ? `, which ${REGISTRY} records under ${recordedOn}` : ''}, not ${expected}, the text ${REGISTRY} last records under ${source.date}; delete it and run ${ARCHIVE_COMMAND}`,
      );
    }
  }
  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runPolicyVersionsCheck(root);
  if (failures.length === 0) {
    const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY), 'utf8'));
    const routes = readConstantObject(
      fs.readFileSync(path.join(root, CONSTANTS), 'utf8'),
      'CANONICAL_POLICY_ROUTES',
    );
    const publications = readPublications(root, registry);
    failures.push(
      ...publications.failures,
      ...runPolicyArchiveCheck(root, registry, routes, publicationStanding(publications.records)),
      ...runPolicyArchiveSourceCheck(root, registry, routes),
    );
  }
  if (failures.length > 0) {
    console.error('Published policy text and its dates have drifted apart:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY), 'utf8'));
  console.log(
    `check-policy-versions: ${Object.keys(registry.documents).length} policy pages match their latest recorded version and print its date.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const outDir = path.join(repoRoot, 'docs', 'generated');

const SOURCE = 'packages/ai/model-registry/catalog/harnesses.json';

const DO_NOT_EDIT = [
  '<!-- GENERATED FILE, do not edit.',
  `     Source: ${SOURCE}`,
  '     Render: node scripts/generate-doc-matrices.mjs',
  '     Verify: pnpm check:doc-matrices -->',
].join('\n');

const MARK = { implemented: '✅', partial: '◐', unwired: '-', planned: '·' };

function mark(value) {
  return MARK[value] ?? String(value ?? ', ');
}

function readSource() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, SOURCE), 'utf8'));
}

export function renderTrustModeMatrix(harnesses) {
  const profiles = Object.entries(harnesses.runtimeProfiles ?? {});
  const featureKeys = [
    ...new Set(profiles.flatMap(([, p]) => Object.keys(p.features ?? {}))),
  ].sort();

  const head = ['| Surface | Trust mode | Status |', '| --- | --- | --- |'];
  const header = `| Surface | Trust mode | Status | ${featureKeys.join(' | ')} |`;
  const divider = `| --- | --- | --- | ${featureKeys.map(() => '---').join(' | ')} |`;
  void head;

  const rows = profiles
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, profile]) => {
      const cells = featureKeys.map((f) => mark(profile.features?.[f]?.implementation));
      return `| \`${key}\` | ${profile.trustMode ?? ', '} | ${mark(profile.status)} | ${cells.join(' | ')} |`;
    });

  return [
    DO_NOT_EDIT,
    '',
    '# Trust mode and surface matrix',
    '',
    `Rendered from \`${SOURCE}\`, ${profiles.length} runtime profiles.`,
    '',
    'This table reports what the harness catalog says is **implemented**. It is',
    'not policy. The invariants that govern these surfaces, which trust modes may',
    'exist, and what may never cross between them, are stated in',
    '`docs/architecture/trust-boundaries.md`, and that document wins. Where a cell',
    'here disagrees with it, one of the two is a bug; decide which before changing',
    'either.',
    '',
    `Legend: ${Object.entries(MARK)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')}`,
    '',
    header,
    divider,
    ...rows,
    '',
  ].join('\n');
}

export function renderProviderCapabilityMatrix(harnesses) {
  // harnessGroups maps a group name to an ARRAY of harness ids; the per-harness
  // record lives in harnesses.harnesses. Reading group values as objects yields
  // undefined for every field, which is how this table rendered four rows of
  // em-dashes and still claimed to be generated.
  const groups = harnesses.harnessGroups ?? {};
  const groupOf = new Map();
  for (const [group, members] of Object.entries(groups)) {
    for (const id of members ?? []) groupOf.set(id, group);
  }

  const entries = Object.entries(harnesses.harnesses ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const featureKeys = [
    ...new Set(entries.flatMap(([, h]) => Object.keys(h.features ?? {}))),
  ].sort();

  const rows = entries.map(([id, h]) => {
    const cells = featureKeys.map((f) => mark(h.features?.[f]?.implementation));
    return `| \`${id}\` | ${h.provider ?? ', '} | ${h.apiFamily ?? ', '} | ${(h.trustModes ?? []).join(', ') || ', '} | ${groupOf.get(id) ?? ', '} | ${cells.join(' | ')} |`;
  });

  const header = `| Harness | Provider | API family | Trust modes | Group | ${featureKeys.join(' | ')} |`;
  const divider = `| --- | --- | --- | --- | --- | ${featureKeys.map(() => '---').join(' | ')} |`;

  return [
    DO_NOT_EDIT,
    '',
    '# Provider capability matrix',
    '',
    `Rendered from \`${SOURCE}\`, ${entries.length} harnesses in ${Object.keys(groups).length} groups.`,
    '',
    'Each row is one provider route. The feature columns report what the catalog',
    'says is **implemented** on that route, not what the provider is capable of.',
    '',
    'Routing policy, privacy claims and the ZDR position are prose in',
    '`docs/architecture/provider-routing.md`. This table only reports the wiring.',
    '',
    `Legend: ${Object.entries(MARK)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')}`,
    '',
    header,
    divider,
    ...rows,
    '',
  ].join('\n');
}

export function renderMatrices() {
  const harnesses = readSource();
  return {
    'trust-mode-surface-matrix.md': renderTrustModeMatrix(harnesses),
    'provider-capability-matrix.md': renderProviderCapabilityMatrix(harnesses),
  };
}

function main() {
  const matrices = renderMatrices();
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, body] of Object.entries(matrices)) {
    fs.writeFileSync(path.join(outDir, name), body);
  }
  console.log(`Wrote ${Object.keys(matrices).length} matrices to docs/generated`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}

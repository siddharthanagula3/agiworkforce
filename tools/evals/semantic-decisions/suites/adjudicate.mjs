// Builds labels.final.json per suite from two blind label files. A case is
// scored only where independent labellers agree; the rule is fixed before any model runs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (suite, file) => JSON.parse(readFileSync(path.join(here, suite, file), 'utf8'));
const labelsOf = (doc) => doc.labels ?? doc;
const isAmbiguous = (value) => value === 'ambiguous';

function scalar(suite) {
  const author = labelsOf(read(suite, 'labels.author.json'));
  const second = labelsOf(read(suite, 'labels.independent.json'));
  const out = {};
  for (const { id } of read(suite, 'cases.json').cases) {
    const a = String(author[id].label);
    const b = String(second[id].label);
    if (isAmbiguous(a) || isAmbiguous(b))
      out[id] = { label: null, scored: false, why: 'ambiguous' };
    else if (a !== b) out[id] = { label: null, scored: false, why: 'contested', votes: [a, b] };
    else out[id] = { label: a, scored: true };
  }
  return out;
}

function sets(suite, pick) {
  const author = labelsOf(read(suite, 'labels.author.json'));
  const second = labelsOf(read(suite, 'labels.independent.json'));
  const out = {};
  for (const { id } of read(suite, 'cases.json').cases) {
    const a = author[id].label;
    const b = second[id].label;
    if (isAmbiguous(a) || isAmbiguous(b)) {
      out[id] = { label: null, scored: false, why: 'ambiguous' };
      continue;
    }
    const left = new Set(pick(a));
    const right = new Set(pick(b));
    const core = [...left].filter((item) => right.has(item)).sort();
    const optional = [...new Set([...left, ...right])]
      .filter((item) => !core.includes(item))
      .sort();
    out[id] = { label: { core, optional, ...standing(b) }, scored: true };
  }
  return out;
}

function standing(label) {
  return Array.isArray(label?.standing_instruction)
    ? { standing: [...label.standing_instruction].sort() }
    : {};
}

function turnSignals() {
  const suite = 'turn_signals';
  const author = labelsOf(read(suite, 'labels.author.json'));
  const first = labelsOf(read(suite, 'labels.independent.json'));
  const secondPath = path.join(here, suite, 'labels.second.json');
  const second = existsSync(secondPath) ? labelsOf(read(suite, 'labels.second.json')) : null;
  const out = {};
  for (const { id } of read(suite, 'cases.json').cases) {
    const a = author[id].label;
    const b = first[id].label;
    const c = second?.[id]?.label ?? null;
    const fields = {};
    for (const key of ['needs_current_info', 'needs_external_tools', 'needs_code']) {
      fields[key] = agreed(a[key], b[key]);
    }
    fields.task_family = c
      ? agreed(b.task_family, c.task_family)
      : { scored: false, why: 'one_labeller' };
    fields.complexity4 = c
      ? ordinal(b.complexity4, c.complexity4)
      : { scored: false, why: 'one_labeller' };
    out[id] = { label: fields, scored: Object.values(fields).some((field) => field.scored) };
  }
  return out;
}

function agreed(a, b) {
  if (isAmbiguous(a) || isAmbiguous(b)) return { scored: false, why: 'ambiguous' };
  if (a !== b) return { scored: false, why: 'contested', votes: [a, b] };
  return { value: a, scored: true };
}

// Adjacent ordinal votes are both accepted; a gap of two or more is contested.
function ordinal(a, b) {
  if (isAmbiguous(a) || isAmbiguous(b)) return { scored: false, why: 'ambiguous' };
  if (Math.abs(a - b) >= 2) return { scored: false, why: 'contested', votes: [a, b] };
  return { accept: [...new Set([a, b])].sort(), scored: true };
}

const builders = {
  memory_worth_extracting: () => scalar('memory_worth_extracting'),
  review_security_gate: () => scalar('review_security_gate'),
  element_resolution: () => scalar('element_resolution'),
  connector_tool_shortlist: () => sets('connector_tool_shortlist', (label) => label),
  memory_relevance: () => sets('memory_relevance', (label) => label.relevant ?? []),
  turn_signals: turnSignals,
};

for (const [suite, build] of Object.entries(builders)) {
  const labels = build();
  const scored = Object.values(labels).filter((entry) => entry.scored).length;
  writeFileSync(
    path.join(here, suite, 'labels.final.json'),
    `${JSON.stringify({ suite, rule: 'two blind labellers must agree', labels }, null, 1)}\n`,
  );
  process.stdout.write(`${suite}: ${scored}/${Object.keys(labels).length} scored\n`);
}

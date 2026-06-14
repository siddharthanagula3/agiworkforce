#!/usr/bin/env node
// Compare recovered AUDIT_PARTS per-batch severity counts against the
// authoritative perBatch summaries stored in the workflow task outputs.
import fs from 'node:fs';

const ROOT = '/Users/siddhartha/Desktop/agiworkforce';
const T =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/9f896e2a-cf3f-477d-adda-456058f2351b/tasks';
const OUTPUTS = [
  'wdo4ystlu.output',
  'wyl7el03u.output',
  'whobo1bhl.output',
  'wv45vq5fx.output',
  'wnbupwg8o.output',
];

const expected = new Map();
for (const f of OUTPUTS) {
  const j = JSON.parse(fs.readFileSync(`${T}/${f}`, 'utf8'));
  for (const b of j.result?.perBatch || []) {
    expected.set(b.batchId, {
      c: b.critical,
      h: b.high,
      m: b.medium,
      l: b.low,
    });
  }
}

function actual(id) {
  const txt = fs.readFileSync(`${ROOT}/AUDIT_PARTS/batch-${id}.md`, 'utf8');
  const n = (s) => (txt.match(new RegExp(`^### \\[${s}\\]`, 'gm')) || []).length;
  return { c: n('CRITICAL'), h: n('HIGH'), m: n('MEDIUM'), l: n('LOW') };
}

let shortBatches = [];
for (const [id, e] of [...expected.entries()].sort()) {
  const a = actual(id);
  if (a.c !== e.c || a.h !== e.h || a.m !== e.m || a.l !== e.l) {
    shortBatches.push(id);
    console.log(
      `batch-${id}: recovered C${a.c}/H${a.h}/M${a.m}/L${a.l} vs expected C${e.c}/H${e.h}/M${e.m}/L${e.l}`,
    );
  }
}
console.log(`\nbatches with expected data: ${expected.size}; mismatched: ${shortBatches.length}`);
console.log(`mismatched ids: ${shortBatches.join(' ')}`);
// aggregate check for 001-024,026-031 (no perBatch data; expected aggregate C10/H130/M495/L383)
let agg = { c: 0, h: 0, m: 0, l: 0 };
for (let i = 1; i <= 31; i++) {
  if (i === 25) continue;
  const a = actual(String(i).padStart(3, '0'));
  agg.c += a.c;
  agg.h += a.h;
  agg.m += a.m;
  agg.l += a.l;
}
console.log(
  `aggregate 001-024,026-031: recovered C${agg.c}/H${agg.h}/M${agg.m}/L${agg.l} vs expected C10/H130/M495/L383`,
);
